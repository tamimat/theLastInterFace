// claude.ai chat extractor
// ------------------------
// Run this in the browser DevTools console on an open claude.ai/share/<uuid> page,
// or via an automation that has page-script access. It reads the conversation
// out of React component props (the DOM alone is missing timestamps, UUIDs, and
// tool-call structure), serializes everything to markdown, and triggers a
// download of the resulting .md file.
//
// See README.md in this folder for full documentation and the structure of the
// data this script captures.

(() => {
  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  // Walk the React fiber tree upward from a DOM node until we find a fiber
  // whose memoizedProps include a `message` object with a `created_at` field.
  // That object is the message record we want.
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

  // ISO 8601 with local offset, e.g. "2026-05-20T07:00:54+02:00".
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
  // Conversation title and project name.
  //
  // claude.ai's share page renders a header banner above the conversation that
  // reads either:
  //
  //     {Project name}
  //     /
  //     {Conversation title}
  //     Shared by {User}
  //
  // ...or, when the conversation is not inside a Project:
  //
  //     {Conversation title}
  //     Shared by {User}
  //
  // document.title is unreliable: many shared chats are titled "Claude" in the
  // tab while the in-page header has the real title. So we parse the header
  // banner directly by anchoring on the "Shared by " line and walking up to a
  // parent element whose text matches one of the two patterns.
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
      const m1 = text.match(/^(.+?)\s*\/\s*\n(.+?)\nShared by/); // Project / Title
      if (m1) {
        projectName = m1[1].trim();
        conversationTitle = m1[2].trim();
        break;
      }
      const m2 = text.match(/^(.+?)\nShared by/); // Title only (no project)
      if (m2 && !conversationTitle) conversationTitle = m2[1].trim();
    }
  }
  if (!conversationTitle || conversationTitle.length < 2) {
    conversationTitle = document.title === 'Claude' ? 'untitled claude.ai share' : document.title;
  }

  // ---------------------------------------------------------------------------
  // Find all messages.
  //
  // Each message turn has an accessibility-only `<h2 class="sr-only">` whose
  // text starts with "You said:" or "Claude responded:". The actual message
  // data lives in a React fiber up the tree. We iterate speaker h2s directly
  // (rather than children of a guessed container div) which works for chats
  // of any length, including very short ones.
  // ---------------------------------------------------------------------------
  const speakerH2s = Array.from(document.querySelectorAll('h2.sr-only')).filter((h) =>
    /^(You said:|Claude responded:)/.test(h.innerText || '')
  );
  if (speakerH2s.length === 0) {
    console.error('shared-chat-archiver: no speaker h2s found — page may not have rendered yet or DOM has changed');
    return { error: 'no speakers' };
  }

  const collected = [];
  for (const speaker of speakerH2s) {
    const msg = findMessageProp(speaker);
    if (msg) collected.push(msg);
  }
  const seen = new Set();
  const messages = collected.filter((m) => {
    if (seen.has(m.uuid)) return false;
    seen.add(m.uuid);
    return true;
  });
  messages.sort((a, b) => (a.index || 0) - (b.index || 0));

  if (messages.length === 0) {
    console.error('shared-chat-archiver: speakers found but no message props via fiber walk');
    return { error: 'no messages' };
  }

  // ---------------------------------------------------------------------------
  // Build the markdown.
  // ---------------------------------------------------------------------------
  const lines = [];
  const push = (...ls) => {
    for (const l of ls) lines.push(l);
  };

  push(`# ${conversationTitle}`);
  push('');
  push(`- Source: ${location.href}`);
  if (projectName) push(`- Project: ${projectName}`);
  push(
    `- Conversation span: ${toLocalISO(messages[0].created_at)} to ${toLocalISO(
      messages[messages.length - 1].created_at
    )}`
  );
  push(`- Local timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  push(
    `- Message count: ${messages.length} ` +
      `(${messages.filter((m) => m.sender === 'human').length} user, ` +
      `${messages.filter((m) => m.sender === 'assistant').length} assistant)`
  );
  push('- Schema note: Each message block includes all metadata captured from the claude.ai share page React data. Image and file blobs are not preserved by claude.ai shared chats; only metadata about them is retained.');
  push('');
  push('---');
  push('');

  let lastDay = null;
  for (const msg of messages) {
    const localTs = toLocalISO(msg.created_at);
    const day = localTs.slice(0, 10);
    if (day !== lastDay) {
      if (lastDay !== null) push('');
      push(`--- ${day} ---`);
      push('');
      lastDay = day;
    }

    const role =
      msg.sender === 'human' ? 'User' : msg.sender === 'assistant' ? 'Claude' : msg.sender;

    push(`## ${role} — ${localTs}`);
    push('');
    push(`- uuid: \`${msg.uuid}\``);
    if (typeof msg.index !== 'undefined') push(`- index: ${msg.index}`);
    push(`- sender: ${msg.sender}`);
    push(
      `- parent_message_uuid: ${
        msg.parent_message_uuid ? '`' + msg.parent_message_uuid + '`' : 'null'
      }`
    );
    push(`- created_at_utc: \`${msg.created_at}\``);
    if (msg.updated_at && msg.updated_at !== msg.created_at) {
      push(`- updated_at_utc: \`${msg.updated_at}\` (edited)`);
    } else if (msg.updated_at) {
      push(`- updated_at_utc: \`${msg.updated_at}\` (no edit)`);
    }
    if (msg.input_mode) push(`- input_mode: ${msg.input_mode}`);
    if (typeof msg.truncated !== 'undefined') push(`- truncated: ${msg.truncated}`);
    if (msg.stop_reason) push(`- stop_reason: ${msg.stop_reason}`);
    if (typeof msg.image_count === 'number') push(`- image_count: ${msg.image_count}`);
    if (typeof msg.file_count === 'number') push(`- file_count: ${msg.file_count}`);
    if (msg.compaction_summary) push('- compaction_summary: (see below)');

    if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
      push(`- attachments: ${msg.attachments.length}`);
      push('');
      push('### Attachments');
      push('');
      msg.attachments.forEach((a, i) => {
        push(`#### Attachment ${i + 1}`);
        push('');
        if (a.id) push(`- id: \`${a.id}\``);
        if (a.file_name) push(`- file_name: \`${a.file_name}\``);
        if (a.file_type) push(`- file_type: \`${a.file_type}\``);
        if (typeof a.file_size === 'number') push(`- file_size: ${a.file_size} bytes`);
        if (a.created_at) push(`- attachment_created_at_utc: \`${a.created_at}\``);
        if (a.extracted_content) {
          push('');
          push('##### extracted_content');
          push('');
          push('```');
          push(a.extracted_content);
          push('```');
        }
        push('');
      });
    }

    if (Array.isArray(msg.files) && msg.files.length > 0) {
      push(`- files: ${msg.files.length}`);
      push('');
      push('### Files');
      push('');
      msg.files.forEach((f, i) => {
        push(`#### File ${i + 1}`);
        push('');
        for (const k of Object.keys(f)) {
          const v = f[k];
          if (typeof v === 'string' && v.length < 200) push(`- ${k}: \`${v}\``);
          else if (typeof v === 'number' || typeof v === 'boolean') push(`- ${k}: ${v}`);
        }
        push('');
      });
    }

    if (msg.compaction_summary && typeof msg.compaction_summary === 'object') {
      push('');
      push('### Compaction summary');
      push('');
      push('```json');
      try {
        push(JSON.stringify(msg.compaction_summary, null, 2));
      } catch (e) {
        push('(unserializable)');
      }
      push('```');
      push('');
    }

    push('');
    push('### Content');
    push('');

    if (Array.isArray(msg.content)) {
      msg.content.forEach((c, i) => {
        const num = `[${i + 1}]`;

        if (c.type === 'text') {
          push(`${num} text`);
          if (Array.isArray(c.citations) && c.citations.length > 0) {
            push('');
            push('citations:');
            c.citations.forEach((cit, ci) => {
              push(`  ${ci + 1}. ${JSON.stringify(cit).slice(0, 500)}`);
            });
          }
          push('');
          push((c.text || '').trim());
          push('');
        } else if (c.type === 'tool_use') {
          push(`${num} tool_use`);
          if (c.id) push(`- id: \`${c.id}\``);
          if (c.name) push(`- name: ${c.name}`);
          if (c.integration_name) push(`- integration_name: ${c.integration_name}`);
          if (c.mcp_server_url) push(`- mcp_server_url: ${c.mcp_server_url}`);
          if (typeof c.is_mcp_app !== 'undefined') push(`- is_mcp_app: ${c.is_mcp_app}`);
          if (c.input !== undefined) {
            push('');
            push('input:');
            push('```json');
            try {
              push(JSON.stringify(c.input, null, 2));
            } catch (e) {
              push(String(c.input));
            }
            push('```');
          }
          if (c.message) {
            push('');
            push(
              `message: ${typeof c.message === 'string' ? c.message : JSON.stringify(c.message)}`
            );
          }
          if (c.context) {
            push('');
            push(
              `context: ${
                typeof c.context === 'string' ? c.context : JSON.stringify(c.context).slice(0, 500)
              }`
            );
          }
          push('');
        } else if (c.type === 'tool_result') {
          push(`${num} tool_result`);
          if (c.tool_use_id) push(`- tool_use_id: \`${c.tool_use_id}\``);
          if (typeof c.is_error !== 'undefined') push(`- is_error: ${c.is_error}`);
          if (c.meta) push(`- meta: ${JSON.stringify(c.meta).slice(0, 300)}`);
          push('');
          if (c.content !== undefined) {
            push('content:');
            push('```');
            push(typeof c.content === 'string' ? c.content : JSON.stringify(c.content, null, 2));
            push('```');
          }
          if (c.structured_content) {
            push('');
            push('structured_content:');
            push('```json');
            try {
              push(JSON.stringify(c.structured_content, null, 2));
            } catch (e) {
              push('(unserializable)');
            }
            push('```');
          }
          if (c.display_content) {
            push('');
            push('display_content:');
            push('```');
            push(
              typeof c.display_content === 'string'
                ? c.display_content
                : JSON.stringify(c.display_content)
            );
            push('```');
          }
          push('');
        } else {
          push(`${num} ${c.type}`);
          push('');
          push('```json');
          try {
            push(JSON.stringify(c, null, 2).slice(0, 2000));
          } catch (e) {
            push('(unserializable)');
          }
          push('```');
          push('');
        }
      });
    } else if (msg.text) {
      push(msg.text);
      push('');
    }

    push('---');
    push('');
  }

  const markdown = lines.join('\n');

  const firstDay = toLocalISO(messages[0].created_at).slice(0, 10);
  const titleSlug =
    conversationTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'untitled';
  const filename = `${firstDay}--claudeai__${titleSlug}.md`;

  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  window.__archiveContent = markdown;

  console.log(
    `shared-chat-archiver: wrote ${filename} ` +
      `(${markdown.length} chars, ${messages.length} messages: ` +
      `${messages.filter((m) => m.sender === 'human').length} user / ` +
      `${messages.filter((m) => m.sender === 'assistant').length} assistant)`
  );
  return { filename, projectName, conversationTitle, length: markdown.length, messageCount: messages.length };
})();
