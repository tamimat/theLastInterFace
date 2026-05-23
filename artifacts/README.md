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
| `2026-05-20--claudeai__opening.md` | `chats/2026-05-20--claudeai__intent-based-hci-model.md` |
| `2026-05-20--claudeai__position.md` | `chats/2026-05-20--claudeai__intent-based-hci-model.md` |
| `2026-05-20--claudeai__notes.md` | `chats/2026-05-20--claudeai__intent-based-hci-model.md` |
| `2026-05-20--claudeai__short.md` | `chats/2026-05-20--claudeai__intent-based-hci-model.md` |
| `2026-05-20--claudeai__universe-zero.md` | `chats/2026-05-20--claudeai__intent-based-hci-model.md` |
| `2026-05-20--claudeai__complete.md` | `chats/2026-05-20--claudeai__intent-based-hci-model.md` |

## What's not here

- **Manuscript drafts** — promoted artifacts that are being actively edited live in `/drafts/`. `the-end-of-apps.md` was promoted there from this folder on 2026-05-20.
- **Earlier-format copies** — when an artifact was originally pasted into `/source/` with an inconsistent filename, the original copy was moved to `/archive/source/` (it was byte-identical to the artifact here, but kept for provenance).

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
