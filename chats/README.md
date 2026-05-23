# Chat Archive

Verbatim transcripts of conversations that contributed to *theLastInterface*. The book lives in `/source/`; this folder is the paper trail of how it got there.

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

Examples:
- `2026-05-20--cowork__source-files-review.md`
- `2026-05-22--claudeai__data-ghost-spec.md`
- `2026-05-23--cowork__versioning-and-licensing.md`

## How chats get into this folder

**Cowork sessions** — Archived automatically by a scheduled task that runs weekly (Sundays). It scans recent sessions, identifies theLastInterface-related ones, and writes their full transcripts here. Already-archived sessions are skipped on subsequent runs.

**claude.ai web chats** — Sent in manually because there's no API. To archive one:

1. Open the conversation on claude.ai
2. Click the **Share** button (top right)
3. Make the share link public
4. Paste the URL into a Cowork session and ask Claude to "archive this chat for theLastInterface"

The transcript will be fetched, converted to markdown, and dropped here with the right filename.

## What about artifacts?

Artifacts (mockups, diagrams, intermediate snapshots) live one folder up in `/archive/artifacts/`, using the same date-prefixed convention. Current canonical visuals stay in `/visuals/`.

## What this folder is not

This is not the book. It's the record of conversations that shaped the book. The book itself lives in `/source/`. Read these only when you want to know *why* something in `/source/` looks the way it does.
