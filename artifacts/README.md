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

Every artifact here was created in a chat under `/chats/` with the same date prefix. Open the chat file to find the surrounding context (what prompt produced it, what version came before, what discussion followed).

| Artifact | Originating chat |
| --- | --- |
| `2026-05-20--claudeai__pitch.md`, `-v2`, `-v3` | `chats/2026-05-20--claudeai__intent-based-hci-model.md` |
| `2026-05-20--claudeai__manifesto.md`, `-v2` | `chats/2026-05-20--claudeai__intent-based-hci-model.md` |
| `2026-05-20--claudeai__the-end-of-apps.md` | `chats/2026-05-20--claudeai__intent-based-hci-model.md` (the manifesto's final form, with title and pizza-scene opening) |
| `2026-05-20--claudeai__opening.md` | `chats/2026-05-20--claudeai__intent-based-hci-model.md` |
| `2026-05-20--claudeai__position.md` | `chats/2026-05-20--claudeai__intent-based-hci-model.md` |
| `2026-05-20--claudeai__notes.md` | `chats/2026-05-20--claudeai__intent-based-hci-model.md` |
| `2026-05-20--claudeai__short.md` | `chats/2026-05-20--claudeai__intent-based-hci-model.md` |
| `2026-05-20--claudeai__universe-zero.md` | `chats/2026-05-20--claudeai__intent-based-hci-model.md` |
| `2026-05-20--claudeai__complete.md` | `chats/2026-05-20--claudeai__intent-based-hci-model.md` |

## Promotion to /drafts/

When an artifact graduates from one-shot snapshot to material being actively edited, it should be copied into `/drafts/` under a clean kebab-case filename (e.g., `the-end-of-apps.md`). The artifact stays here in `/artifacts/` as the historical record; `/drafts/` holds the working manuscript.

As of 2026-05-23, `/drafts/` is empty. `the-end-of-apps.md` was previously in `/drafts/` but had not been edited since its original creation on 2026-05-20, so it was moved back to `/artifacts/`. Re-promote it whenever you actually start editing.

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
