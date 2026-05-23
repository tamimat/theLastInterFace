#!/usr/bin/env python3
"""Extract artifacts from a claude.ai chat archive.

Reads a chat archive markdown file produced by the shared-chat-archiver skill
and writes each artifact (file Claude created via `create_file`, optionally
edited via `str_replace`, and eventually shown to the user via `present_files`)
as its own file in an output folder.

Each artifact is written with a YAML front matter block describing how it
was produced — source chat, the chat-message timestamp where it was created,
counts of how many create_file/str_replace/present_files calls touched it,
including failed str_replace attempts that the chat retried. The front matter
makes each artifact self-describing as a record of process.

Usage:
  extract-artifacts.py <chat-archive.md> [--out <dir>] [--force]

  <chat-archive.md>   The chat .md file to parse.
  --out <dir>         Destination folder. Default: ../artifacts/ relative to
                      the chat file's parent.
  --force             Overwrite existing artifact files whose body differs.
                      Without --force, the script reports differing files but
                      does not modify them.

Artifact filenames use YYYY-MM-DD--source__slug.ext, where:
  - YYYY-MM-DD and source come from the chat filename (which must match the
    convention YYYY-MM-DD--source__slug.md)
  - slug is the artifact's path basename (with a leading "the-last-interface-"
    stripped, since the date+folder already establish the project)

Idempotency rules:
  - Front matter is compared separately from body. If the body matches but
    the front matter has drifted (e.g., script schema updated), the front
    matter is refreshed in place.
  - Existing artifacts whose front matter says `extraction_method: manual`
    are never touched — manual extractions (for chats with view-then-bash-cp
    patterns the script can't auto-reconstruct) are preserved verbatim.

Exit codes:
  0  Success (everything matched, refreshed, or wrote cleanly).
  1  At least one artifact's body differs from an existing file and --force
     was not passed. The new content is left in the output folder under a
     *.new sidecar for inspection.
  2  Usage error (bad arguments, missing input file).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Iterable

CHAT_FILENAME_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})--([a-zA-Z]+)__.+\.md$")
TOOL_USE_HEADER_RE = re.compile(r"^\[\d+\]\s+tool_use\s*$")
TOOL_RESULT_HEADER_RE = re.compile(r"^\[\d+\]\s+tool_result\s*$")
MESSAGE_HEADER_RE = re.compile(r"^## (?:Claude|User) — (.+?)\s*$")
NAME_LINE_RE = re.compile(r"^- name:\s*`?([^`\s]+)`?\s*$")
TOOL_USE_ID_LINE_RE = re.compile(r"^- id:\s*`?([^`\s]+)`?\s*$")
TOOL_USE_ID_REF_LINE_RE = re.compile(r"^- tool_use_id:\s*`?([^`\s]+)`?\s*$")
IS_ERROR_LINE_RE = re.compile(r"^- is_error:\s*(true|false)\s*$")
JSON_FENCE_OPEN_RE = re.compile(r"^```json\s*$")
FENCE_CLOSE_RE = re.compile(r"^```\s*$")

FRONTMATTER_DELIM = "---"

# When a chat archive has been post-processed to strip artifact bodies out (so
# the body lives only in /artifacts/, not duplicated in the chat), the
# `file_text` field on each create_file tool_use is replaced with a short
# reference of this form. The script detects this marker and skips the body
# replay — the artifact file on disk is the source of truth.
STRIPPED_BODY_MARKER = "[artifact body extracted to "


def parse_blocks(md_text: str) -> tuple[list[dict], dict[str, bool]]:
    """Walk the markdown and return:
      - ordered list of tool_use blocks: each {id, name, input, line, message_ts}
      - map of tool_use_id -> is_error (from paired tool_result blocks)

    `message_ts` is the ISO 8601 timestamp from the enclosing "## Claude — <ts>"
    or "## User — <ts>" header — useful for attributing artifact creation to a
    moment in the chat.
    """
    lines = md_text.splitlines()
    ops: list[dict] = []
    errors: dict[str, bool] = {}
    current_ts: str | None = None

    i = 0
    while i < len(lines):
        # Track most-recent message header timestamp.
        mh = MESSAGE_HEADER_RE.match(lines[i])
        if mh:
            current_ts = mh.group(1).strip()
            i += 1
            continue

        if TOOL_USE_HEADER_RE.match(lines[i]):
            header_line = i + 1
            tu_id: str | None = None
            name: str | None = None
            input_obj: dict | None = None
            j = i + 1
            while j < len(lines) and j - i < 400:
                ln = lines[j]
                if TOOL_USE_HEADER_RE.match(ln) or TOOL_RESULT_HEADER_RE.match(ln):
                    break
                if ln.strip() == "---":
                    break
                if tu_id is None:
                    m = TOOL_USE_ID_LINE_RE.match(ln)
                    if m:
                        tu_id = m.group(1)
                        j += 1
                        continue
                if name is None:
                    m = NAME_LINE_RE.match(ln)
                    if m:
                        name = m.group(1)
                        j += 1
                        continue
                if ln.strip() == "input:" and j + 1 < len(lines) and JSON_FENCE_OPEN_RE.match(lines[j + 1]):
                    body_lines: list[str] = []
                    k = j + 2
                    while k < len(lines) and not FENCE_CLOSE_RE.match(lines[k]):
                        body_lines.append(lines[k])
                        k += 1
                    body = "\n".join(body_lines)
                    try:
                        input_obj = json.loads(body)
                    except json.JSONDecodeError as exc:
                        print(
                            f"  warn: tool_use at line {header_line}: input JSON parse failed ({exc.msg}), skipping",
                            file=sys.stderr,
                        )
                    j = k + 1
                    break
                j += 1
            ops.append({
                "id": tu_id,
                "name": name,
                "input": input_obj,
                "line": header_line,
                "message_ts": current_ts,
            })
            i = max(j, i + 1)
            continue

        if TOOL_RESULT_HEADER_RE.match(lines[i]):
            ref_id: str | None = None
            is_error: bool | None = None
            j = i + 1
            while j < len(lines) and j - i < 100:
                ln = lines[j]
                if TOOL_USE_HEADER_RE.match(ln) or TOOL_RESULT_HEADER_RE.match(ln):
                    break
                if ln.strip() == "---":
                    break
                if ref_id is None:
                    m = TOOL_USE_ID_REF_LINE_RE.match(ln)
                    if m:
                        ref_id = m.group(1)
                if is_error is None:
                    m = IS_ERROR_LINE_RE.match(ln)
                    if m:
                        is_error = (m.group(1) == "true")
                if ref_id is not None and is_error is not None:
                    break
                j += 1
            if ref_id is not None and is_error is not None:
                errors[ref_id] = is_error
            i = max(j, i + 1)
            continue

        i += 1

    return ops, errors


def collect_per_path_stats(ops: Iterable[dict], errors: dict[str, bool]) -> dict[str, dict]:
    """Count how each path was touched: create_file, str_replace (succeeded
    and failed), present_files. Captures the first create_file's message_ts
    as `created_in_chat`.

    Counts both successful and failed operations so the front matter can
    reflect the full process, including dead ends.
    """
    stats: dict[str, dict] = {}

    def get(p: str) -> dict:
        if p not in stats:
            stats[p] = {
                "create_file": 0,
                "str_replace_succeeded": 0,
                "str_replace_failed": 0,
                "present_files": 0,
                "created_in_chat": None,
            }
        return stats[p]

    for op in ops:
        name = op.get("name")
        inp = op.get("input")
        tu_id = op.get("id")
        if not isinstance(inp, dict):
            continue
        failed = tu_id is not None and errors.get(tu_id) is True

        if name == "create_file":
            p = inp.get("path")
            if isinstance(p, str):
                s = get(p)
                if not failed:
                    s["create_file"] += 1
                    if s["created_in_chat"] is None and op.get("message_ts"):
                        s["created_in_chat"] = op["message_ts"]
        elif name == "str_replace":
            p = inp.get("path")
            if isinstance(p, str):
                s = get(p)
                if failed:
                    s["str_replace_failed"] += 1
                else:
                    s["str_replace_succeeded"] += 1
        elif name == "present_files":
            paths = inp.get("filepaths") or []
            for p in paths:
                if isinstance(p, str):
                    get(p)["present_files"] += 1

    return stats


def replay_artifacts(ops: Iterable[dict], errors: dict[str, bool]) -> dict[str, dict]:
    """Replay create_file + str_replace + present_files to determine final
    content per artifact path. Only paths that were eventually present_files'd
    are returned (others are temporary working files).

    `errors` maps tool_use_id -> is_error. str_replace and create_file ops
    whose paired tool_result indicates is_error=true are skipped silently
    (they failed in the original chat too).
    """
    state: dict[str, dict] = {}

    for op in ops:
        name = op.get("name")
        inp = op.get("input")
        tu_id = op.get("id")
        if not isinstance(inp, dict):
            continue
        if tu_id is not None and errors.get(tu_id) is True:
            # Tool call failed in the original chat — skip silently.
            continue

        if name == "create_file":
            p = inp.get("path")
            ft = inp.get("file_text")
            if isinstance(p, str) and isinstance(ft, str):
                # If the chat archive was post-processed to strip artifact bodies
                # out, mark this path as "stripped" — the body is not in the chat
                # anymore, but the artifact file on disk is canonical.
                if ft.startswith(STRIPPED_BODY_MARKER):
                    state[p] = {"content": None, "presented": False, "edits": 0, "stripped": True}
                else:
                    state[p] = {"content": ft, "presented": False, "edits": 0}

        elif name == "str_replace":
            p = inp.get("path")
            old = inp.get("old_str")
            new = inp.get("new_str")
            if not isinstance(p, str) or not isinstance(old, str) or not isinstance(new, str):
                continue
            if p not in state:
                # Edit on a path that was never created via create_file.
                # We can't reconstruct without the original content; flag it.
                state[p] = {
                    "content": None,
                    "presented": False,
                    "edits": 1,
                    "uncreated": True,
                }
                continue
            if state[p].get("content") is None:
                state[p]["edits"] += 1
                continue
            content = state[p]["content"]
            if old in content:
                state[p]["content"] = content.replace(old, new, 1)
                state[p]["edits"] += 1
            else:
                # Should be rare now that we filter out is_error=true ops;
                # this represents a real divergence between our state and
                # the chat's actual file. Worth surfacing.
                print(
                    f"  warn: str_replace old_str not found for {p} at line {op['line']} — edit skipped"
                    f" (state may have diverged from chat)",
                    file=sys.stderr,
                )

        elif name == "present_files":
            paths = inp.get("filepaths") or []
            for p in paths:
                if isinstance(p, str) and p in state:
                    state[p]["presented"] = True

    return state


def slug_from_path(path: str) -> str:
    name = Path(path).stem
    if name.startswith("the-last-interface-"):
        name = name[len("the-last-interface-"):]
    return name


def ext_from_path(path: str) -> str:
    return Path(path).suffix or ".md"


def split_frontmatter(text: str) -> tuple[str | None, str]:
    """Return (frontmatter_text, body). frontmatter_text is the YAML between
    the leading `---` lines, without the delimiters. None if no front matter.

    Consumes one optional blank line between the closing `---` and the body,
    so that the body returned is what comes after the conventional
    "front matter + blank line" preamble."""
    delim = FRONTMATTER_DELIM + "\n"
    if not text.startswith(delim):
        return None, text
    end = text.find("\n" + FRONTMATTER_DELIM + "\n", len(delim))
    if end == -1:
        return None, text
    body_start = end + len("\n" + FRONTMATTER_DELIM + "\n")
    # Consume one optional blank line after the closing delim.
    if text[body_start:body_start + 1] == "\n":
        body_start += 1
    return text[len(delim):end], text[body_start:]


def strip_artifact_bodies_in_chat(
    md_text: str,
    extracted: dict[str, Path],
    out_dir: Path,
) -> tuple[str, int]:
    """Walk the chat archive markdown and replace each `create_file` tool_use's
    `file_text` field with a short reference pointer to the extracted artifact.

    `extracted` maps the source path (as it appears in the chat, e.g.
    `/mnt/user-data/outputs/X.md`) to the local artifact `Path` that holds
    its body. `out_dir` is used to compute the reference (relative to the
    chat archive's parent, so the pointer looks like `artifacts/...`).

    Returns (modified_text, count_of_bodies_stripped). Idempotent: if a body
    is already replaced with the marker, it is left alone.
    """
    lines = md_text.splitlines()
    count = 0
    i = 0
    while i < len(lines):
        if not TOOL_USE_HEADER_RE.match(lines[i]):
            i += 1
            continue

        # Look ahead for the name line and the input JSON block.
        is_create_file = False
        name_line_seen = False
        for j in range(i + 1, min(i + 20, len(lines))):
            if NAME_LINE_RE.match(lines[j]):
                name_line_seen = True
                if "create_file" in lines[j]:
                    is_create_file = True
                break
            if TOOL_USE_HEADER_RE.match(lines[j]) or TOOL_RESULT_HEADER_RE.match(lines[j]):
                break
        if not is_create_file:
            i += 1
            continue

        # Find the `input:` line and the fenced JSON block.
        json_start = None
        json_end = None
        for j in range(i + 1, min(i + 30, len(lines))):
            if lines[j].strip() == "input:" and j + 1 < len(lines) and JSON_FENCE_OPEN_RE.match(lines[j + 1]):
                json_start = j + 2
                k = json_start
                while k < len(lines) and not FENCE_CLOSE_RE.match(lines[k]):
                    k += 1
                json_end = k
                break
            if TOOL_USE_HEADER_RE.match(lines[j]) or TOOL_RESULT_HEADER_RE.match(lines[j]):
                break
        if json_start is None or json_end is None:
            i += 1
            continue

        # Parse, modify, re-serialize.
        body = "\n".join(lines[json_start:json_end])
        try:
            obj = json.loads(body)
        except json.JSONDecodeError:
            i = json_end + 1
            continue

        ft = obj.get("file_text")
        if not isinstance(ft, str):
            i = json_end + 1
            continue
        if ft.startswith(STRIPPED_BODY_MARKER):
            # Already stripped; skip.
            i = json_end + 1
            continue

        src_path = obj.get("path", "")
        artifact_path = extracted.get(src_path)
        if artifact_path is None:
            # We didn't extract this artifact, so don't strip.
            i = json_end + 1
            continue

        # Reference is relative to the chat file's parent (so from /chats/,
        # the pointer reads "artifacts/2026-05-20--claudeai__manifesto.md").
        try:
            relative = artifact_path.relative_to(out_dir.parent)
        except ValueError:
            relative = artifact_path
        obj["file_text"] = f"{STRIPPED_BODY_MARKER}{relative}]"
        new_json = json.dumps(obj, indent=2, ensure_ascii=False)
        lines[json_start:json_end] = new_json.splitlines()
        count += 1
        # Advance past the new block — the rewritten JSON may be shorter, so
        # recompute end position.
        i = json_start + len(new_json.splitlines()) + 1

    return ("\n".join(lines) + ("\n" if md_text.endswith("\n") else ""), count)


def render_frontmatter(
    source_chat_name: str,
    path: str,
    stats: dict,
    extraction_method: str = "automatic",
) -> str:
    """Render a small YAML front matter block describing how this artifact
    was produced. Deterministic output for a given chat — re-running the
    script on the same chat produces byte-identical front matter, so the
    artifact stays idempotent across runs."""
    lines = [
        FRONTMATTER_DELIM,
        f"source_chat: {source_chat_name}",
        f"source_path: {path}",
    ]
    created = stats.get("created_in_chat")
    if created:
        lines.append(f"created_in_chat: {created}")
    lines.append("tool_sequence:")
    lines.append(f"  create_file: {stats.get('create_file', 0)}")
    lines.append(f"  str_replace_succeeded: {stats.get('str_replace_succeeded', 0)}")
    lines.append(f"  str_replace_failed: {stats.get('str_replace_failed', 0)}")
    lines.append(f"  present_files: {stats.get('present_files', 0)}")
    lines.append(f"extraction_method: {extraction_method}")
    lines.append(FRONTMATTER_DELIM)
    lines.append("")  # blank line after front matter
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description="Extract artifacts from a chat archive.")
    ap.add_argument("chat_archive", type=Path)
    ap.add_argument("--out", type=Path, default=None, help="Destination folder")
    ap.add_argument("--force", action="store_true", help="Overwrite existing differing files")
    ap.add_argument(
        "--keep-chat-bodies",
        action="store_true",
        help="Don't strip artifact bodies from the chat archive after extraction. "
        "By default, each create_file's file_text is replaced with a reference "
        "to the extracted artifact, so the body lives only in /artifacts/.",
    )
    args = ap.parse_args()

    chat_path: Path = args.chat_archive.resolve()
    if not chat_path.is_file():
        print(f"error: not a file: {chat_path}", file=sys.stderr)
        return 2

    m = CHAT_FILENAME_RE.match(chat_path.name)
    if not m:
        print(
            f"error: chat filename {chat_path.name!r} does not match "
            f"YYYY-MM-DD--source__slug.md — rename it before extracting",
            file=sys.stderr,
        )
        return 2

    date_prefix, source = m.group(1), m.group(2)

    if args.out is not None:
        out_dir = args.out.resolve()
    else:
        out_dir = (chat_path.parent.parent / "artifacts").resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    md_text = chat_path.read_text(encoding="utf-8")
    ops, errors = parse_blocks(md_text)
    print(f"parsed {len(ops)} tool_use blocks from {chat_path.name}", file=sys.stderr)

    state = replay_artifacts(ops, errors)
    per_path_stats = collect_per_path_stats(ops, errors)

    presented = [(p, s) for p, s in state.items() if s.get("presented") and s.get("content") is not None]
    unpresented_with_content = [
        (p, s) for p, s in state.items() if not s.get("presented") and s.get("content") is not None
    ]
    uncreated = [
        (p, s) for p, s in state.items()
        if s.get("content") is None and not s.get("stripped")
    ]
    stripped = [(p, s) for p, s in state.items() if s.get("stripped")]

    if not presented and not uncreated and not stripped:
        print("no artifacts found in this chat.", file=sys.stderr)
        return 0

    print(f"\nartifacts found:", file=sys.stderr)
    print(f"  presented (will be written): {len(presented)}", file=sys.stderr)
    print(f"  edited but never presented (skipped): {len(unpresented_with_content)}", file=sys.stderr)
    print(f"  edited without an initial create_file (cannot reconstruct): {len(uncreated)}", file=sys.stderr)
    print(f"  body already stripped from chat (canonical copy lives in /artifacts/): {len(stripped)}", file=sys.stderr)

    if stripped:
        print(
            "\n  note: these paths had their body stripped from the chat archive.",
            file=sys.stderr,
        )
        for p, _ in stripped:
            print(f"    {p}", file=sys.stderr)
        print(
            "  the artifact files on disk are the source of truth. nothing to write.",
            file=sys.stderr,
        )

    if uncreated:
        print(
            "\n  note: these paths had str_replace edits but no create_file:",
            file=sys.stderr,
        )
        for p, s in uncreated:
            print(f"    {p}  ({s['edits']} edit(s))", file=sys.stderr)
        print(
            "  these typically come from a view-then-edit-then-bash-cp pattern. "
            "extract manually from the chat if needed.",
            file=sys.stderr,
        )

    any_differs = False
    extracted_paths: dict[str, Path] = {}  # source path -> local artifact path
    for p, s in presented:
        slug = slug_from_path(p)
        ext = ext_from_path(p)
        out_name = f"{date_prefix}--{source}__{slug}{ext}"
        out_path = out_dir / out_name
        extracted_paths[p] = out_path
        new_body = s["content"]
        new_frontmatter = render_frontmatter(
            source_chat_name=chat_path.name,
            path=p,
            stats=per_path_stats.get(p, {}),
            extraction_method="automatic",
        )
        new_content = new_frontmatter + new_body

        if out_path.exists():
            existing = out_path.read_text(encoding="utf-8")
            existing_fm, existing_body = split_frontmatter(existing)

            # If the existing file was hand-extracted (extraction_method: manual),
            # do not touch it — preserve the manual version verbatim.
            if existing_fm and "extraction_method: manual" in existing_fm:
                print(f"  skipped (manual extraction): {out_name}", file=sys.stderr)
                continue

            if existing_body == new_body:
                if existing == new_content:
                    print(f"  matches existing: {out_name}", file=sys.stderr)
                else:
                    # Body identical, front matter changed (likely a schema
                    # update). Refresh front matter in place — body is preserved.
                    out_path.write_text(new_content, encoding="utf-8")
                    print(f"  refreshed front matter: {out_name}", file=sys.stderr)
                continue

            if args.force:
                out_path.write_text(new_content, encoding="utf-8")
                print(f"  overwrote (body differed): {out_name}", file=sys.stderr)
            else:
                sidecar = out_path.with_name(out_path.name + ".new")
                sidecar.write_text(new_content, encoding="utf-8")
                print(
                    f"  DIFFERS from existing: {out_name}\n"
                    f"    new content written alongside as {sidecar.name}; pass --force to overwrite",
                    file=sys.stderr,
                )
                any_differs = True
        else:
            out_path.write_text(new_content, encoding="utf-8")
            print(f"  wrote new: {out_name}", file=sys.stderr)

    # Post-process: strip artifact bodies out of the chat archive so they live
    # only in /artifacts/. Idempotent: already-stripped bodies are left alone.
    if not args.keep_chat_bodies and extracted_paths:
        modified_text, count = strip_artifact_bodies_in_chat(
            md_text, extracted_paths, out_dir
        )
        if count > 0:
            chat_path.write_text(modified_text, encoding="utf-8")
            print(
                f"\nstripped {count} artifact body(ies) from {chat_path.name}; "
                f"bodies now live only in {out_dir.name}/",
                file=sys.stderr,
            )

    return 1 if any_differs else 0


if __name__ == "__main__":
    sys.exit(main())
