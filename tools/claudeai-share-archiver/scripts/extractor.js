// claude.ai share-page extractor (v2)
// -----------------------------------
// Run this in the browser DevTools console on an open claude.ai/share/<uuid>
// page, or via an automation that has page-script access. It reads the
// conversation out of React component props, extracts every artifact-style
// `create_file` tool call into its own file (with YAML front matter pointing
// back to the source chat), rewrites the transcript so the body is replaced
// with a relative reference, bundles everything into a single ZIP, and
// triggers a download.
//
// Output layout when unzipped:
//   <YYYY-MM-DD>--claudeai__<title-slug>/
//     <YYYY-MM-DD>--claudeai__<title-slug>.md   ← transcript
//     artifacts/
//       <slug>.md                                ← Claude-authored files
//       <slug>-v2.md                             ← later regenerations
//       INDEX.md                                 ← table of all artifacts
//
// See SKILL.md and references/data-structure.md for the data shape this
// script reads.

(() => {
  // ---------------------------------------------------------------------------
  // Locate the conversation.
  //
  // claude.ai's share page renders each message as a child of a div with many
  // children; each message has an h2.sr-only inside it whose text starts with
  // "You said:" or "Claude responded:". The real message payload lives on a
  // React fiber up the tree.
  // ---------------------------------------------------------------------------
  const findMessageProp = (el) => {
    const fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber'));
    if (!fiberKey) return null;
    let fiber = el[fiberKey];
    let depth = 0;
    while (fiber && depth < 30) {
      const props = fiber.memoizedProps || fiber.pendingProps;
      if (props && props.message && props.message.created_at) return props.message;
      fiber = fiber.return;
      depth++;
    }
    return null;
  };

  const toLocalISO = (utcStr) => {
    if (!utcStr) return null;
    const d = new Date(utcStr);
    if (isNaN(d.getTime())) return utcStr;
    const pad = (n) => String(n).padStart(2, '0');
    const tzMin = d.getTimezoneOffset();
    const tzSign = tzMin <= 0 ? '+' : '-';
    const tzAbs = Math.abs(tzMin);
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
      `${tzSign}${pad(Math.floor(tzAbs / 60))}:${pad(tzAbs % 60)}`
    );
  };

  // ---------------------------------------------------------------------------
  // Conversation title and project name (same approach as v1).
  // ---------------------------------------------------------------------------
  let conversationTitle = null;
  let projectName = null;
  const sharedByEl = Array.from(document.querySelectorAll('*')).find((e) =>
    /^Shared by /.test((e.innerText || '').trim())
  );
  if (sharedByEl) {
    let cur = sharedByEl;
    for (let i = 0; i < 6 && cur; i++) {
      cur = cur.parentElement;
      if (!cur) break;
      const text = (cur.innerText || '').trim();
      const m1 = text.match(/^(.+?)\s*\/\s*\n(.+?)\nShared by/);
      if (m1) { projectName = m1[1].trim(); conversationTitle = m1[2].trim(); break; }
      const m2 = text.match(/^(.+?)\nShared by/);
      if (m2 && !conversationTitle) conversationTitle = m2[1].trim();
    }
  }
  if (!conversationTitle || conversationTitle.length < 2) {
    conversationTitle = document.title === 'Claude' ? 'untitled claude.ai share' : document.title;
  }

  // ---------------------------------------------------------------------------
  // Find all messages via fiber walking.
  // ---------------------------------------------------------------------------
  const speakerH2s = Array.from(document.querySelectorAll('h2.sr-only')).filter((h) =>
    /^(You said:|Claude responded:)/.test(h.innerText || '')
  );
  if (speakerH2s.length === 0) {
    console.error('claudeai-share-archiver: no speaker h2s found — page may not have rendered yet');
    return { error: 'no speakers' };
  }
  const collected = [];
  for (const speaker of speakerH2s) {
    const m = findMessageProp(speaker);
    if (m) collected.push(m);
  }
  const seen = new Set();
  const messages = collected.filter((m) => { if (seen.has(m.uuid)) return false; seen.add(m.uuid); return true; });
  messages.sort((a, b) => (a.index || 0) - (b.index || 0));
  if (messages.length === 0) {
    console.error('claudeai-share-archiver: speakers found but no message props via fiber walk');
    return { error: 'no messages' };
  }

  // ---------------------------------------------------------------------------
  // Helpers for slug + extension derivation.
  // ---------------------------------------------------------------------------
  const slug = (s, maxLen = 60) =>
    (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, maxLen);

  const basenameOf = (p) => {
    if (!p) return '';
    const i = p.lastIndexOf('/');
    return i >= 0 ? p.slice(i + 1) : p;
  };
  const stripExt = (name) => {
    const i = name.lastIndexOf('.');
    return i > 0 ? name.slice(0, i) : name;
  };
  const extOf = (name) => {
    const i = name.lastIndexOf('.');
    return i > 0 ? name.slice(i + 1) : '';
  };

  // ---------------------------------------------------------------------------
  // First pass: walk every message's content[] looking for file-related tool
  // calls. Build:
  //   - artifactCandidates: ordered list of {messageIndex, messageUuid, msgCreatedAt, toolUseId, path, fileText, description, ext}
  //   - toolSequence: Map<path, {create_file, str_replace_succeeded, str_replace_failed, present_files}>
  //
  // For str_replace, we ALSO track a per-path "currently-open artifact" so
  // that successful str_replace edits get applied to the running fileText.
  // The end result: artifact.fileText reflects the FINAL state after all
  // applied edits, not just the initial create_file body.
  // ---------------------------------------------------------------------------
  const artifactCandidates = [];
  const toolSequence = new Map();
  const currentArtifactByPath = new Map(); // path -> artifact ref
  const bumpSeq = (path, key) => {
    if (!path) return;
    if (!toolSequence.has(path)) {
      toolSequence.set(path, { create_file: 0, str_replace_succeeded: 0, str_replace_failed: 0, present_files: 0 });
    }
    toolSequence.get(path)[key]++;
  };

  for (let mi = 0; mi < messages.length; mi++) {
    const msg = messages[mi];
    if (!Array.isArray(msg.content)) continue;
    for (let ci = 0; ci < msg.content.length; ci++) {
      const c = msg.content[ci];
      if (!c || c.type !== 'tool_use') continue;
      const name = c.name || '';
      const path = c.input && typeof c.input.path === 'string' ? c.input.path : null;

      if (name === 'create_file' && path && typeof c.input.file_text === 'string') {
        bumpSeq(path, 'create_file');
        const artifact = {
          messageIndex: mi,
          contentIndex: ci,
          messageUuid: msg.uuid,
          msgCreatedAt: msg.created_at,
          toolUseId: c.id || null,
          path,
          fileText: c.input.file_text,
          description: c.input.description || null,
          ext: extOf(basenameOf(path)) || 'md',
        };
        artifactCandidates.push(artifact);
        // Subsequent str_replace edits on this path will be applied to this
        // artifact's running fileText until the next create_file on the path.
        currentArtifactByPath.set(path, artifact);
      } else if (name === 'str_replace' && path) {
        // Determine success from the paired tool_result.
        let isError = false;
        for (let lk = ci + 1; lk < msg.content.length; lk++) {
          const r = msg.content[lk];
          if (r && r.type === 'tool_result' && r.tool_use_id === c.id) {
            isError = !!r.is_error;
            break;
          }
        }
        bumpSeq(path, isError ? 'str_replace_failed' : 'str_replace_succeeded');
        // Apply the edit to the running fileText of the currently-open
        // artifact for this path (skip failed ones).
        if (!isError) {
          const artifact = currentArtifactByPath.get(path);
          const oldStr = c.input && typeof c.input.old_str === 'string' ? c.input.old_str : null;
          const newStr = c.input && typeof c.input.new_str === 'string' ? c.input.new_str : null;
          if (artifact && oldStr !== null && newStr !== null) {
            // Claude's str_replace replaces the first occurrence only — match
            // that behavior to preserve fidelity.
            const idx = artifact.fileText.indexOf(oldStr);
            if (idx >= 0) {
              artifact.fileText = artifact.fileText.slice(0, idx) + newStr + artifact.fileText.slice(idx + oldStr.length);
            }
          }
        }
      } else if (name === 'present_files' && c.input) {
        // The Claude `present_files` tool's input field is `filepaths` (array)
        // — older variants used `files` (array of objects) or `file_path`
        // (string). Handle all three so the counter is right.
        if (Array.isArray(c.input.filepaths)) {
          for (const p of c.input.filepaths) {
            if (typeof p === 'string') bumpSeq(p, 'present_files');
          }
        } else if (Array.isArray(c.input.files)) {
          for (const f of c.input.files) {
            if (f && typeof f.path === 'string') bumpSeq(f.path, 'present_files');
          }
        } else if (typeof c.input.file_path === 'string') {
          bumpSeq(c.input.file_path, 'present_files');
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Derive artifact slugs.
  //
  // Goal: produce short, readable filenames in `artifacts/`. The date and
  // source are already in the parent folder name, so per-artifact filenames
  // should drop project-wide prefixes.
  //
  // Two prefix-detection strategies are tried, longest-result wins:
  //
  //   (A) Multi-stem common-prefix detection: tokenize each basename on '-',
  //       and find the longest token-prefix matched by (n − allowedOutliers)
  //       of the basenames, where allowedOutliers = max(1, floor(n * 0.15)).
  //       Requires ≥2 stems and the prefix must end in '-' and be ≥5 chars.
  //
  //   (B) Project-name hint: derive a slug from the conversation's project
  //       name (parsed from the share-page header banner) and check whether
  //       at least one basename starts with it. Works even for chats with a
  //       single artifact, where (A) can't run.
  //
  // The longer of the two prefixes wins (longer = more characters trimmed).
  //
  // After prefix-stripping, slug collisions are handled by appending
  // chronological -v2, -v3 suffixes.
  // ---------------------------------------------------------------------------
  const baseStems = artifactCandidates.map((a) => stripExt(basenameOf(a.path)));

  // Strategy A — multi-stem detection.
  let prefixA = '';
  if (baseStems.length >= 2) {
    const allowedOutliers = Math.max(1, Math.floor(baseStems.length * 0.15));
    const tokensPerStem = baseStems.map((s) => s.split('-'));
    let best = '';
    for (let si = 0; si < tokensPerStem.length; si++) {
      const tokens = tokensPerStem[si];
      for (let plen = tokens.length - 1; plen >= 1; plen--) {
        const candidate = tokens.slice(0, plen).join('-') + '-';
        if (candidate.length < 5) continue;
        if (candidate.length <= best.length) continue;
        const matches = baseStems.filter((s) => s.startsWith(candidate)).length;
        if (baseStems.length - matches <= allowedOutliers) best = candidate;
      }
    }
    prefixA = best;
  }

  // Strategy B — project-name hint.
  let prefixB = '';
  if (projectName) {
    const candidate = slug(projectName) + '-';
    if (candidate.length >= 5 && baseStems.some((s) => s.startsWith(candidate))) {
      prefixB = candidate;
    }
  }

  // Pick the longer of the two (more characters trimmed = a more specific
  // prefix).
  const commonPrefix = prefixB.length > prefixA.length ? prefixB : prefixA;

  const slugCounter = new Map();
  for (const a of artifactCandidates) {
    let stem = stripExt(basenameOf(a.path));
    if (commonPrefix && stem.startsWith(commonPrefix)) stem = stem.slice(commonPrefix.length);
    let s = slug(stem) || 'artifact';
    const seenCount = (slugCounter.get(s) || 0) + 1;
    slugCounter.set(s, seenCount);
    a.slug = seenCount === 1 ? s : `${s}-v${seenCount}`;
    a.filename = `artifacts/${a.slug}.${a.ext}`;
  }

  // Map (messageIndex, contentIndex) -> artifact filename for transcript rewriting
  const artifactByContentIdx = new Map();
  for (const a of artifactCandidates) artifactByContentIdx.set(`${a.messageIndex}.${a.contentIndex}`, a);

  // ---------------------------------------------------------------------------
  // Compute archive name now so YAML front matter can reference it.
  // ---------------------------------------------------------------------------
  const firstDay = toLocalISO(messages[0].created_at).slice(0, 10);
  const titleSlug = slug(conversationTitle, 60) || 'untitled';
  const archiveBasename = `${firstDay}--claudeai__${titleSlug}`;
  const mdName = `${archiveBasename}.md`;

  // ---------------------------------------------------------------------------
  // Build the transcript markdown (matching v1 format) with file_text replaced
  // by the reference string for any create_file tool_use that we extracted.
  // ---------------------------------------------------------------------------
  const lines = [];
  const push = (...ls) => { for (const l of ls) lines.push(l); };

  push(`# ${conversationTitle}`);
  push('');
  push(`- Source: ${location.href}`);
  if (projectName) push(`- Project: ${projectName}`);
  push(`- Conversation span: ${toLocalISO(messages[0].created_at)} to ${toLocalISO(messages[messages.length - 1].created_at)}`);
  push(`- Local timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  push(`- Message count: ${messages.length} (${messages.filter((m) => m.sender === 'human').length} user, ${messages.filter((m) => m.sender === 'assistant').length} assistant)`);
  push(`- Artifacts extracted: ${artifactCandidates.length} (see \`artifacts/\` folder)`);
  push('- Schema note: Each message block includes all metadata captured from the claude.ai share page React data. Image and file blobs are not preserved by claude.ai shared chats; only metadata about them is retained. `create_file` tool_use blocks have their `file_text` value replaced with a reference to the extracted artifact file; all other fields (path, description, tool_use_id, tool_result) are preserved verbatim.');
  push('');
  push('---');
  push('');

  let lastDay = null;
  for (let mi = 0; mi < messages.length; mi++) {
    const msg = messages[mi];
    const localTs = toLocalISO(msg.created_at);
    const day = localTs.slice(0, 10);
    if (day !== lastDay) { if (lastDay !== null) push(''); push(`--- ${day} ---`); push(''); lastDay = day; }

    const role = msg.sender === 'human' ? 'User' : msg.sender === 'assistant' ? 'Claude' : msg.sender;
    push(`## ${role} — ${localTs}`); push('');
    push(`- uuid: \`${msg.uuid}\``);
    if (typeof msg.index !== 'undefined') push(`- index: ${msg.index}`);
    push(`- sender: ${msg.sender}`);
    push(`- parent_message_uuid: ${msg.parent_message_uuid ? '`' + msg.parent_message_uuid + '`' : 'null'}`);
    push(`- created_at_utc: \`${msg.created_at}\``);
    if (msg.updated_at && msg.updated_at !== msg.created_at) push(`- updated_at_utc: \`${msg.updated_at}\` (edited)`);
    else if (msg.updated_at) push(`- updated_at_utc: \`${msg.updated_at}\` (no edit)`);
    if (msg.input_mode) push(`- input_mode: ${msg.input_mode}`);
    if (typeof msg.truncated !== 'undefined') push(`- truncated: ${msg.truncated}`);
    if (msg.stop_reason) push(`- stop_reason: ${msg.stop_reason}`);
    if (typeof msg.image_count === 'number') push(`- image_count: ${msg.image_count}`);
    if (typeof msg.file_count === 'number') push(`- file_count: ${msg.file_count}`);
    if (msg.compaction_summary) push('- compaction_summary: (see below)');

    if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
      push(`- attachments: ${msg.attachments.length}`); push(''); push('### Attachments'); push('');
      msg.attachments.forEach((a, i) => {
        push(`#### Attachment ${i + 1}`); push('');
        if (a.id) push(`- id: \`${a.id}\``);
        if (a.file_name) push(`- file_name: \`${a.file_name}\``);
        if (a.file_type) push(`- file_type: \`${a.file_type}\``);
        if (typeof a.file_size === 'number') push(`- file_size: ${a.file_size} bytes`);
        if (a.created_at) push(`- attachment_created_at_utc: \`${a.created_at}\``);
        if (a.extracted_content) {
          push(''); push('##### extracted_content'); push(''); push('```'); push(a.extracted_content); push('```');
        }
        push('');
      });
    }

    if (Array.isArray(msg.files) && msg.files.length > 0) {
      push(`- files: ${msg.files.length}`); push(''); push('### Files'); push('');
      msg.files.forEach((f, i) => {
        push(`#### File ${i + 1}`); push('');
        for (const k of Object.keys(f)) {
          const v = f[k];
          if (typeof v === 'string' && v.length < 200) push(`- ${k}: \`${v}\``);
          else if (typeof v === 'number' || typeof v === 'boolean') push(`- ${k}: ${v}`);
        }
        push('');
      });
    }

    if (msg.compaction_summary && typeof msg.compaction_summary === 'object') {
      push(''); push('### Compaction summary'); push(''); push('```json');
      try { push(JSON.stringify(msg.compaction_summary, null, 2)); } catch (e) { push('(unserializable)'); }
      push('```'); push('');
    }

    push(''); push('### Content'); push('');

    if (Array.isArray(msg.content)) {
      msg.content.forEach((c, ci) => {
        const num = `[${ci + 1}]`;
        if (c.type === 'text') {
          push(`${num} text`);
          if (Array.isArray(c.citations) && c.citations.length > 0) {
            push(''); push('citations:');
            c.citations.forEach((cit, cii) => { push(`  ${cii + 1}. ${JSON.stringify(cit).slice(0, 500)}`); });
          }
          push(''); push((c.text || '').trim()); push('');
        } else if (c.type === 'tool_use') {
          push(`${num} tool_use`);
          if (c.id) push(`- id: \`${c.id}\``);
          if (c.name) push(`- name: ${c.name}`);
          if (c.integration_name) push(`- integration_name: ${c.integration_name}`);
          if (c.mcp_server_url) push(`- mcp_server_url: ${c.mcp_server_url}`);
          if (typeof c.is_mcp_app !== 'undefined') push(`- is_mcp_app: ${c.is_mcp_app}`);
          if (c.input !== undefined) {
            push(''); push('input:'); push('```json');
            // For create_file tool_use that we extracted, rewrite file_text to reference
            const ext = artifactByContentIdx.get(`${mi}.${ci}`);
            let inputForJson = c.input;
            if (ext) {
              inputForJson = Object.assign({}, c.input, {
                file_text: `[artifact body extracted to ${ext.filename}]`,
              });
            }
            try { push(JSON.stringify(inputForJson, null, 2)); } catch (e) { push(String(c.input)); }
            push('```');
          }
          if (c.message) {
            push(''); push(`message: ${typeof c.message === 'string' ? c.message : JSON.stringify(c.message)}`);
          }
          if (c.context) {
            push(''); push(`context: ${typeof c.context === 'string' ? c.context : JSON.stringify(c.context).slice(0, 500)}`);
          }
          push('');
        } else if (c.type === 'tool_result') {
          push(`${num} tool_result`);
          if (c.tool_use_id) push(`- tool_use_id: \`${c.tool_use_id}\``);
          if (typeof c.is_error !== 'undefined') push(`- is_error: ${c.is_error}`);
          if (c.meta) push(`- meta: ${JSON.stringify(c.meta).slice(0, 300)}`);
          push('');
          if (c.content !== undefined) {
            push('content:'); push('```');
            push(typeof c.content === 'string' ? c.content : JSON.stringify(c.content, null, 2));
            push('```');
          }
          if (c.structured_content) {
            push(''); push('structured_content:'); push('```json');
            try { push(JSON.stringify(c.structured_content, null, 2)); } catch (e) { push('(unserializable)'); }
            push('```');
          }
          if (c.display_content) {
            push(''); push('display_content:'); push('```');
            push(typeof c.display_content === 'string' ? c.display_content : JSON.stringify(c.display_content));
            push('```');
          }
          push('');
        } else {
          push(`${num} ${c.type}`); push(''); push('```json');
          try { push(JSON.stringify(c, null, 2).slice(0, 2000)); } catch (e) { push('(unserializable)'); }
          push('```'); push('');
        }
      });
    } else if (msg.text) { push(msg.text); push(''); }

    push('---'); push('');
  }

  const markdown = lines.join('\n');

  // ---------------------------------------------------------------------------
  // Build artifact files (YAML front matter + body).
  // ---------------------------------------------------------------------------
  const artifactFiles = [];
  for (const a of artifactCandidates) {
    const seq = toolSequence.get(a.path) || { create_file: 1, str_replace_succeeded: 0, str_replace_failed: 0, present_files: 0 };
    const localCreated = toLocalISO(a.msgCreatedAt);
    // Build YAML lines; filter only null entries (used for the optional
    // description line). Then ensure exactly one blank line between the
    // closing '---' and the body, so the file reads cleanly.
    const yamlLines = [
      '---',
      `source_chat: ${mdName}`,
      `source_path: ${a.path}`,
      `created_in_chat: ${localCreated}`,
      `created_at_utc: ${a.msgCreatedAt}`,
      `tool_use_id: ${a.toolUseId || '(unknown)'}`,
      a.description ? `description: ${JSON.stringify(a.description)}` : null,
      'tool_sequence:',
      `  create_file: ${seq.create_file}`,
      `  str_replace_succeeded: ${seq.str_replace_succeeded}`,
      `  str_replace_failed: ${seq.str_replace_failed}`,
      `  present_files: ${seq.present_files}`,
      'extraction_method: automatic',
      '---',
    ].filter((l) => l !== null);
    const yaml = yamlLines.join('\n') + '\n\n';
    const body = a.fileText;
    artifactFiles.push({ filename: a.filename, content: yaml + body });
  }

  // INDEX.md
  const indexMd = [
    '# Artifacts index',
    '',
    `Companion to ${mdName}.`,
    '',
    '| file | source_path | description |',
    '|---|---|---|',
    ...artifactCandidates.map((a) => `| ${a.filename} | \`${a.path}\` | ${(a.description || '').replace(/\|/g, '\\|').slice(0, 120)} |`),
    '',
  ].join('\n');

  // ---------------------------------------------------------------------------
  // Inline STORED-mode ZIP encoder (same as chatgpt-share-archiver).
  // ---------------------------------------------------------------------------
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const dosTime = 0x0000;
  const dnow = new Date();
  const dosDate = ((dnow.getFullYear() - 1980) << 9) | ((dnow.getMonth() + 1) << 5) | dnow.getDate();
  const enc = new TextEncoder();
  const zipFiles = []; const zipChunks = []; let zipOffset = 0;
  const addFile = (name, dataU8) => {
    const nameBytes = enc.encode(name); const crc = crc32(dataU8); const sz = dataU8.length;
    const header = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(header.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0, true); dv.setUint16(8, 0, true);
    dv.setUint16(10, dosTime, true); dv.setUint16(12, dosDate, true);
    dv.setUint32(14, crc, true); dv.setUint32(18, sz, true); dv.setUint32(22, sz, true);
    dv.setUint16(26, nameBytes.length, true); dv.setUint16(28, 0, true);
    header.set(nameBytes, 30);
    zipChunks.push(header); zipChunks.push(dataU8);
    zipFiles.push({ nameBytes, crc, sz, offset: zipOffset });
    zipOffset += header.length + sz;
  };
  const finalizeZip = () => {
    const cdChunks = []; let cdSize = 0;
    for (const f of zipFiles) {
      const cd = new Uint8Array(46 + f.nameBytes.length);
      const dv = new DataView(cd.buffer);
      dv.setUint32(0, 0x02014b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 20, true);
      dv.setUint16(8, 0, true); dv.setUint16(10, 0, true);
      dv.setUint16(12, dosTime, true); dv.setUint16(14, dosDate, true);
      dv.setUint32(16, f.crc, true); dv.setUint32(20, f.sz, true); dv.setUint32(24, f.sz, true);
      dv.setUint16(28, f.nameBytes.length, true); dv.setUint16(30, 0, true); dv.setUint16(32, 0, true);
      dv.setUint16(34, 0, true); dv.setUint16(36, 0, true); dv.setUint32(38, 0, true); dv.setUint32(42, f.offset, true);
      cd.set(f.nameBytes, 46);
      cdChunks.push(cd); cdSize += cd.length;
    }
    const eocd = new Uint8Array(22);
    const edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true); edv.setUint16(4, 0, true); edv.setUint16(6, 0, true);
    edv.setUint16(8, zipFiles.length, true); edv.setUint16(10, zipFiles.length, true);
    edv.setUint32(12, cdSize, true); edv.setUint32(16, zipOffset, true); edv.setUint16(20, 0, true);
    const all = [...zipChunks, ...cdChunks, eocd];
    const total = all.reduce((s, c) => s + c.length, 0);
    const buf = new Uint8Array(total);
    let pos = 0; for (const c of all) { buf.set(c, pos); pos += c.length; }
    return buf;
  };

  // Markdown first, then artifacts, then INDEX
  addFile(mdName, enc.encode(markdown));
  for (const af of artifactFiles) addFile(af.filename, enc.encode(af.content));
  if (artifactCandidates.length > 0) addFile('artifacts/INDEX.md', enc.encode(indexMd));

  const zip = finalizeZip();
  const zipName = `${archiveBasename}.zip`;

  // Trigger download
  try {
    const blob = new Blob([zip], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = zipName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) {
    console.warn('claudeai-share-archiver: download trigger failed', e);
  }

  // Fallback handles
  window.__archiveContent = markdown;
  window.__archiveFilename = mdName;
  window.__zipName = zipName;
  window.__zipBytes = zip;
  window.__artifactFiles = artifactFiles;

  console.log(
    `claudeai-share-archiver: built ${zipName} ` +
      `(${zip.length} bytes; ${messages.length} messages, ${artifactCandidates.length} artifacts)`
  );

  return {
    zipName,
    mdName,
    archiveBasename,
    conversationTitle,
    projectName,
    zipSize: zip.length,
    messageCount: messages.length,
    userCount: messages.filter((m) => m.sender === 'human').length,
    assistantCount: messages.filter((m) => m.sender === 'assistant').length,
    artifactCount: artifactCandidates.length,
    artifacts: artifactCandidates.map((a) => ({
      filename: a.filename,
      source_path: a.path,
      created_at_utc: a.msgCreatedAt,
      tool_use_id: a.toolUseId,
    })),
    commonPrefixStripped: commonPrefix || null,
  };
})();
