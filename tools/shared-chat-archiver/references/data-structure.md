# React data structure on claude.ai share pages

A reference for what fields exist where on a `claude.ai/share/<uuid>` page, and how to reach them. Use this when extending the extractor or debugging a broken extraction.

## How to reach the data

Each message on the share page is rendered as a child of a specific container div:

```js
const allDivs = Array.from(document.querySelectorAll('div'));
const container = allDivs.find((d) => {
  if (!d.children || d.children.length < 50) return false;
  return Array.from(d.children).slice(0, 5).some((c) => c.querySelector('h2.sr-only'));
});
```

Each direct child of `container` that has an `h2.sr-only` inside it is one message. The h2's text starts with `"You said:"` (user message) or `"Claude responded:"` (assistant message) — this is an accessibility label only visible to screen readers.

To reach the underlying `message` object, walk the React fiber tree upward from the DOM node:

```js
const fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber'));
let fiber = el[fiberKey];
while (fiber) {
  const props = fiber.memoizedProps || fiber.pendingProps;
  if (props?.message?.created_at) return props.message;
  fiber = fiber.return;
}
```

The `message` prop sits at fiber depth ~23 from the leaf message child. Walk no more than 30 levels — beyond that you're risking false matches.

## Per-message fields

The `message` object on each fiber. All optional unless noted.

| Field | Type | Notes |
|---|---|---|
| `uuid` | string | UUIDv7 (timestamp-ordered). Always present. Use as join key. |
| `index` | number | 0-based position in conversation. Always present. |
| `sender` | string | `"human"` or `"assistant"`. Always present. |
| `text` | string | Aggregated text; often empty when `content[]` is the source of truth. |
| `content` | array | List of content items (see below). The actual message payload. |
| `created_at` | string | UTC ISO 8601, e.g. `2026-05-20T05:00:54.246552Z`. Always present. |
| `updated_at` | string | UTC ISO 8601. If `> created_at`, the message was edited. |
| `parent_message_uuid` | string | UUID of the parent message. The conversation root has `00000000-0000-4000-8000-000000000000`. |
| `input_mode` | string | `text`, `retry`, `speech_input`. User messages only — assistant messages omit this or set it to `text`. |
| `truncated` | boolean | Was the message cut off (e.g., a streamed response interrupted). Rare. |
| `stop_reason` | string | Assistant messages only: `stop_sequence` (normal end), `user_canceled`, `max_tokens`, etc. |
| `attachments` | array | User-attached files. See below. |
| `files` | array | Distinct from attachments — additional file references. Schema varies, dump primitives. |
| `image_count` | number | How many images were attached. |
| `file_count` | number | How many non-image files were attached. |
| `compaction_summary` | object \| null | If claude.ai compacted earlier conversation, the kept summary. |

## Attachment fields

Each entry in `message.attachments[]`:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique attachment ID |
| `file_name` | string | Original filename |
| `file_type` | string | MIME type, e.g. `image/png`, `application/pdf` |
| `file_size` | number | Bytes |
| `extracted_content` | string | The parsed text from the file. Can be long for PDFs. Always include verbatim. |
| `created_at` | string | UTC ISO 8601 of attachment upload time |

The actual binary content of attached images/files is NOT preserved in claude.ai shared chats. `extracted_content` is the only persistent data from attachments.

## Content item fields

Each entry in `message.content[]`. Items are processed in order — the order matters for tool_use/tool_result pairing.

### Common to all content types

| Field | Type | Notes |
|---|---|---|
| `type` | string | `text`, `tool_use`, `tool_result`, or other |
| `start_timestamp` | string | UTC ISO 8601 — when this chunk started streaming |
| `stop_timestamp` | string | UTC ISO 8601 — when this chunk ended |
| `flags` | array \| null | Unknown semantics, possibly moderation or formatting hints |

### type: text

| Field | Type | Notes |
|---|---|---|
| `text` | string | The text body. Preserve verbatim. |
| `citations` | array | Each citation has source URLs and quoted text. Present when Claude cited search results or attached docs. |

### type: tool_use

Claude calling a tool. Pair with the next `tool_result` whose `tool_use_id` matches this item's `id`.

| Field | Type | Notes |
|---|---|---|
| `id` | string | Tool call ID, e.g. `toolu_01H5MWG...`. Use to pair with tool_result. |
| `name` | string | Tool name. Common: `web_search`, `create_file`, `present_files`, `ask_user_input_v0`, `view`. Custom MCP tools have their integration's namespacing. |
| `input` | object | The full input passed to the tool. Serialize as JSON. |
| `message` | string \| object | Tool's status message |
| `integration_name` | string | If from an MCP/integration, the integration's name |
| `integration_icon_url` | string | URL to the integration's icon |
| `icon_name` | string | Icon identifier |
| `is_mcp_app` | boolean \| null | True if from an MCP server |
| `mcp_server_url` | string | The MCP server URL if applicable |
| `context` | string \| object | Additional context |
| `approval_options` | array | If the tool required user approval, the options shown |
| `approval_key` | string | Identifier for the approval prompt |

### type: tool_result

The result that came back from a `tool_use` call.

| Field | Type | Notes |
|---|---|---|
| `tool_use_id` | string | The `id` of the `tool_use` this is responding to |
| `content` | string \| array | The actual result. Often plain text for simple tools, structured for complex ones. |
| `is_error` | boolean | True if the tool errored |
| `structured_content` | object | Parsed/structured version of the result |
| `display_content` | string \| object | What was shown to the user |
| `meta` | object | Metadata about the result (timing, source, etc.) |

## Notable absences

These DO NOT exist anywhere in the React props of a share page:

- IP address
- Geolocation, country, city, region
- User account email, name, or organization
- Conversation-level wrapper (e.g., a `conversation` prop with title and other metadata is not reachable from message fibers; you'd need a different fiber root)
- API keys, tokens, session identifiers

The browser's local timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone` is the closest thing to a "user location" signal and only exists because it's a standard browser API, not because claude.ai exposes it.

## What changes between conversations

Different shared chats may exercise different parts of the schema. The extractor is built to handle:

- Chats with no tools used → only `text` content items
- Chats with tool calls (web_search, create_file, MCP integrations) → `tool_use` and `tool_result` blocks
- Chats with attachments → `attachments[]` populated with `extracted_content`
- Chats spanning multiple days → date dividers between messages
- Chats with edits → `updated_at > created_at` for affected messages
- Chats that were compacted → `compaction_summary` populated on the message at the compaction boundary
- Speech-to-text messages → `input_mode: speech_input`
- Regenerated responses → `input_mode: retry`

If you hit a `content[].type` the extractor doesn't recognize, it falls through to dumping the entire content item as JSON in a code block — that way nothing is silently lost.
