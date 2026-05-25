#!/usr/bin/env node
// build-content.js — regenerate spine/content.js from the markdown manuscript.
//
// The /spine/*.md files are the canonical source. content.js is generated.
// Run: `node spine/build-content.js`. See spine/README.md.
//
// Zero deps. fs and path only.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SPINE = __dirname;
const REPO_ROOT = path.dirname(SPINE);
const TEMPLATE_PATH = path.join(REPO_ROOT, 'tools', 'section-template.html');

// --- helpers ---------------------------------------------------------------

// Minimal YAML frontmatter parser. Only handles `key: value` lines; no nesting,
// no lists, no multi-line strings. Numeric values are coerced to integers.
function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return [{}, text];
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) return [{}, text];
  const block = text.slice(4, end);
  const body = text.slice(end + 5);
  const meta = {};
  for (const line of block.split('\n')) {
    if (!line.trim()) continue;
    const i = line.indexOf(':');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (/^-?\d+$/.test(val)) val = parseInt(val, 10);
    meta[key] = val;
  }
  return [meta, body];
}

function splitH2Sections(body) {
  const lines = body.split('\n');
  const sections = {};
  let cur = null;
  let buf = [];
  const flush = () => {
    if (cur !== null) sections[cur] = buf.join('\n').replace(/^\n+|\n+$/g, '');
  };
  for (const line of lines) {
    const m = line.match(/^## (.+?)\s*$/);
    if (m) {
      flush();
      cur = m[1];
      buf = [];
    } else if (cur !== null) {
      buf.push(line);
    }
  }
  flush();
  return sections;
}

function stripLeadingH1(body) {
  const lines = body.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i < lines.length && /^#\s+/.test(lines[i])) {
    i++;
    while (i < lines.length && lines[i].trim() === '') i++;
  }
  return lines.slice(i).join('\n').replace(/\n+$/, '');
}

// JS template literal for multi-line prose. Escapes \, `, and ${.
function tlit(s) {
  return '`' + String(s).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';
}

// JS double-quoted string for identifiers / short labels.
function dq(s) {
  return JSON.stringify(s);
}

// --- read meta -------------------------------------------------------------

const meta = JSON.parse(fs.readFileSync(path.join(SPINE, 'meta.json'), 'utf8'));

// --- read notochord --------------------------------------------------------

const notochord = stripLeadingH1(fs.readFileSync(path.join(SPINE, 'notochord.md'), 'utf8')).trim();

// --- read membrane ---------------------------------------------------------

const membraneRaw = fs.readFileSync(path.join(SPINE, 'membrane.md'), 'utf8');
const membraneAfterH1 = stripLeadingH1(membraneRaw);
// Drop the lead-in paragraph between # Membrane and the first ##.
const firstH2 = membraneAfterH1.indexOf('\n## ');
const membraneBody = firstH2 === -1 ? membraneAfterH1 : membraneAfterH1.slice(firstH2 + 1);

const membrane = [];
{
  let title = null;
  let buf = [];
  const flush = () => {
    if (title !== null) {
      membrane.push({ title, body: buf.join('\n').replace(/^\n+|\n+$/g, '') });
    }
  };
  for (const line of membraneBody.split('\n')) {
    const m = line.match(/^## (.+?)\s*$/);
    if (m) {
      flush();
      title = m[1];
      buf = [];
    } else {
      buf.push(line);
    }
  }
  flush();
}

// --- read unit files -------------------------------------------------------

const unitFiles = fs.readdirSync(SPINE)
  .filter(f => /^\d+-.+\.md$/.test(f))
  .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

if (unitFiles.length < 3) {
  throw new Error('Expected at least 3 unit files (tailbone, chapters, atlas), found ' + unitFiles.length);
}

const units = unitFiles.map(f => {
  const text = fs.readFileSync(path.join(SPINE, f), 'utf8');
  const [front, body] = parseFrontmatter(text);
  const sections = splitH2Sections(body);
  return {
    file: f,
    front,
    vertebra: sections['Vertebra'] || '',
    spine: sections['Spine'] || '',
    skeleton: sections['Skeleton'] || ''
  };
});

const tailbone = units[0];
const atlas = units[units.length - 1];
const chapters = units.slice(1, -1);

// --- emit content.js ------------------------------------------------------

const HEAD = `// content.js — the canonical content of the book's spine.
// Both index.html and section.html read from here.
//
// THIS FILE IS GENERATED. Edit the markdown manuscript in /spine/*.md and run:
//   node spine/build-content.js
// See spine/README.md.
//
// Top-level shape:
//   meta     — version, status, title.
//   notochord — one sentence stating what the book argues. (Anatomically the
//               notochord is the embryonic proto-spine — the axial string the
//               vertebrae form around.)
//   tailbone — the book's opening unit. {vertebra, spine, skeleton}.
//   spine    — array of chapters. Each chapter is itself a {vertebra, spine, skeleton}
//              unit (the recursion is intentional: each chapter is a vertebra in the
//              book's spine, and itself contains a vertebra, spine, and skeleton).
//   atlas    — the book's closing unit. {vertebra, spine, skeleton}. Symmetric with the
//              tailbone — the two frame the spine from each end.
//
// Inside each unit (anatomical hierarchy, largest to smallest in display weight):
//   vertebra — the single load-bearing sentence or schematic of the unit. The bone the
//              spine is built around. Shown largest and blackest. One line, evocative.
//   spine    — the dense, multi-paragraph treatment that holds the vertebra in place.
//              Paragraphs separated by blank lines (the renderer splits on /\\n\\n+/).
//              What a fresh chat needs to write or reason about this unit correctly.
//   skeleton — the surrounding tissue: anchor thinkers, objections, alternative framings,
//              cross-unit connections, open questions. Shown smallest and grayest.
//
// Boundary rule (the test):
//   For each paragraph, ask: "would a chat seeded with everything except this paragraph
//   still write the right unit?" If yes, it belongs in the skeleton. If no, in the spine.
//
// Versioning:
//   - The git commit + tag history IS the version record.
//   - meta.lastUpdated is the human-friendly date shown next to the title.
//   - meta.repoUrl is the GitHub base used to build the source link.
`;

const TAIL = `
// Unified view across the 19 units of the spine. All units (tailbone n=0,
// chapters n=1..17, atlas n=18) carry n in their data; allUnits just adds
// kind, derived tag, and a default title for the bookends.
//   { kind, n, tag, title, vertebra, spine, skeleton }
window.SPINE.allUnits = function() {
  const S = window.SPINE;
  return [
    { kind: 'tailbone', title: 'Tailbone', ...S.tailbone, tag: '#' + S.tailbone.n },
    ...S.spine.map(c => ({ kind: 'chapter', ...c, tag: '#' + c.n })),
    { kind: 'atlas', title: 'Atlas', ...S.atlas, tag: '#' + S.atlas.n }
  ];
};

// Source-link helpers. The "last updated" date in each page links to the current
// spine/content.js on main. The commit/tag history on GitHub is the version record.
window.SPINE.sourceUrl = function() {
  return window.SPINE.meta.repoUrl + '/tree/main/spine/content.js';
};
window.SPINE.lastUpdatedLinkHtml = function() {
  return '<a class="last-updated" href="' + window.SPINE.sourceUrl()
       + '" target="_blank" rel="noopener noreferrer">last updated '
       + window.SPINE.meta.lastUpdated + '</a>';
};

// On GitHub Pages, the deploy workflow writes spine/build.js with the commit
// count and sha — the page shows \`git #N\` linking to that commit. Locally,
// build.js is absent (gitignored) and we fall back to the last-updated date.
window.SPINE.buildLabelHtml = function() {
  const b = window.SPINE_BUILD;
  if (b && typeof b.count === 'number' && b.sha) {
    const url = window.SPINE.meta.repoUrl + '/commit/' + b.sha;
    return '<a class="last-updated" href="' + url
         + '" target="_blank" rel="noopener noreferrer">git #' + b.count + '</a>';
  }
  return window.SPINE.lastUpdatedLinkHtml();
};
`;

const out = [];
out.push('window.SPINE = {');
out.push('  meta: {');
out.push('    lastUpdated: ' + dq(meta.lastUpdated) + ',');
out.push('    title: ' + dq(meta.title) + ',');
out.push('    repoUrl: ' + dq(meta.repoUrl) + ',');
out.push('    baseUrl: ' + dq(meta.baseUrl));
out.push('  },');
out.push('');
out.push('  tailbone: {');
out.push('    n: ' + tailbone.front.n + ',');
if (tailbone.front.summary) out.push('    summary: ' + tlit(tailbone.front.summary) + ',');
out.push('    vertebra: ' + tlit(tailbone.vertebra) + ',');
out.push('    spine: ' + tlit(tailbone.spine) + ',');
out.push('    skeleton: ' + tlit(tailbone.skeleton));
out.push('  },');
out.push('');
out.push('  membrane: [');
membrane.forEach((m, i) => {
  out.push('    {');
  out.push('      title: ' + dq(m.title) + ',');
  out.push('      body: ' + tlit(m.body));
  out.push('    }' + (i === membrane.length - 1 ? '' : ','));
});
out.push('  ],');
out.push('');
out.push('  notochord: ' + tlit(notochord) + ',');
out.push('');
out.push('  spine: [');
chapters.forEach((c, i) => {
  out.push('    {');
  out.push('      n: ' + c.front.n + ',');
  out.push('      title: ' + dq(c.front.title) + ',');
  out.push('      vertebra: ' + tlit(c.vertebra) + ',');
  out.push('      spine: ' + tlit(c.spine) + ',');
  out.push('      skeleton: ' + tlit(c.skeleton));
  out.push('    }' + (i === chapters.length - 1 ? '' : ','));
});
out.push('  ],');
out.push('');
out.push('  atlas: {');
out.push('    n: ' + atlas.front.n + ',');
if (atlas.front.summary) out.push('    summary: ' + tlit(atlas.front.summary) + ',');
out.push('    vertebra: ' + tlit(atlas.vertebra) + ',');
out.push('    spine: ' + tlit(atlas.spine) + ',');
out.push('    skeleton: ' + tlit(atlas.skeleton));
out.push('  }');
out.push('};');

const final = HEAD + '\n' + out.join('\n') + '\n' + TAIL;
fs.writeFileSync(path.join(SPINE, 'content.js'), final);
console.log('wrote spine/content.js (' + final.length + ' bytes; ' + unitFiles.length + ' unit files, ' + membrane.length + ' membrane rules)');

// --- emit pre-rendered section-N.html for every unit ----------------------
// Each page is a self-contained artifact — vertebra/spine/skeleton baked into
// the HTML so the chapter reads with JS off. JS only runs to wire the Copy
// buttons (which still need content.js for the cross-unit "with-spines" build).

function htmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paragraphsHtml(text) {
  return text.split(/\n\n+/).map(p => '<p>' + htmlEscape(p) + '</p>').join('\n      ');
}

// All units in canonical order, with the same shape allUnits() exposes at runtime.
// Built locally so the build script doesn't have to load content.js.
const allUnits = [
  { kind: 'tailbone', n: tailbone.front.n, title: 'Tailbone',
    vertebra: tailbone.vertebra, spine: tailbone.spine, skeleton: tailbone.skeleton },
  ...chapters.map(c => ({ kind: 'chapter', n: c.front.n, title: c.front.title,
    vertebra: c.vertebra, spine: c.spine, skeleton: c.skeleton })),
  { kind: 'atlas', n: atlas.front.n, title: 'Atlas',
    vertebra: atlas.vertebra, spine: atlas.spine, skeleton: atlas.skeleton }
];
allUnits.forEach(u => { u.tag = '#' + u.n; });

// Strip the template's leading HTML comment — it's docs for the editor of
// the template file, not content the browser should ship. The deployed
// section-N.html files should be lean.
const template = fs.readFileSync(TEMPLATE_PATH, 'utf8')
  .replace(/^(<!DOCTYPE html>\n)<!--[\s\S]*?-->\n/, '$1');
const lastN = allUnits[allUnits.length - 1].n;

function navLink(u, prefix, suffix) {
  if (!u) return '<span></span>';
  return '<a href="section-' + u.n + '.html">' + prefix + htmlEscape(u.tag + ' ' + u.title) + suffix + '</a>';
}

for (let i = 0; i < allUnits.length; i++) {
  const u = allUnits[i];
  const prev = i > 0 ? allUnits[i - 1] : null;
  const next = i < allUnits.length - 1 ? allUnits[i + 1] : null;

  const filled = template
    .replace(/\{\{page_title\}\}/g,    htmlEscape(u.tag + ' — ' + meta.title))
    .replace(/\{\{og_title\}\}/g,      htmlEscape(meta.title + ' — ' + u.tag + ' ' + u.title))
    .replace(/\{\{canonical_url\}\}/g, htmlEscape(meta.baseUrl + '/section-' + u.n + '.html'))
    .replace(/\{\{tag\}\}/g,           htmlEscape(u.tag))
    .replace(/\{\{title\}\}/g,         htmlEscape(u.title))
    .replace(/\{\{vertebra\}\}/g,      htmlEscape(u.vertebra))
    .replace(/\{\{spine_html\}\}/g,    paragraphsHtml(u.spine))
    .replace(/\{\{skeleton_html\}\}/g, paragraphsHtml(u.skeleton))
    .replace(/\{\{prev_html\}\}/g,     navLink(prev, '← ', ''))
    .replace(/\{\{next_html\}\}/g,     navLink(next, '', ' →'))
    .replace(/\{\{n\}\}/g,             String(u.n));

  fs.writeFileSync(path.join(SPINE, 'section-' + u.n + '.html'), filled);
}
console.log('wrote ' + allUnits.length + ' pre-rendered section-N.html files');

// --- restamp cache-bust hash ----------------------------------------------
// content.js just changed and new section-N.html files exist; the hash needs
// to reflect both. Running stamp-assets here keeps a manual `node spine/build-
// content.js` call fully self-contained — no second command required.
execSync('node ' + path.join(SPINE, 'stamp-assets.js'), { stdio: 'inherit' });
