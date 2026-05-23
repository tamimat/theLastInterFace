# Why these files are archived

On 2026-05-23 the project layout was reorganized. `/source/` had become a catch-all that mixed two distinct things:

1. Manually pasted chat transcripts (when claude.ai chats had to be copied by hand)
2. Standalone artifact files produced inside those chats

The reorganization split those into two dedicated folders:

- `/chats/` — full, archiver-produced transcripts of claude.ai conversations
- `/artifacts/` — standalone artifact files with provenance-bearing filenames

The contents of `/source/` were then either moved into one of those folders or archived here. The three files in this folder are the residue: things that were superseded by content in `/chats/` or `/drafts/` and no longer needed an active home.

## What's in here

**`chat 2026-05-22 22.md`** — A 256 KB manual paste covering one of the 2026-05-22 claude.ai chats. Superseded by the three full archives in `/chats/` dated 2026-05-22 (heartbeat, poetic-dishonesty, sensing-meaning-making), which together contain everything in this paste plus full metadata (timestamps, UUIDs, tool calls). Kept for provenance.

**`chat-2026-05-20.md`** — A 28 KB manual paste of the 2026-05-20 claude.ai chat. Superseded by `chats/2026-05-20--claudeai__intent-based-hci-model.md`, which is the full archiver-produced transcript of the same conversation.

**`the-end-of-apps.md`** — Byte-identical to `/drafts/the-end-of-apps.md`. The `/drafts/` copy is the canonical home (per the project folder structure: `/drafts/` holds manuscript drafts being actively edited). This is the duplicate.
