# Artifacts

Standalone artifact files produced inside the chats archived in `/chats/`. These are the polished pieces (manifestos, pitches, notes, openings) that Claude wrote during a conversation and that earned their own filename — distinct from the raw chat transcript.

## Naming convention

```
YYYY-MM-DD--source__slug.md
```

- **YYYY-MM-DD** — the date the artifact was created (matches the chat it came from)
- **source** — which surface produced it: `claudeai`, `cowork`, `codex`
- **slug** — short kebab-case label (no `the-last-interface-` prefix; the date and folder already establish that)

Examples:

- `2026-05-20--claudeai__manifesto.md`
- `2026-05-22--claudeai__notes-v2.md`

## Pairing artifacts with their source chats

Every artifact carries a YAML front matter block at the top recording its source chat, the chat-message timestamp where it was created, how many edits it went through (including failed retries), and whether it was extracted automatically or by hand. Opening any artifact tells you where it came from — no separate index needed.

For the broader picture (which chat, which discussion), open the matching file in `/chats/`.

## Relationship to /spine/

The book itself lives in `/spine/` — that's the working manuscript, structured as spine (load-bearing prose) and skeleton (supporting context). When material from an artifact gets folded into the book, it enters via the spine and skeleton, not a separate drafts folder. The artifact files here remain as the historical record of how each piece first appeared.

## GitHub linking

Once pushed, every file in this folder has a stable URL on GitHub:

```
https://github.com/tamimat/theLastInterFace/blob/main/artifacts/<filename>
```

or the raw content:

```
https://raw.githubusercontent.com/tamimat/theLastInterFace/main/artifacts/<filename>
```

The repo is currently private, so these links require authentication until the project is made public.
