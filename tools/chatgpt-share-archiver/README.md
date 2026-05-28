# chatgpt-share-archiver

Source-of-truth for the **chatgpt-share-archiver** skill used to archive `chatgpt.com/share/<uuid>` conversations into `/chats/<basename>/` with the transcript + generated images.

## Install

Double-click `chatgpt-share-archiver.skill` and choose **Save skill** when Claude prompts. The skill becomes available in any Cowork or Claude Code session.

## What's here

- `SKILL.md` — the skill's manifest (triggers, workflow, edge cases). Read this if you want to understand how the skill behaves.
- `scripts/extractor.js` — the browser-side script that reads the React Router loader payload, fetches images, builds the markdown + ZIP.
- `references/data-structure.md` — catalogue of the page data shape this extractor reads.
- `chatgpt-share-archiver.skill` — the installable bundle, built from the three source files above.

## Why this is checked into the repo

The `.skill` bundle is persistent on a single laptop but doesn't survive a Claude reinstall or a machine switch. The Cowork outputs folder where this is built doesn't persist between sessions. Only the repo persists across both. Source-in-repo means:

- The skill is recoverable on a new machine (clone repo, install the `.skill`)
- Edits to the extractor are tracked in git
- The archives in `/chats/` have a provenance trail — the code that produced them lives next to them

## Rebuilding the .skill from source

```sh
cd tools/chatgpt-share-archiver
rm -f chatgpt-share-archiver.skill
( cd .. && zip -r chatgpt-share-archiver/chatgpt-share-archiver.skill chatgpt-share-archiver -x "chatgpt-share-archiver/chatgpt-share-archiver.skill" )
```

Or use whatever zip tool you prefer — the bundle is just the folder zipped with `SKILL.md` at the top level.

## How to use

Open a `chatgpt.com/share/<uuid>` URL in a Chrome tab with the Claude in Chrome extension. In a Cowork session, ask Claude to "archive this share link for theLastInterface" — the skill triggers automatically.
