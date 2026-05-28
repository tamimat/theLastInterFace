// ChatGPT share-page extractor
// ----------------------------
// Run this in the browser DevTools console on an open chatgpt.com/share/<uuid>
// page, or via an automation that has page-script access. It reads the
// conversation directly out of the React Router hydration state, fetches the
// generated images from the share-page CDN, serializes everything to markdown
// with inline image references, packages markdown + images into a single ZIP,
// and triggers a download.
//
// See SKILL.md and references/data-structure.md for the structure of the data
// this script captures.
//
// Why a ZIP: chatgpt.com share-page CSP blocks third-party CDN scripts (JSZip,
// etc.) so we inline a minimal STORED-mode ZIP encoder. The CSP also prevents
// us from writing to disk in arbitrary locations, so the browser's synthetic-
// link download is the only way out — bundling into one ZIP keeps the cleanup
// step (move + unzip) a single user action.

(() => {
  // ---------------------------------------------------------------------------
  // Locate the conversation data.
  // ---------------------------------------------------------------------------
  const ctx = window.__reactRouterContext;
  if (!ctx || !ctx.state || !ctx.state.loaderData) {
    console.error('chatgpt-share-archiver: no __reactRouterContext.state.loaderData on page');
    return { error: 'no react router context' };
  }
  const routeKey = Object.keys(ctx.state.loaderData).find((k) => k.includes('share'));
  if (!routeKey) {
    console.error('chatgpt-share-archiver: no share route in loaderData');
    return { error: 'no share route' };
  }
  const loader = ctx.state.loaderData[routeKey];
  const data =
    loader && loader.serverResponse && loader.serverResponse.data
      ? loader.serverResponse.data
      : null;
  if (!data || !Array.isArray(data.linear_conversation)) {
    console.error('chatgpt-share-archiver: linear_conversation missing from loader data');
    return { error: 'no linear_conversation' };
  }

  return new Promise(async (resolve) => {
    // -------------------------------------------------------------------------
    // CRC-32 table + STORED-mode ZIP builder.
    // -------------------------------------------------------------------------
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
    const now = new Date();
    const dosDate =
      ((now.getFullYear() - 1980) << 9) |
      ((now.getMonth() + 1) << 5) |
      now.getDate();
    const enc = new TextEncoder();
    const zipFiles = []; // { nameBytes, crc, sz, offset }
    const zipChunks = [];
    let zipOffset = 0;
    const addFile = (name, dataU8) => {
      const nameBytes = enc.encode(name);
      const crc = crc32(dataU8);
      const sz = dataU8.length;
      const header = new Uint8Array(30 + nameBytes.length);
      const dv = new DataView(header.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 0, true);
      dv.setUint16(8, 0, true); // compression: stored
      dv.setUint16(10, dosTime, true);
      dv.setUint16(12, dosDate, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, sz, true);
      dv.setUint32(22, sz, true);
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true);
      header.set(nameBytes, 30);
      zipChunks.push(header);
      zipChunks.push(dataU8);
      zipFiles.push({ nameBytes, crc, sz, offset: zipOffset });
      zipOffset += header.length + sz;
    };
    const finalizeZip = () => {
      const cdChunks = [];
      let cdSize = 0;
      for (const f of zipFiles) {
        const cd = new Uint8Array(46 + f.nameBytes.length);
        const dv = new DataView(cd.buffer);
        dv.setUint32(0, 0x02014b50, true);
        dv.setUint16(4, 20, true);
        dv.setUint16(6, 20, true);
        dv.setUint16(8, 0, true);
        dv.setUint16(10, 0, true);
        dv.setUint16(12, dosTime, true);
        dv.setUint16(14, dosDate, true);
        dv.setUint32(16, f.crc, true);
        dv.setUint32(20, f.sz, true);
        dv.setUint32(24, f.sz, true);
        dv.setUint16(28, f.nameBytes.length, true);
        dv.setUint16(30, 0, true);
        dv.setUint16(32, 0, true);
        dv.setUint16(34, 0, true);
        dv.setUint16(36, 0, true);
        dv.setUint32(38, 0, true);
        dv.setUint32(42, f.offset, true);
        cd.set(f.nameBytes, 46);
        cdChunks.push(cd);
        cdSize += cd.length;
      }
      const eocd = new Uint8Array(22);
      const edv = new DataView(eocd.buffer);
      edv.setUint32(0, 0x06054b50, true);
      edv.setUint16(4, 0, true);
      edv.setUint16(6, 0, true);
      edv.setUint16(8, zipFiles.length, true);
      edv.setUint16(10, zipFiles.length, true);
      edv.setUint32(12, cdSize, true);
      edv.setUint32(16, zipOffset, true);
      edv.setUint16(20, 0, true);
      const all = [...zipChunks, ...cdChunks, eocd];
      const total = all.reduce((s, c) => s + c.length, 0);
      const buf = new Uint8Array(total);
      let pos = 0;
      for (const c of all) { buf.set(c, pos); pos += c.length; }
      return buf;
    };

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    const toLocalISO = (us) => {
      if (us == null) return null;
      const d = new Date(typeof us === 'number' ? us * 1000 : Date.parse(us));
      if (isNaN(d.getTime())) return String(us);
      const pad = (n) => String(n).padStart(2, '0');
      const tzMin = d.getTimezoneOffset();
      const sign = tzMin <= 0 ? '+' : '-';
      const abs = Math.abs(tzMin);
      return (
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
        `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
        `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
      );
    };
    const toUtcISO = (us) => {
      if (us == null) return null;
      const d = new Date(typeof us === 'number' ? us * 1000 : Date.parse(us));
      return isNaN(d.getTime()) ? String(us) : d.toISOString();
    };
    const roleLabel = (r) =>
      r === 'user' ? 'User' : r === 'assistant' ? 'Assistant' : r === 'system' ? 'System' : r === 'tool' ? 'Tool' : (r || 'Unknown');
    const slug = (s, maxLen = 60) =>
      (s || '')
        .toLowerCase()
        .replace(/^generated image:\s*/i, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, maxLen);

    // -------------------------------------------------------------------------
    // Force lazy-loaded images into the DOM by scrolling the chat container.
    // -------------------------------------------------------------------------
    const scroller = Array.from(document.querySelectorAll('*')).find((el) => {
      const cs = getComputedStyle(el);
      return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > 3000;
    });
    if (scroller) {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        scroller.scrollTop = (scroller.scrollHeight * i) / steps;
        await sleep(150);
      }
      await sleep(800);
      scroller.scrollTop = 0;
      await sleep(200);
    }

    // -------------------------------------------------------------------------
    // Map asset_pointer (sediment://file_<32hex>) → public CDN URL from the DOM.
    // The DOM serves these at /files/<8>-<4>-<4>-<4>-<12>.
    // -------------------------------------------------------------------------
    const fileIdToUrl = new Map();
    const imgEls = Array.from(document.querySelectorAll('img'))
      .filter((img) => img.alt !== 'Profile image' && img.src && img.src.startsWith('http'));
    for (const img of imgEls) {
      const m = img.src.match(/\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (m) {
        const hexId = m[1].replace(/-/g, '');
        if (!fileIdToUrl.has(hexId) || (img.alt && img.alt.length > 0)) {
          fileIdToUrl.set(hexId, { url: img.src, alt: img.alt || null });
        }
      }
    }

    // -------------------------------------------------------------------------
    // Walk linear_conversation to build asset records in chat order.
    // -------------------------------------------------------------------------
    const assets = [];
    const ptrToAsset = new Map();
    let assetIdx = 0;
    for (const node of data.linear_conversation) {
      if (!node.message || !node.message.content) continue;
      const c = node.message.content;
      if (!Array.isArray(c.parts)) continue;
      for (const p of c.parts) {
        if (!(p && typeof p === 'object' && p.asset_pointer && typeof p.asset_pointer === 'string')) continue;
        if (ptrToAsset.has(p.asset_pointer)) continue;
        const m = p.asset_pointer.match(/file_([0-9a-f]{32})/i);
        if (!m) continue;
        const fileId = m[1].toLowerCase();
        assetIdx++;
        const fromDom = fileIdToUrl.get(fileId);
        const alt = (fromDom && fromDom.alt) || `Image ${assetIdx}`;
        const filename = `assets/${String(assetIdx).padStart(2, '0')}__${slug(alt) || 'image'}.png`;
        const rec = {
          assetPointer: p.asset_pointer,
          fileId,
          idx: assetIdx,
          filename,
          url: fromDom ? fromDom.url : null,
          alt,
          width: p.width,
          height: p.height,
          sizeBytes: p.size_bytes,
          ok: false,
        };
        assets.push(rec);
        ptrToAsset.set(p.asset_pointer, rec);
      }
    }

    // -------------------------------------------------------------------------
    // Fetch each image (one retry on failure).
    // -------------------------------------------------------------------------
    const fetchOnce = async (rec) => {
      if (!rec.url) return false;
      try {
        const r = await fetch(rec.url, { credentials: 'omit' });
        if (!r.ok) { rec.err = 'http ' + r.status; return false; }
        const ab = await (await r.blob()).arrayBuffer();
        rec.bytes = new Uint8Array(ab);
        rec.ok = true;
        return true;
      } catch (e) {
        rec.err = String(e).slice(0, 100);
        return false;
      }
    };
    for (const rec of assets) {
      if (await fetchOnce(rec)) continue;
      await new Promise((r) => setTimeout(r, 300));
      await fetchOnce(rec);
    }

    // -------------------------------------------------------------------------
    // Build the markdown (with inline image references).
    // -------------------------------------------------------------------------
    const lines = [];
    const push = (...ls) => { for (const l of ls) lines.push(l); };

    const conversationTitle = data.title || document.title || 'untitled chatgpt share';
    const conversationId = data.conversation_id || '';
    const defaultModelSlug = data.default_model_slug || '';
    const modelTitle = data.model && data.model.title ? data.model.title : null;
    const modelSlug = data.model && data.model.slug ? data.model.slug : null;

    const nodes = data.linear_conversation;
    const withMessage = nodes.filter((n) => n && n.message);
    const firstTs =
      withMessage.find((n) => n.message.create_time) &&
      withMessage.find((n) => n.message.create_time).message.create_time;
    let lastTs = null;
    for (let i = withMessage.length - 1; i >= 0; i--) {
      if (withMessage[i].message.create_time) { lastTs = withMessage[i].message.create_time; break; }
    }
    const roleCounts = withMessage.reduce((acc, n) => {
      const r = (n.message.author && n.message.author.role) || 'unknown';
      acc[r] = (acc[r] || 0) + 1;
      return acc;
    }, {});

    const okAssets = assets.filter((a) => a.ok).length;

    push(`# ${conversationTitle}`); push('');
    push(`- Source: ${location.href}`);
    if (conversationId) push(`- Conversation id: \`${conversationId}\``);
    if (modelTitle || modelSlug || defaultModelSlug) {
      const m = [];
      if (modelTitle) m.push(modelTitle);
      if (modelSlug && modelSlug !== modelTitle) m.push(`(\`${modelSlug}\`)`);
      if (defaultModelSlug && defaultModelSlug !== modelSlug) m.push(`default \`${defaultModelSlug}\``);
      push(`- Model: ${m.join(' ')}`);
    }
    if (data.create_time) push(`- Conversation created: ${toLocalISO(data.create_time)}`);
    if (data.update_time) push(`- Conversation last updated: ${toLocalISO(data.update_time)}`);
    if (firstTs && lastTs) push(`- Message span: ${toLocalISO(firstTs)} to ${toLocalISO(lastTs)}`);
    push(`- Local timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    push(`- Message count: ${withMessage.length} (${Object.entries(roleCounts).map(([r, c]) => `${c} ${r}`).join(', ')})`);
    push(`- Assets: ${assets.length} unique images (${okAssets} downloaded into assets/, ${assets.length - okAssets} unavailable)`);
    push('- Schema note: Active branch only. Images stored in assets/ are the actual binaries fetched from the share-page CDN. User-uploaded images and pruned regenerations are not always reachable from share views and are listed as unavailable.');
    push(''); push('---'); push('');

    let lastDay = null;
    let turnIndex = 0;
    for (const node of nodes) {
      if (!node || !node.message) continue;
      const msg = node.message;
      const localTs = msg.create_time ? toLocalISO(msg.create_time) : null;
      const day = localTs ? localTs.slice(0, 10) : null;
      if (day && day !== lastDay) {
        if (lastDay !== null) push('');
        push(`--- ${day} ---`); push('');
        lastDay = day;
      }
      turnIndex++;
      const role = (msg.author && msg.author.role) || 'unknown';
      push(`## ${roleLabel(role)} — ${localTs || '(no timestamp)'}`); push('');
      if (node.id) push(`- node_id: \`${node.id}\``);
      if (msg.id) push(`- message_id: \`${msg.id}\``);
      push(`- index: ${turnIndex}`);
      push(`- role: ${role}`);
      if (msg.author && msg.author.name) push(`- author_name: \`${msg.author.name}\``);
      if (node.parent) push(`- parent_node: \`${node.parent}\``);
      if (Array.isArray(node.children)) push(`- children: ${node.children.length}`);
      if (msg.create_time) push(`- create_time_utc: \`${toUtcISO(msg.create_time)}\``);
      if (msg.update_time && msg.update_time !== msg.create_time) push(`- update_time_utc: \`${toUtcISO(msg.update_time)}\` (edited)`);
      else if (msg.update_time) push(`- update_time_utc: \`${toUtcISO(msg.update_time)}\` (no edit)`);
      if (msg.status) push(`- status: ${msg.status}`);
      if (typeof msg.end_turn !== 'undefined' && msg.end_turn !== null) push(`- end_turn: ${msg.end_turn}`);
      if (typeof msg.weight !== 'undefined') push(`- weight: ${msg.weight}`);
      if (msg.recipient) push(`- recipient: ${msg.recipient}`);

      const md_ = msg.metadata;
      if (md_ && typeof md_ === 'object') {
        if (md_.model_slug) push(`- model_slug: ${md_.model_slug}`);
        if (md_.default_model_slug && md_.default_model_slug !== md_.model_slug) push(`- default_model_slug: ${md_.default_model_slug}`);
        if (md_.request_id) push(`- request_id: \`${md_.request_id}\``);
        if (md_.message_source) push(`- message_source: ${md_.message_source}`);
        if (md_.message_type) push(`- message_type: ${md_.message_type}`);
        if (md_.is_visually_hidden_from_conversation) push('- is_visually_hidden_from_conversation: true');
        if (md_.finish_details) {
          try { push(`- finish_details: ${JSON.stringify(md_.finish_details)}`); } catch (e) {}
        }
        if (md_.citations && Array.isArray(md_.citations) && md_.citations.length > 0) push(`- citations: ${md_.citations.length}`);

        if (Array.isArray(md_.attachments) && md_.attachments.length > 0) {
          push(''); push('### Attachments'); push('');
          md_.attachments.forEach((a, i) => {
            push(`#### Attachment ${i + 1}`); push('');
            for (const k of Object.keys(a)) {
              const v = a[k];
              if (typeof v === 'string' && v.length < 200) push(`- ${k}: \`${v}\``);
              else if (typeof v === 'number' || typeof v === 'boolean') push(`- ${k}: ${v}`);
              else if (v && typeof v === 'object') {
                try { const j = JSON.stringify(v); if (j.length < 400) push(`- ${k}: \`${j}\``); } catch (e) {}
              }
            }
            push('');
          });
        }
        if (Array.isArray(md_.citations) && md_.citations.length > 0) {
          push(''); push('### Citations'); push('');
          md_.citations.forEach((cit, ci) => {
            try { push(`${ci + 1}. ${JSON.stringify(cit).slice(0, 600)}`); } catch (e) { push(`${ci + 1}. (unserializable)`); }
          });
          push('');
        }
      }

      push(''); push('### Content'); push('');
      const c = msg.content;
      if (!c || !c.content_type) { push('(no content)'); push(''); push('---'); push(''); continue; }
      push(`- content_type: ${c.content_type}`); push('');

      switch (c.content_type) {
        case 'text': {
          (c.parts || []).forEach((p) => {
            if (typeof p === 'string') { push(p); push(''); }
            else { push('```json'); try { push(JSON.stringify(p, null, 2)); } catch (e) {} push('```'); push(''); }
          });
          break;
        }
        case 'multimodal_text': {
          (c.parts || []).forEach((p) => {
            if (typeof p === 'string') { push(p); push(''); }
            else if (p && p.asset_pointer && ptrToAsset.has(p.asset_pointer)) {
              const a = ptrToAsset.get(p.asset_pointer);
              push(`![${a.alt || 'image'}](${a.filename})`); push('');
              push(`- asset_pointer: \`${a.assetPointer}\``);
              if (a.width && a.height) push(`- dimensions: ${a.width}x${a.height}`);
              if (a.sizeBytes) push(`- size_bytes: ${a.sizeBytes}`);
              push(`- local_file: \`${a.filename}\``);
              push(`- download_status: ${a.ok ? 'downloaded' : 'unavailable'}`);
              push('');
            } else if (p && typeof p === 'object') {
              push(`- ${p.content_type || 'asset'}: ${JSON.stringify(p).slice(0, 200)}`); push('');
            }
          });
          break;
        }
        case 'code': {
          push('```' + (c.language || ''));
          push(c.text || '');
          push('```'); push('');
          break;
        }
        case 'thoughts': {
          (c.thoughts || []).forEach((t) => {
            if (t.summary_text) { push(`> ${t.summary_text}`); push(''); }
            if (t.content && typeof t.content === 'string') { push(t.content); push(''); }
          });
          break;
        }
        case 'reasoning_recap': {
          if (typeof c.text === 'string') { push(c.text); push(''); }
          break;
        }
        case 'model_editable_context': {
          push('```');
          push(typeof c.model_set_context === 'string' ? c.model_set_context : JSON.stringify(c.model_set_context, null, 2));
          push('```'); push('');
          break;
        }
        case 'execution_output':
        case 'tether_quote':
        case 'tether_browsing_display':
        case 'system_error': {
          for (const k of Object.keys(c)) {
            if (k === 'content_type') continue;
            const v = c[k];
            if (typeof v === 'string') { push(`- ${k}:`); push('```'); push(v); push('```'); push(''); }
            else if (typeof v === 'number' || typeof v === 'boolean') push(`- ${k}: ${v}`);
            else if (v && typeof v === 'object') {
              push(`- ${k}:`); push('```json');
              try { push(JSON.stringify(v, null, 2)); } catch (e) { push('(unserializable)'); }
              push('```'); push('');
            }
          }
          break;
        }
        default: {
          push('```json');
          try { push(JSON.stringify(c, null, 2)); } catch (e) { push('(unserializable)'); }
          push('```'); push('');
        }
      }
      push('---'); push('');
    }

    const markdown = lines.join('\n');

    // -------------------------------------------------------------------------
    // Filename + bundle.
    // -------------------------------------------------------------------------
    const firstDayISO = firstTs ? toLocalISO(firstTs) : null;
    const firstDay = firstDayISO ? firstDayISO.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const titleSlug = slug(conversationTitle, 60) || 'untitled';
    const mdName = `${firstDay}--chatgpt__${titleSlug}.md`;
    const zipName = `${firstDay}--chatgpt__${titleSlug}.zip`;

    // Markdown first
    addFile(mdName, enc.encode(markdown));
    // Images
    for (const a of assets) {
      if (a.ok && a.bytes) addFile(a.filename, a.bytes);
    }
    // INDEX.md
    const indexMd = [
      '# Assets index',
      '',
      `Companion to ${mdName}.`,
      '',
      '| file | alt | dimensions | downloaded |',
      '|---|---|---|---|',
      ...assets.map((a) =>
        `| ${a.filename} | ${(a.alt || '').replace(/\|/g, '\\|')} | ${a.width || '?'}x${a.height || '?'} | ${a.ok ? 'yes' : 'no'} |`
      ),
      '',
    ].join('\n');
    addFile('assets/INDEX.md', enc.encode(indexMd));

    const zip = finalizeZip();

    // Stash for fallback access
    window.__archiveContent = markdown;
    window.__archiveFilename = mdName;
    window.__zipName = zipName;
    window.__zipBytes = zip;

    // Trigger one download
    try {
      const blob = new Blob([zip], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      console.warn('chatgpt-share-archiver: download trigger failed', e);
    }

    console.log(
      `chatgpt-share-archiver: built ${zipName} ` +
        `(${zip.length} bytes, ${zipFiles.length} entries; ` +
        `${withMessage.length} messages, ${okAssets}/${assets.length} images)`
    );

    resolve({
      zipName,
      mdName,
      conversationTitle,
      conversationId,
      model: modelTitle || modelSlug || defaultModelSlug || null,
      zipSize: zip.length,
      markdownLen: markdown.length,
      messageCount: withMessage.length,
      roleCounts,
      assetTotal: assets.length,
      assetsOk: okAssets,
      assetsFail: assets.filter((a) => !a.ok).map((a) => ({ idx: a.idx, alt: a.alt, reason: a.err || 'no url' })),
    });
  });
})();
