# React data structure on claude.ai share pages

A reference for what fields exist where on a `claude.ai/share/<uuid>` page, and how to reach them. Use this when extending the extractor or debugging a broken extraction.

## How to reach the data

Each message on the share page is rendered with an `<h2 class="sr-only">` inside it whose text starts with `"You said:"` (user) or `"Claude responded:"` (assistant). This is an accessibility label only visible to screen readers; the extractor uses it as the anchor for finding messages.

To reach the underlying `message` object, walk the React fiber tree upward from any DOM node inside the message:

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
| `input_mode` | string | `text`, `retry`, `speech_input`. User messages only. |
| `truncated` | boolean | Was the message cut off (e.g., streamed response interrupted). |
| `stop_reason` | string | Assistant messages only: `stop_sequence`, `user_canceled`, `max_tokens`, etc. |
| `attachments` | array | User-attached files. See below. |
| `files` | array | Distinct from attachments — additional file references. Schema varies. |
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

Each entry in `message.content[]`. Items are processed in order — the order matters for `tool_use` / `tool_result` pairing.

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
| `name` | string | Tool name. Common: `create_file`, `str_replace`, `present_files`, `view`, `web_search`, `ask_user_input_v0`. Custom MCP tools have their integration's namespacing. |
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

## Artifact identification (specific to this skill)

Artifacts in claude.ai are not a dedicated content type — they're files Claude wrote during the conversation via the `create_file` tool. To extract them:

### `create_file` tool_use input shape

```json
{
  "path": "/mnt/user-data/outputs/the-last-interface-manifesto.md",
  "file_text": "...the full file body...",
  "description": "Rewrite as a manifesto — short, punchy, ..."
}
```

### `str_replace` tool_use input shape

```json
{
  "path": "/mnt/user-data/outputs/the-last-interface-manifesto.md",
  "old_str": "exact substring currently in the file",
  "new_str": "replacement text",
  "description": "Why this edit (optional)"
}
```

The paired `tool_result` carries `is_error: true` when `old_str` doesn't appear in the file (or appears more than once and is therefore ambiguous). The `content` field of the failed result includes a message like `"String to replace not found in <path>. Use the view tool to see the current file content..."`. Successful results carry `is_error: false` and a brief confirmation.

The extractor applies successful `str_replace` edits to the running body of the currently-open artifact for the same path, matching Claude's actual behavior of replacing the first occurrence of `old_str`. Failed edits are counted in `tool_sequence.str_replace_failed` but don't change the body.

### `present_files` tool_use input shape

Newer chats:
```json
{ "filepaths": ["/mnt/user-data/outputs/foo.md", "/mnt/user-data/outputs/bar.md"] }
```

Older chats may use:
```json
{ "files": [{ "path": "/mnt/user-data/outputs/foo.md", ... }] }
```
or:
```json
{ "file_path": "/mnt/user-data/outputs/foo.md" }
```

The extractor handles all three.

### Extraction workflow

The extractor:

1. Collects every `tool_use` with `name == "create_file"` and a string `input.file_text`. Each becomes an artifact candidate with the initial body set to `input.file_text`.
2. Walks all subsequent `tool_use` blocks. For each `str_replace` whose paired `tool_result.is_error == false`, finds the first occurrence of `input.old_str` in the currently-open artifact for that path and replaces it with `input.new_str`. A second `create_file` on the same path starts a fresh artifact; later edits then apply to it.
3. Slugs each path: basename → drop extension → strip a project prefix detected either from multi-stem common-prefix analysis (≥2 artifacts) OR from the conversation's project-name header (single-artifact case) → kebab-case. Whichever strategy yields the longer prefix wins.
4. Versions slug collisions chronologically (`<slug>`, `<slug>-v2`, ...).
5. Writes each as `artifacts/<slug>.<ext>` inside the ZIP, with YAML front matter recording `tool_sequence` counts (create_file, str_replace_succeeded, str_replace_failed, present_files) for the source path.
6. Rewrites the transcript's `input.file_text` value to `[artifact body extracted to artifacts/<slug>.<ext>]`. All other input fields and the paired `tool_result` are preserved.

### Related tool tracking

For each path, the YAML front matter's `tool_sequence` block counts:

- `create_file` — how many times Claude wrote this path (each call produces a separate artifact file with `-vN` suffix; the body of each is the post-edits state at the moment the next `create_file` on this path takes over, or at end of conversation)
- `str_replace_succeeded` — successful in-place edits applied to the running body
- `str_replace_failed` — failed edits (e.g., the target string wasn't found); not applied to the body, but counted
- `present_files` — how many times the file was shown to the user as a card

### YAML front matter

Every extracted artifact begins with:

```yaml
---
source_chat: <archive-basename>.md
source_path: <input.path from the create_file call>
created_in_chat: <ISO 8601 local timestamp of the message>
created_at_utc: <message.created_at>
tool_use_id: <c.id>
description: <input.description, JSON-string-escaped>
tool_sequence:
  create_file: N
  str_replace_succeeded: N
  str_replace_failed: N
  present_files: N
extraction_method: automatic
---
```

This is identical in shape to the legacy `/artifacts/` front matter, so the legacy and new files are mutually readable.

## Notable absences

These DO NOT exist anywhere in the React props of a share page:

- IP address
- Geolocation, country, city, region
- User account email, name, or organization
- Conversation-level wrapper (a `conversation` prop with title and other metadata is not reachable from message fibers; the extractor parses the header banner DOM for title and project)
- API keys, tokens, session identifiers

The browser's local timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone` is the closest thing to a "user location" signal and only exists because it's a standard browser API, not because claude.ai exposes it.

## What changes between conversations

Different shared chats may exercise different parts of the schema. The extractor is built to handle:

- Chats with no tools used → only `text` content items, no artifacts extracted
- Chats with tool calls (`web_search`, `create_file`, MCP integrations) → `tool_use` and `tool_result` blocks
- Chats with attachments → `attachments[]` populated with `extracted_content`
- Chats spanning multiple days → date dividers between messages
- Chats with edits → `updated_at > created_at` for affected messages
- Chats that were compacted → `compaction_summary` populated on the message at the compaction boundary
- Speech-to-text messages → `input_mode: speech_input`
- Regenerated responses → `input_mode: retry`
- Chats with many regenerated artifacts → multiple `<slug>-vN` files in the artifacts folder

If you hit a `content[].type` the extractor doesn't recognize, it falls through to dumping the entire content item as JSON in a code block — that way nothing is silently lost.
