# claudeai-share-archiver

Source-of-truth for the **claudeai-share-archiver** skill used to archive `claude.ai/share/<uuid>` conversations into `/chats/<basename>/` with transcript + extracted artifacts.

Supersedes the older `shared-chat-archiver` skill that used to live in this folder (flat `.md` to Downloads, artifacts to a separate `/artifacts/` folder, no `str_replace` reconstruction).

## Install

Double-click `claudeai-share-archiver.skill` and choose **Save skill** when Claude prompts.

## What's here

- `SKILL.md` — the skill's manifest (triggers, workflow, artifact extraction logic, edge cases).
- `scripts/extractor.js` — the browser-side script that walks the React fiber tree, extracts artifacts (with `str_replace` edits applied), builds the markdown + ZIP.
- `references/data-structure.md` — catalogue of the React props shape, plus the `create_file` / `str_replace` / `present_files` tool input schemas.
- `claudeai-share-archiver.skill` — the installable bundle, built from the three source files above.

## What's different from the legacy `shared-chat-archiver`

- **Per-chat folder layout** — outputs `chats/<basename>/{<basename>.md, artifacts/}` instead of a flat `.md` plus a separate `/artifacts/<basename>.md` per artifact.
- **`str_replace` reconstruction** — applies each successful `str_replace` edit to the running artifact body, so the extracted file reflects the final state, not the initial `create_file` body.
- **Project-name prefix-strip** — uses the conversation's project name (from the share-page header banner) as a slug-prefix hint when there's only one artifact in the chat. Multi-stem common-prefix detection still runs first; whichever yields the longer prefix wins.
- **Bundled ZIP** — markdown + artifacts + INDEX.md packaged into one downloadable file, unzipped into place after.

## Why this is checked into the repo

Same reasoning as the chatgpt-share-archiver next door:

- Repo persistence (survives Claude reinstalls and machine switches)
- Git-diffable edit history
- Provenance trail for the archives in `/chats/`

## Rebuilding the .skill from source

```sh
cd tools/claudeai-share-archiver
rm -f claudeai-share-archiver.skill
( cd .. && zip -r claudeai-share-archiver/claudeai-share-archiver.skill claudeai-share-archiver -x "claudeai-share-archiver/claudeai-share-archiver.skill" )
```

## How to use

Open a `claude.ai/share/<uuid>` URL in a Chrome tab with the Claude in Chrome extension. In a Cowork session, ask Claude to "archive this share link for theLastInterface" — the skill triggers automatically.

## Known limitations

- **`view`-then-edit-on-`/home/claude/`-then-`bash cp` pattern** isn't auto-extracted. The chat will produce zero artifacts. The reconstruction has to be done manually; the resulting artifact file should carry `extraction_method: manual` in its YAML front matter with a reconstruction note. See the legacy `notes-grounding.md` in `/chats/2026-05-22--claudeai__sensing-meaning-making.../artifacts/` for an example.
