# Chat Archive

Verbatim transcripts of conversations that contributed to *theLastInterface*, plus the artifact files Claude wrote during those conversations. This folder is the paper trail for the **book's content** — the discussions where the ideas, structure, and prose were worked out, and the standalone pieces that came out of them.

Operational conversations (file moves, git setup, archiver design, README edits) do **not** live here. They're not book content; the lessons from them are absorbed into memory and into the project structure itself, and the transcripts are skipped by the weekly archiver.

## Layout

Each archived chat lives in its own folder. The folder is named after the conversation; inside it sits the transcript and a sibling `artifacts/` directory holding everything Claude wrote during the chat (when there is anything to extract).

```
chats/
  YYYY-MM-DD--source__short-slug/
    YYYY-MM-DD--source__short-slug.md         ← transcript
    artifacts/                                  ← if any
      <slug>.md                                 ← Claude-authored files
      <slug>-v2.md                              ← regenerated versions
      INDEX.md                                  ← table of artifacts
    assets/                                     ← if any (images, etc.)
```

The per-chat-folder layout keeps each conversation self-contained: move it, share it, or feed it to an LLM as a single unit and you get the full picture — discussion plus everything Claude produced inside it. Same shape for both `claudeai` and `chatgpt` archives.

A few conversations still sit as flat `.md` files at the top of `/chats/` — these are older Cowork sessions and one claude.ai chat with no artifacts. The folder layout is the canonical going-forward shape; the flat files are tolerated for now.

## Naming convention

```
YYYY-MM-DD--source__short-slug
```

- **YYYY-MM-DD** — the date the conversation started (so folders sort chronologically by name alone)
- **source** — which surface the chat happened on:
  - `claudeai` — claude.ai web
  - `chatgpt` — chatgpt.com share
  - `cowork` — Claude desktop app (Cowork mode)
- **short-slug** — a few words describing the topic (kebab-case)

Filenames inside `artifacts/` and `assets/` use a short slug only — the date and source are already encoded in the parent folder name.

## Artifacts

Inside `artifacts/`, each Claude-authored file carries a YAML front matter block recording where it came from:

```yaml
---
source_chat: <parent-folder-name>.md
source_path: <original path Claude wrote to>
created_in_chat: <ISO 8601 local timestamp>
created_at_utc: <UTC timestamp>
tool_use_id: <toolu_...>
description: "..."
tool_sequence:
  create_file: N
  str_replace_succeeded: N
  str_replace_failed: N
  present_files: N
extraction_method: automatic | manual
---
```

When an artifact is extracted, its body is no longer duplicated inside the chat transcript. The transcript keeps the structural record of what happened (the `create_file` tool_use call with its path, description, and tool_result), but the `file_text` value is replaced with a reference like:

```json
"file_text": "[artifact body extracted to artifacts/manifesto.md]"
```

This keeps the transcript readable while preventing the same content from existing in two places. The reference path is relative to the transcript, so the chat folder remains self-contained.

If a chat used the view-then-edit-then-bash-cp pattern (no `create_file` to anchor against), artifacts are extracted manually rather than by the archiver. Those files carry `extraction_method: manual` in their front matter along with a note explaining the reconstruction.

## How chats get into this folder

### claude.ai web chats — `claudeai-share-archiver` skill

1. Open the conversation on claude.ai
2. Click **Share** (top right) → make the link public
3. Paste the URL into a Cowork session and ask Claude to "archive this chat for theLastInterface"

The skill fetches the transcript, extracts artifacts, packages everything into a ZIP, and the Cowork agent unzips it into `/chats/<basename>/`. Claude.ai transcripts include ISO 8601 per-message timestamps, message UUIDs, parent-message threading, input mode, stop reasons, full tool call inputs and results, attachments, and citations.

### ChatGPT shares — `chatgpt-share-archiver` skill

Same flow with a `chatgpt.com/share/` URL. ChatGPT-generated images are fetched from the share-page CDN and saved into `assets/` with inline `![alt](assets/...)` references in the transcript. ChatGPT shares don't have artifacts in Claude's sense.

### Cowork sessions — weekly classifier (Saturdays)

A scheduled task (`archive-thelastinterface-cowork-sessions`) runs Saturday mornings. For each theLastInterface-tagged Cowork session, it decides one of three things:

- **book-content** → writes the transcript to `/chats/` (here)
- **operational** → skips the transcript entirely, logs one line to `/_review/skip-log.md`
- **ambiguous** → writes to `/_review/` for manual triage

The classifier defaults to inclusion when in doubt. The original session always remains in Cowork's session store regardless of routing, so misclassifications are recoverable.

Note: Cowork's `session_info` API exposes a thinner transcript than the claude.ai archiver — verbatim message text and tool-use summaries, but no per-message timestamps, UUIDs, threading metadata, or full tool-call inputs/outputs. Currently the classifier writes flat `.md` files; updating it to produce the per-chat-folder layout is open work.

## Promotion to /visuals/ or /spine/

Artifacts and assets in a chat folder are provenance — they record what came out of a specific conversation. If a piece earns a role in the book, that's a deliberate editorial step:

- Visual assets that become book illustrations get copied into `/visuals/` with a name describing their book role, not their chat origin.
- Prose that becomes manuscript text gets folded into `/spine/`.

The chat-folder copy stays in place as the historical record. The promoted copy is the working version.

## What this folder is not

This is not the book. The book is in `/spine/`. This folder is the record of conversations that shaped the spine — read these when you want to know *why* a section reads the way it does, what was discussed and rejected, or which decisions still have open threads.
