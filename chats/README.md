# Chat Archive

Verbatim transcripts of conversations that contributed to *theLastInterface*. This folder is the paper trail; the artifact files Claude wrote during these chats live in `/artifacts/`.

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

**Cowork sessions** — Archived automatically by a scheduled task that runs weekly (Sundays). It scans recent sessions, identifies theLastInterface-related ones, and writes their full transcripts here. Already-archived sessions are skipped on subsequent runs.

**claude.ai web chats** — Sent in manually because there's no API. To archive one:

1. Open the conversation on claude.ai
2. Click the **Share** button (top right)
3. Make the share link public
4. Paste the URL into a Cowork session and ask Claude to "archive this chat for theLastInterface"

The transcript will be fetched, converted to markdown, and dropped here with the right filename. As part of the same run, any artifacts Claude wrote during the chat are extracted into `/artifacts/` with `YYYY-MM-DD--source__slug.ext` filenames matching the chat they came from.

## Relationship to /artifacts/

The chats record the *discussion*. The artifacts record *what Claude wrote* during that discussion. Each artifact file carries a YAML front matter block pointing back to the chat it came from, so the pairing is recoverable from either direction.

By convention, once an artifact has been extracted to `/artifacts/`, its body is no longer duplicated inside the chat archive. The chat keeps the structural record of what happened (the `create_file` tool_use call is still present, with its path, description, and result), but the body is replaced with a short reference like:

```json
"file_text": "[artifact body extracted to artifacts/2026-05-20--claudeai__manifesto.md]"
```

This keeps the chat archives readable and prevents the same content from existing in two places. If you ever want a chat that includes the bodies inline (e.g., for sharing without `/artifacts/` alongside), the archiver supports a `--keep-chat-bodies` flag.

## What this folder is not

This is not the book. It's the record of conversations that shaped the artifacts in `/artifacts/`. Read these when you want to know *why* an artifact looks the way it does, what was discussed and rejected, or which decisions still have open threads.
