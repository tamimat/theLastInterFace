# /spine/

The book lives here. The markdown files are the canonical manuscript. `content.js` is a generated artifact.

## Editing

Edit the `.md` files. Then regenerate:

```
node spine/build-content.js
```

That rewrites `spine/content.js`. The site (`index.html`, `section.html`) reads from `content.js`, so the rendered pages update on next load.

Don't edit `content.js` by hand. It will be overwritten on the next build.

## Layout

| File | What it holds |
| --- | --- |
| `meta.json` | `lastUpdated`, `title`, `repoUrl`. The only non-prose state. |
| `thesis.md` | The one-sentence thesis. |
| `membrane.md` | The author-AI working layer. Each H2 is one rule. |
| `01-tailbone.md` | The opening unit. |
| `02-…` through `18-…` | The 17 chapters in order. |
| `19-atlas.md` | The closing unit. |
| `build-content.js` | The build script. Reads the above, writes `content.js`. |
| `content.js` | Generated. The form the browser pages consume. |

Each unit file has YAML frontmatter (`title`, `summary` for tailbone/atlas, `n` for chapters) and three H2 sections: `Vertebra`, `Spine`, `Skeleton`. Prose verbatim — blank lines between paragraphs become `\n\n` in the emitted strings.

## Filename number vs frontmatter `n` — read this before you "fix" it

The filename prefix and the frontmatter `n` are deliberately not the same number, because they answer different questions.

- **Filename prefix** numbers the files 01..19 in reading order — tailbone first, atlas last, chapters in between. One numbered chain across the whole spine.
- **Frontmatter `n`** is the chapter's chapter-number, 1..17. Tailbone and atlas have no `n` — they aren't chapters. The renderer still uses `n` for chapter labels, so it has to match the original numbering.

That means for every chapter file, the filename prefix is `n + 1`:

| Filename | `n` | Title |
| --- | --- | --- |
| 01-tailbone.md | (none) | Tailbone |
| 02-sensor-and-universe.md | 1 | The Sensor and the Universe |
| 03-inverted-relationship.md | 2 | The Inverted Relationship |
| … | … | … |
| 18-choice.md | 17 | The Choice |
| 19-atlas.md | (none) | Atlas |

This is a transitional compromise. The renderer (`index.html`, `section.html`) still consumes the old shape — `window.SPINE.tailbone`, `window.SPINE.spine[]` indexed by `n`, `window.SPINE.atlas`. Folding everything into one numbered array is a follow-up, not this migration's job.

## A separate `build.js` exists — it's unrelated

There is also a `spine/build.js` in this directory. It is **not** the manuscript build script (this one is `build-content.js`). `build.js` is a tiny generated stub that defines `window.SPINE_BUILD = { count, sha }` for the "git #N" label in the page header. It's written by `tools/gen-build-js.sh` (post-commit hook) and by `.github/workflows/pages.yml` at deploy time, and is gitignored. Don't edit it; don't be confused by the similar name.
