// render.js — shared rendering helpers used by index.html and section.html.
//
// Pure functions only. No DOM hydration — each page does its own DOM work
// since the markup differs. The shared logic is:
//   - the markdown export builders (read / llm / focus / with-spines)
//   - the unit heading shape used wherever a unit identifies itself
//   - the clipboard write + button flash
//
// Loaded after content.js so window.SPINE exists, but the helpers themselves
// take S as an argument so they remain stateless and testable.

window.SPINE_RENDER = (function() {

  // Heading shape used in markdown headers and plain-text section markers.
  // Same for tailbone, chapters, and atlas — their tag is already the bare "#N".
  const unitHeading = u => u.tag + ' ' + u.title;

  // Clipboard write with a brief "Copied" flash on the button.
  // Replace with the same two-line .main/.hint structure so the button's
  // height doesn't jump from two lines to one during the flash. The hint
  // shifts from an instruction ("paste into any AI chat") to a confirmation
  // ("now chat with any AI") — same imperative shape, after-action voice.
  function copyText(text, btn, timeout) {
    navigator.clipboard.writeText(text).then(() => {
      const original = btn.innerHTML;
      btn.innerHTML = '<span class="main">Copied</span><span class="hint">now chat with any AI</span>';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.innerHTML = original;
        btn.classList.remove('copied');
      }, timeout || 1500);
    }).catch(err => {
      alert('Copy failed: ' + err);
    });
  }

  // read.md — what a human reading the draft gets: no skeleton, no membrane,
  // no notochord section, no orientation paragraph. Chapter vertebras render as
  // bare italic epigraphs under each title (position implies the role — no
  // "Vertebra:" label). Tailbone and atlas open straight with their spine
  // prose; their vertebras would be redundant with the spine's opening line.
  function buildReadMarkdown(S) {
    const out = [];
    out.push('# ' + S.meta.title);
    out.push('');
    out.push('*Draft — last updated ' + S.meta.lastUpdated + '*');
    out.push('');
    S.allUnits().forEach(u => {
      out.push('---');
      out.push('');
      out.push('## ' + unitHeading(u));
      out.push('');
      if (u.kind === 'chapter') {
        out.push('*' + u.vertebra + '*');
        out.push('');
      }
      out.push(u.spine);
      out.push('');
    });
    return out.join('\n');
  }

  // llm.md — what an AI chat gets loaded with as context: orientation paragraph,
  // membrane, notochord, and every unit's vertebra/spine/skeleton — the complete
  // working material for reasoning about or writing the book.
  function buildLlmMarkdown(S) {
    const out = [];
    out.push('# ' + S.meta.title);
    out.push('');
    out.push('**Last updated:** [' + S.meta.lastUpdated + '](' + S.sourceUrl() + ')');
    out.push('');
    out.push('The book has a notochord, a tailbone, a spine, and an atlas. The spine is a chain of chapters, each one a vertebra. The tailbone and the atlas frame the spine from each end — opening and closing units. Every vertebra (tailbone and atlas included) has its own internal structure: a load-bearing line (its own vertebra), the dense prose that holds it in place (its spine), and the surrounding tissue (its skeleton). The boundary rule between spine and skeleton: a paragraph belongs in the skeleton only if a chat seeded with everything except that paragraph would still write the right unit.');
    out.push('');
    if (S.membrane && S.membrane.length) {
      out.push('---');
      out.push('');
      out.push('## Membrane');
      out.push('');
      out.push('The working layer between author and AI. Selectively permeable — lets some language through, refuses others, holds the terms that drift in drafting. Read these before the content; they prime everything that follows.');
      out.push('');
      S.membrane.forEach(c => {
        out.push('### ' + c.title);
        out.push('');
        out.push(c.body);
        out.push('');
      });
    }
    out.push('---');
    out.push('');
    out.push('## Notochord');
    out.push('');
    out.push(S.notochord);
    out.push('');
    S.allUnits().forEach(u => {
      out.push('---');
      out.push('');
      out.push('## ' + unitHeading(u));
      out.push('');
      out.push('### Vertebra'); out.push(''); out.push(u.vertebra); out.push('');
      out.push('### Spine');    out.push(''); out.push(u.spine);    out.push('');
      out.push('### Skeleton'); out.push(''); out.push(u.skeleton); out.push('');
    });
    return out.join('\n');
  }

  // Focus-only payload: ALL-CAPS labels (legacy format the previous per-unit
  // copy buttons emitted). Notochord + this unit only.
  function buildFocus(S, unit) {
    const lines = [];
    lines.push('SPINE — ' + S.meta.title
      + ' — last updated ' + S.meta.lastUpdated
      + ' — focus: ' + unitHeading(unit));
    lines.push('');
    lines.push('NOTOCHORD');
    lines.push(S.notochord);
    lines.push('');
    lines.push(unitHeading(unit));
    lines.push('');
    lines.push('VERTEBRA'); lines.push(unit.vertebra); lines.push('');
    lines.push('SPINE');    lines.push(unit.spine);    lines.push('');
    lines.push('SKELETON'); lines.push(unit.skeleton);
    return lines.join('\n');
  }

  return {
    unitHeading,
    copyText,
    buildReadMarkdown,
    buildLlmMarkdown,
    buildFocus
  };
}());
