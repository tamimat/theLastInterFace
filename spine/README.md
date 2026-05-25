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
| `notochord.md` | The book's one-sentence axial statement. |
| `membrane.md` | The author-AI working layer. Each H2 is one rule. |
| `00-tailbone.md` | The opening unit (n=0). |
| `01-…` through `17-…` | The 17 chapters in order (n=1..17). |
| `18-atlas.md` | The closing unit (n=18). |
| `build-content.js` | The build script. Reads the above, writes `content.js`. |
| `content.js` | Generated. The form the browser pages consume. |

Each unit file has YAML frontmatter (`n`, `title`, plus `summary` for the bookends) and three H2 sections: `Vertebra`, `Spine`, `Skeleton`. Prose verbatim — blank lines between paragraphs become `\n\n` in the emitted strings.

## Filename prefix == frontmatter `n`

Every unit's filename prefix is its `n`, zero-padded:

| Filename | `n` | Title |
| --- | --- | --- |
| 00-tailbone.md | 0 | Tailbone |
| 01-sensor-and-universe.md | 1 | The Sensor and the Universe |
| 02-inverted-relationship.md | 2 | The Inverted Relationship |
| … | … | … |
| 17-choice.md | 17 | The Choice |
| 18-atlas.md | 18 | Atlas |

Earlier in this migration the bookends had no `n` and the chapter prefixes were `n + 1`. That asymmetry is gone — tailbone and atlas now carry `n: 0` and `n: 18` in their frontmatter, the build script reads `n` uniformly from every file, and the renderer's `allUnits()` helper computes tags from the data instead of hardcoding `#0` and `#18`.

The JS data shape that `content.js` emits is still `window.SPINE.{tailbone, spine[], atlas}` — chapters indexed by their `n` inside `spine[]`, bookends as named fields. Folding that into a single numbered array is a follow-up; not this migration's job.

## Notochord, not thesis

The book's one-sentence axial statement is now called the **notochord** — anatomically consistent with vertebra / spine / skeleton / membrane / tailbone / atlas. The notochord is the embryonic proto-spine, the string the vertebrae form around.

This was a rename of an existing field. If you come across old chats or archived material referring to "the thesis," that's the same string — same content, new name. In the current vocabulary:

- File: `notochord.md` (was `thesis.md`)
- Data field: `window.SPINE.notochord` (was `window.SPINE.thesis`)
- CSS class: `.notochord` (was `.thesis`)
- User-visible label on the index page: `Notochord` (was `Thesis`)

Historical material in `/chats/`, `/artifacts/`, `/archive/`, etc. retains the old vocabulary by design.

## A separate `build.js` exists — it's unrelated

There is also a `spine/build.js` in this directory. It is **not** the manuscript build script (this one is `build-content.js`). `build.js` is a tiny generated stub that defines `window.SPINE_BUILD = { count, sha }` for the "git #N" label in the page header. It's written by `tools/gen-build-js.sh` (post-commit hook) and by `.github/workflows/pages.yml` at deploy time, and is gitignored. Don't edit it; don't be confused by the similar name.
