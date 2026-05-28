# CLAUDE.md

## Repo layout (post-restructure)

- `/spine/` — manuscript only. Markdown files (`00-tailbone.md` … `18-atlas.md`, `notochord.md`, `membrane.md`), `meta.json`, and `spine/README.md`. The load-bearing axis of the book.
- `/site/` — rendering source. `index.html`, `iris.html`, `section.html`, the section-template-generated `section-N.html` files, `styles.css`, `iris.css`, `render.js`, `iris.js`, `theme-toggle.js`, `build-content.js`, `stamp-assets.js`, `content.js` (generated). What GitHub Pages uploads as the site root.
- `/site/assets/` — web assets. `favicon.svg`, `apple-touch-icon.{svg,png}`, `og.{svg,png}`, `robots.txt`.
- `/tools/` — build helpers. `section-template.html`, hooks, `gen-build-js.sh`, the share-archivers.

## What you handle in this repo

theLastInterface is a book. You handle git, the build pipeline, repo restructure, and renderer code (`site/index.html`, `site/section.html`, `site/styles.css`, `site/iris.html`, `site/build-content.js`, the hooks). You don't edit the manuscript markdown — that's Cowork's domain. When Tamim asks you to commit edits, they're already in the working tree.

## Build is automatic on commit

A `pre-commit` hook at `tools/hooks/pre-commit` runs `node site/build-content.js` whenever any manuscript markdown or the builder itself is staged, then stages the regenerated `site/content.js` and any restamped `site/*.html`. Don't bypass it with `--no-verify` unless you have a reason — the deployed site reads from `content.js` and stale build = stale site.

In a fresh clone, confirm `git config core.hooksPath` resolves to `tools/hooks`.

## Don't hand-edit content.js

It's generated from the `.md` files. To change rendered output, edit the source and rebuild.

## Commit messages

The `prepare-commit-msg` hook prepends `[N]` automatically — don't add it yourself. Keep titles concrete and outcome-shaped.

## Don't touch

- `/chats/`, `/artifacts/`, `/_review/` — historical records.
- Old vocabulary in archived material. The current term is `notochord` (was `thesis`); don't backport the rename into archives.

## More

`README.md` (repo root) has the project overview. `spine/README.md` documents the manuscript layout. `site/README.md` documents the rendering pipeline.
