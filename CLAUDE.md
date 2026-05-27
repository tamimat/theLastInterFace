# CLAUDE.md

## What you handle in this repo

theLastInterface is a book. You handle git, the build pipeline, repo restructure, and renderer code (`spine/index.html`, `section.html`, `styles.css`, `iris.html`, `build-content.js`, the hooks). You don't edit the manuscript markdown — that's Cowork's domain. When Tamim asks you to commit edits, they're already in the working tree.

## Build is automatic on commit

A `pre-commit` hook at `tools/hooks/pre-commit` runs `node spine/build-content.js` whenever any spine source is staged, then stages the regenerated `spine/content.js`. Don't bypass it with `--no-verify` unless you have a reason — the deployed site reads from `content.js` and stale build = stale site.

In a fresh clone, confirm `git config core.hooksPath` resolves to `tools/hooks`.

## Don't hand-edit content.js

It's generated from the `.md` files. To change rendered output, edit the source and rebuild.

## Commit messages

The `prepare-commit-msg` hook prepends `[N]` automatically — don't add it yourself. Keep titles concrete and outcome-shaped.

## Don't touch

- `/chats/`, `/artifacts/`, `/_review/` — historical records.
- Old vocabulary in archived material. The current term is `notochord` (was `thesis`); don't backport the rename into archives.

## More

`README.md` (repo root) has the project overview. `spine/README.md` documents the manuscript layout.
