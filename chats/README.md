# Chat Archive

Verbatim transcripts of conversations that contributed to *theLastInterface*. This folder is the paper trail for the **book's content** — the discussions where the ideas, structure, and prose were worked out. The artifact files Claude wrote during these chats live in `/artifacts/`.

Operational conversations (file moves, git setup, archiver design, README edits) do **not** live here. They're not book content; the lessons from them are absorbed into memory and into the project structure itself, and the transcripts are skipped by the weekly archiver.

## Naming convention

```
YYYY-MM-DD--source__short-slug.md
```

- **YYYY-MM-DD** — the date the conversation started (so files sort chronologically by filename alone)
- **source** — which surface the chat happened on:
  - `claudeai` — claude.ai web
  - `cowork` — Claude desktop app (Cowork mode)
  - `codex` — OpenAI Codex / ChatGPT (if applicable)
- **short-slug** — a few words describing the topic (kebab-case)

## How chats get into this folder

### Cowork sessions — weekly classifier (Saturdays)

A scheduled task (`archive-thelastinterface-cowork-sessions`) runs Saturday mornings. For each theLastInterface-tagged Cowork session, it decides one of three things:

- **book-content** → writes the transcript to `/chats/` (here)
- **operational** → skips the transcript entirely, logs one line to `/_review/skip-log.md`
- **ambiguous** → writes to `/_review/` for manual triage

The classifier defaults to inclusion when in doubt — false positives in `/_review/` cost 30 seconds to delete; false negatives in the skip log could lose a book conversation. The original session always remains in Cowork's session store regardless of routing, so misclassifications are recoverable.

Note: Cowork's `session_info` API exposes a thinner transcript than the claude.ai archiver — verbatim message text and tool-use summaries, but no per-message timestamps, UUIDs, threading metadata, or full tool-call inputs/outputs. The transcripts are good narrative records of what was discussed; they are not forensic-grade dumps.

### claude.ai web chats — manual via share link

There's no API for claude.ai web chats, so they're sent in by hand:

1. Open the conversation on claude.ai
2. Click **Share** (top right) → make the link public
3. Paste the URL into a Cowork session and ask Claude to "archive this chat for theLastInterface"

The `shared-chat-archiver` skill fetches the transcript, converts it to markdown, and drops it here with the right filename. As part of the same run, any artifacts Claude wrote during the chat are extracted into `/artifacts/` with `YYYY-MM-DD--source__slug.ext` filenames matching the chat they came from.

Claude.ai transcripts are deeper than Cowork ones — they include ISO 8601 per-message timestamps, message UUIDs, parent-message threading, input mode, stop reasons, full tool call inputs and results, attachments, and citations.

## Relationship to /artifacts/

The chats record the *discussion*. The artifacts record *what Claude wrote* during that discussion. Each artifact file carries a YAML front matter block pointing back to the chat it came from, so the pairing is recoverable from either direction.

Once an artifact has been extracted to `/artifacts/`, its body is no longer duplicated inside the chat archive. The chat keeps the structural record of what happened (the `create_file` tool_use call is still present, with its path, description, and result), but the body is replaced with a short reference like:

```json
"file_text": "[artifact body extracted to artifacts/2026-05-20--claudeai__manifesto.md]"
```

This keeps the chat archives readable and prevents the same content from existing in two places. If you ever want a chat that includes the bodies inline (e.g., for sharing without `/artifacts/` alongside), the archiver supports a `--keep-chat-bodies` flag.

## What this folder is not

This is not the book. The book is in `/spine/`. This folder is the record of conversations that shaped the spine and the artifacts — read these when you want to know *why* a section reads the way it does, what was discussed and rejected, or which decisions still have open threads.
