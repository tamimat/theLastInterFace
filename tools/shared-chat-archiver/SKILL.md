---
name: shared-chat-archiver
description: Archive a publicly-shared claude.ai conversation as a verbatim markdown transcript with full metadata (timestamps in ISO 8601, message UUIDs, threading via parent_message_uuid, input mode, stop reasons, all tool calls with inputs and results, attachments with extracted content, citations), AND extract each artifact Claude wrote during the chat (via create_file / str_replace + present_files) as its own standalone file. Use this skill whenever the user pastes or mentions a `https://claude.ai/share/` URL and wants it captured, saved, archived, exported, preserved, or downloaded — including phrasings like "archive this share link", "save this conversation URL", "extract this chat", "capture this thread into the repo", "I want a record of this conversation". Also use when the user mentions wanting an archive, log, or persistent file from a shared AI conversation even if they don't explicitly say "archive". Do NOT use for `https://claude.ai/chat/...` URLs — those require authentication and aren't shareable.
---

# claude.ai chat archiver

This skill turns a public claude.ai share URL into two kinds of output:

1. A single comprehensive markdown file containing the full conversation transcript with metadata (the chat archive).
2. One standalone file per artifact Claude produced inside the chat — anything Claude wrote via `create_file`, edited via `str_replace`, and showed the user via `present_files`.

The reason it exists: claude.ai's share renderer hides almost all metadata. Timestamps only appear on hover (rendered via a Radix UI tooltip that lazy-mounts the time string when you mouse over it), per-message UUIDs aren't shown at all, and tool calls Claude made during the chat are flattened into prose. The data is in the page, but it lives in React component props rather than the rendered DOM. The bundled `scripts/extractor.js` walks the React fiber tree to pull everything out into a markdown file; `scripts/extract-artifacts.py` then parses that file to recover every artifact Claude wrote during the chat.

## When to invoke this skill

Trigger on any user request that combines (a) a `https://claude.ai/share/<uuid>` URL or a clear reference to one, with (b) intent to save / archive / preserve / capture / extract / export the conversation. Examples of phrasings:

- "Here's a claude.ai share link — archive it"
- "Save this chat to my repo: https://claude.ai/share/..."
- "I want this conversation preserved as a markdown file"
- "Pull this into the archive folder"
- "Export this thread"
- "Capture the full content of this conversation including timestamps"

If the URL is `claude.ai/chat/...` instead of `claude.ai/share/...`, the page requires authentication and the share data isn't exposed. Tell the user to click the Share button on the conversation in claude.ai, make it public, and send the resulting `/share/` URL instead.

## What this skill produces

### Primary output: the chat archive

A single `.md` file with this shape:

```markdown
# {conversation title}

- Source: https://claude.ai/share/{uuid}
- Conversation span: {first message ISO 8601 local} to {last message ISO 8601 local}
- Local timezone: {IANA timezone}
- Message count: {N} ({user} user, {assistant} assistant)
- Schema note: ...

---

--- {YYYY-MM-DD} ---

## User — {ISO 8601 local}

- uuid: `{uuid}`
- index: {N}
- sender: human
- parent_message_uuid: `{uuid or 00000000-...}`
- created_at_utc: `{ISO with .Z}`
- updated_at_utc: `{ISO}` (edited / no edit)
- input_mode: text | retry | speech_input
- truncated: false
- stop_reason: ...
- image_count: {N}
- file_count: {N}
- attachments: {N}  ← if any

### Attachments  ← if any

#### Attachment 1
- id: ...
- file_name: ...
- file_type: ...
- file_size: ... bytes
- attachment_created_at_utc: ...
##### extracted_content
```
...full extracted text...
```

### Content

[1] text
{message text verbatim}

[2] tool_use
- id: ...
- name: ...
- integration_name: ...
input:
```json
{...}
```

[3] tool_result
- tool_use_id: ...
- is_error: false
content:
```
{result content}
```

---
```

ISO 8601 timestamps with the user's local offset (e.g. `2026-05-20T07:00:54+02:00`), plain-text date dividers between calendar days, no emojis. Filename convention: `YYYY-MM-DD--claudeai__short-slug.md` where the date is the first message's local-time day.

### Secondary output: extracted artifacts

After the chat archive is in place, `scripts/extract-artifacts.py` parses it and writes one file per artifact Claude produced during the conversation. An "artifact" here is any path that Claude (a) created via `create_file`, (b) optionally edited via one or more `str_replace` operations, and (c) eventually showed the user via `present_files`. Failed tool calls (those whose paired `tool_result` has `is_error: true`) are silently skipped during replay, but counted in the artifact's front matter so the dead end stays visible.

Each artifact gets a date-prefixed filename: `YYYY-MM-DD--claudeai__<slug>.<ext>`, where date and source come from the chat archive's filename and `<slug>` is the artifact path's basename. The destination defaults to `<repo>/artifacts/` (sibling of `<repo>/chats/`).

Each artifact also gets a YAML front matter block at the top describing how it was produced:

```yaml
---
source_chat: 2026-05-22--claudeai__heartbeat-as-biometric-identifier.md
source_path: /mnt/user-data/outputs/the-last-interface-notes-v2.md
created_in_chat: 2026-05-22T15:59:37+02:00
tool_sequence:
  create_file: 1
  str_replace_succeeded: 3
  str_replace_failed: 1
  present_files: 3
extraction_method: automatic
---
```

The front matter is generated deterministically — running the script again on the same chat produces byte-identical front matter, and the script's idempotency logic compares bodies (not front matter) when checking whether a file has changed. Manual extractions (where the script could not reconstruct an artifact) are written with `extraction_method: manual` and a `seed_from:` field, and the script never overwrites them.

What the artifact extractor cannot reconstruct:

- Artifacts edited via `str_replace` on a path that was never `create_file`'d. This happens with the view-then-edit-then-bash-cp pattern (Claude views an existing project file, edits a copy in `/home/claude/`, then `bash` copies the result to outputs). The script reports these as needing manual extraction.
- Artifacts written but never `present_files`'d. These are treated as temporary working files and skipped.

### Side effect: artifact bodies are stripped from the chat archive

By default, after each artifact is extracted, `extract-artifacts.py` post-processes the chat archive in place: each `create_file` tool_use's `file_text` field is replaced with a short reference pointer, so the body lives only in `/artifacts/` and not duplicated inside the chat. The original chat archive remains structurally complete — the tool_use call is still there, with all its metadata, the description, the path, and the success/failure tool_result — but the body of the artifact is no longer embedded.

A stripped chat carries this kind of marker in the JSON instead of the full body:

```json
{
  "description": "Write the extended notes file with cardiac spine, seed, bridge, and chapter spine woven in",
  "path": "/mnt/user-data/outputs/the-last-interface-notes-v2.md",
  "file_text": "[artifact body extracted to artifacts/2026-05-22--claudeai__notes-v2.md]"
}
```

The script is idempotent: a chat that has already been stripped is detected and left alone. Pass `--keep-chat-bodies` to opt out and preserve the chat as-archived. The verbatim option exists for cases where the chat archive needs to be self-contained (e.g., shared without the artifact files), but the default favors lean storage and a single source of truth per artifact.

## How to execute the workflow

### Step 1 — Verify the URL

Check the URL matches `https://claude.ai/share/<uuid>` (the `/share/` segment is critical — `/chat/` URLs require login and won't work). If the user sent the wrong format, ask them to use the Share button on claude.ai to generate a public link.

### Step 2 — Get a browser tab ready

This skill requires the Claude in Chrome browser tools because claude.ai is fully client-rendered (a plain HTTP fetch returns an empty React shell). Use `mcp__Claude_in_Chrome__list_connected_browsers` to confirm a browser is connected. If no browser is connected, ask the user to install/connect the Claude in Chrome extension before proceeding.

Then create or reuse a tab via `mcp__Claude_in_Chrome__tabs_context_mcp` (with `createIfEmpty: true` if no tab group exists). Note the `tabId` for subsequent calls.

### Step 3 — Navigate to the share URL

Use `mcp__Claude_in_Chrome__navigate` with the share URL and the tab ID. Wait a moment for the React app to render — usually a second or two is enough since the share page is static once rendered.

### Step 4 — Run the extractor

Read `scripts/extractor.js` (in this skill's `scripts/` folder) and execute its contents via `mcp__Claude_in_Chrome__javascript_tool` with `action: "javascript_exec"` and the `tabId`. The script:

1. Locates the conversation container (a div with many children, each containing an `<h2 class="sr-only">` speaker label)
2. For each message child, walks the React fiber upward via `__reactFiber$<random>` → `.return` parents until it finds a `memoizedProps.message` object with `created_at`
3. Serializes all message metadata + the content array (preserving order of text, tool_use, and tool_result blocks)
4. Builds a Blob, triggers a synthetic `<a>` download, and stashes the markdown on `window.__archiveContent`
5. Returns `{filename, length, messageCount}`

The download lands in the user's `~/Downloads/` folder.

### Step 5 — Place the file

The download isn't directly visible from the Cowork sandbox. Either:

- Tell the user to run `mv ~/Downloads/{filename}.md {destination}/` themselves; or
- If `~/Downloads` is mounted as a connected folder in the current Cowork session, move the file using bash.

Default destination is wherever the user's archive folder is for chat transcripts. If they haven't specified one and have a project repo open, suggest `<repo>/chats/` (matching the secondary output destination of `<repo>/artifacts/`) and let them confirm.

### Step 6 — Extract artifacts

After the chat archive is placed, run `scripts/extract-artifacts.py` against it:

```
python3 scripts/extract-artifacts.py <path-to-chat-archive.md>
```

By default, artifacts are written to `../artifacts/` relative to the chat archive's parent (i.e., the sibling folder of `<repo>/chats/`). Pass `--out <dir>` to override.

For each presented artifact, the script either:
- writes a new file (reported as "wrote new: …"),
- recognizes a byte-identical match (reported as "matches existing: …"),
- or, if a file already exists at the target name with different content, writes the new version to a `.new` sidecar and reports "DIFFERS from existing." Pass `--force` to overwrite.

If the chat had no `create_file` / `str_replace` / `present_files` activity, the script reports "no artifacts found" and exits cleanly. This is the expected outcome for chats that produced no deliverables.

Surface any "edited without an initial create_file" report to the user — those represent artifacts the script cannot reconstruct (view-then-edit-then-bash-cp pattern) and need manual extraction.

### Step 7 — Verify

After placement, confirm the chat file exists and report what was captured:

- Size (bytes / lines)
- Message count (user / assistant breakdown)
- Conversation span (start → end ISO 8601 local)
- Notable counts: tool calls, attachments, edits, voice-input messages, user_canceled responses

Also report what the artifact extractor produced in Step 6 (how many artifacts were new vs. matched existing, any that needed manual extraction).

## Important context for the extractor

### Why React fiber walking is necessary

Per-message timestamps, UUIDs, and tool call structure are not in the rendered DOM. They live in React props. The data model on the share page mirrors what's at `https://api.anthropic.com` internally — each message is an object with `uuid`, `index`, `sender`, `created_at`, `updated_at`, `parent_message_uuid`, `input_mode`, `truncated`, `stop_reason`, `image_count`, `file_count`, `attachments[]`, `files[]`, `content[]`, and `compaction_summary`. The script accesses this object through the React internal property `__reactFiber$<random>` on the DOM node — walking up the fiber's `.return` chain until it finds a fiber whose `memoizedProps.message.created_at` is set.

The selectors used as DOM anchors (the `<h2 class="sr-only">` speaker label, the container div with many children) are claude.ai-specific and may break if their share page is redesigned. The fiber walking itself relies on React's internal property naming, which is stable across versions but not part of React's public API.

### What can't be captured

- **Image/file binary blobs** — claude.ai's share renderer strips them; only metadata (filename, type, size) is preserved
- **The owning user's account info** — no IP, no geolocation, no email. The browser's `Intl.DateTimeFormat().resolvedOptions().timeZone` is the closest proxy to "where the user was" and is captured in the header.

### Content type dispatch in the extractor

Each item in a message's `content[]` array has a `type`:

- `text` — straightforward text body; may carry a `citations[]` array if Claude cited search results or attached docs
- `tool_use` — Claude calling a tool; carries `id`, `name`, optional `integration_name`/`mcp_server_url`/`is_mcp_app`, and the full `input` JSON
- `tool_result` — the response to a tool_use; carries `tool_use_id` (links back to the call), `content`, `is_error`, `structured_content`, `display_content`, `meta`
- Anything else — fall back to dumping the content item as JSON

See `references/data-structure.md` for the complete catalogue of fields per message and per content item, plus example values for each field.

## Edge cases and recovery

- **Container not found** — the page hasn't fully rendered. Wait a beat and re-run, or check if claude.ai's share-page DOM has been redesigned.
- **Zero messages found** — same root cause. Also check that the URL was a `/share/` URL, not `/chat/`.
- **Download blocked / no download appeared** — the synthetic-link click may have been blocked by the browser. The script also stashes the content on `window.__archiveContent`, so a follow-up `javascript_exec` can read it and the caller can save the file by a different path.
- **Multiple files with `(1).md`, `(2).md` suffixes** — happens when re-running the same share URL because the browser doesn't overwrite. Tell the user to `mv -f ~/Downloads/<base>*.md <destination>/<base>.md` to overwrite, or move old versions to a `_superseded/` subfolder if they want a history.

## A note on emojis

Don't put emojis in the output file — including in the date dividers. The extractor uses plain text `--- YYYY-MM-DD ---`. Some users archive transcripts into git repos and emojis create unwanted visual noise in code-style contexts.
