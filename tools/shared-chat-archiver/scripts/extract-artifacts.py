#!/usr/bin/env python3
"""Extract artifacts from a claude.ai chat archive.

Reads a chat archive markdown file produced by the shared-chat-archiver skill
and writes each artifact (file Claude created via `create_file`, optionally
edited via `str_replace`, and eventually shown to the user via `present_files`)
as its own file in an output folder.

Usage:
  extract-artifacts.py <chat-archive.md> [--out <dir>] [--force]

  <chat-archive.md>   The chat .md file to parse.
  --out <dir>         Destination folder. Default: ../artifacts/ relative to
                      the chat file's parent.
  --force             Overwrite existing artifact files whose content differs.
                      Without --force, the script reports differing files but
                      does not modify them.

Artifact filenames use YYYY-MM-DD--source__slug.ext, where:
  - YYYY-MM-DD and source come from the chat filename (which must match the
    convention YYYY-MM-DD--source__slug.md)
  - slug is the artifact's path basename (with a leading "the-last-interface-"
    stripped, since the date+folder already establish the project)

Exit codes:
  0  Success (everything matched or wrote cleanly).
  1  At least one artifact differs from an existing file and --force was not
     passed. The new content is left in the output folder under a *.new.md
     sidecar for inspection.
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
NAME_LINE_RE = re.compile(r"^- name:\s*`?([^`\s]+)`?\s*$")
TOOL_USE_ID_LINE_RE = re.compile(r"^- id:\s*`?([^`\s]+)`?\s*$")
TOOL_USE_ID_REF_LINE_RE = re.compile(r"^- tool_use_id:\s*`?([^`\s]+)`?\s*$")
IS_ERROR_LINE_RE = re.compile(r"^- is_error:\s*(true|false)\s*$")
JSON_FENCE_OPEN_RE = re.compile(r"^```json\s*$")
FENCE_CLOSE_RE = re.compile(r"^```\s*$")


def parse_blocks(md_text: str) -> tuple[list[dict], dict[str, bool]]:
    """Walk the markdown and return:
      - ordered list of tool_use blocks: each {id, name, input, line}
      - map of tool_use_id -> is_error (from paired tool_result blocks)
    """
    lines = md_text.splitlines()
    ops: list[dict] = []
    errors: dict[str, bool] = {}

    i = 0
    while i < len(lines):
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
            ops.append({"id": tu_id, "name": name, "input": input_obj, "line": header_line})
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


def main() -> int:
    ap = argparse.ArgumentParser(description="Extract artifacts from a chat archive.")
    ap.add_argument("chat_archive", type=Path)
    ap.add_argument("--out", type=Path, default=None, help="Destination folder")
    ap.add_argument("--force", action="store_true", help="Overwrite existing differing files")
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

    presented = [(p, s) for p, s in state.items() if s.get("presented") and s.get("content") is not None]
    unpresented_with_content = [
        (p, s) for p, s in state.items() if not s.get("presented") and s.get("content") is not None
    ]
    uncreated = [(p, s) for p, s in state.items() if s.get("content") is None]

    if not presented and not uncreated:
        print("no artifacts found in this chat.", file=sys.stderr)
        return 0

    print(f"\nartifacts found:", file=sys.stderr)
    print(f"  presented (will be written): {len(presented)}", file=sys.stderr)
    print(f"  edited but never presented (skipped): {len(unpresented_with_content)}", file=sys.stderr)
    print(f"  edited without an initial create_file (cannot reconstruct): {len(uncreated)}", file=sys.stderr)

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
    for p, s in presented:
        slug = slug_from_path(p)
        ext = ext_from_path(p)
        out_name = f"{date_prefix}--{source}__{slug}{ext}"
        out_path = out_dir / out_name
        new_content = s["content"]

        if out_path.exists():
            existing = out_path.read_text(encoding="utf-8")
            if existing == new_content:
                print(f"  matches existing: {out_name}", file=sys.stderr)
                continue
            if args.force:
                out_path.write_text(new_content, encoding="utf-8")
                print(f"  overwrote (differed): {out_name}", file=sys.stderr)
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

    return 1 if any_differs else 0


if __name__ == "__main__":
    sys.exit(main())
