#!/usr/bin/env node
// stamp-assets.js — stamp a content-derived hash into every ?v=... query in
// the site's HTML files so browsers re-fetch updated CSS/JS automatically.
//
// Reads the asset files (styles.css, build.js, content.js, iris.css, iris.js,
// render.js if present), hashes their combined contents, and rewrites the
// `?v=...` query string on every <link href> / <script src> in site/*.html
// to match. One hash for all assets — any change busts everything.
//
// Run: `node site/stamp-assets.js`. Idempotent.
// Triggered automatically by the pre-commit hook on any asset/HTML change.
//
// Zero deps. fs, path, crypto only.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SITE = __dirname;

// Inputs to the hash — anything a browser may fetch and cache.
// build.js + render.js may be absent in some checkouts; skip cleanly.
const ASSETS = ['styles.css', 'build.js', 'content.js', 'iris.css', 'iris.js', 'render.js'];

// Files to restamp — every .html in site/, picked up automatically so new
// pre-rendered section-N.html files get included without a list edit.
const HTML = fs.readdirSync(SITE).filter(f => f.endsWith('.html')).sort();

const parts = [];
for (const a of ASSETS) {
  const p = path.join(SITE, a);
  if (fs.existsSync(p)) parts.push(fs.readFileSync(p));
}
const hash = crypto.createHash('sha256').update(Buffer.concat(parts)).digest('hex').slice(0, 8);

let touched = 0;
for (const f of HTML) {
  const p = path.join(SITE, f);
  const before = fs.readFileSync(p, 'utf8');
  const after = before.replace(/(\b(?:href|src)="[^"]*\?v=)[^"&]*/g, '$1' + hash);
  if (after !== before) {
    fs.writeFileSync(p, after);
    touched++;
  }
}

console.log('stamp-assets: hash=' + hash + ' touched=' + touched + ' / ' + HTML.length + ' html file(s)');
