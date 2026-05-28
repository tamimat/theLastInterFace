# ChatGPT share page — data structure reference

This document catalogues the fields the extractor reads. The conversation data lives on the page at:

```
window.__reactRouterContext.state.loaderData["routes/share.$shareId.($action)"].serverResponse.data
```

The object mirrors the response from ChatGPT's internal `/backend-api/conversation/{id}` endpoint.

## Top-level fields on `data`

| Field | Type | Notes |
|---|---|---|
| `title` | string | Conversation title shown in the tab/header. |
| `conversation_id` | string (uuid) | Matches the share URL slug. |
| `create_time` | float (unix seconds) | When the conversation was created. |
| `update_time` | float (unix seconds) | When it was last modified. |
| `default_model_slug` | string | The default model at the time of sharing, e.g. `gpt-5-5`. |
| `model` | object | `{title, slug, ...}` — the model used for the latest turns. |
| `mapping` | object | Full message tree, keyed by node id. Each value: `{id, parent, children: [], message}`. Includes regenerations and pruned branches. |
| `current_node` | string (uuid) | Leaf node id of the active branch. |
| `linear_conversation` | array | The active branch already flattened in display order. Each item: `{id, parent, children, message}`. **This is what the extractor iterates.** |
| `og_title`, `og_description`, `og_image_variant` | string | Open Graph meta for the share card. |
| `is_archived`, `is_temporary_chat`, `is_do_not_remember`, `memory_scope` | misc | Privacy and lifecycle flags. |
| `safe_urls`, `blocked_urls`, `disabled_tool_ids` | arrays | Moderation / capability flags. |

## Per-node fields (on items in `mapping` and `linear_conversation`)

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | Node id. The first node in a conversation has `message == null` (the tree root). |
| `parent` | string (uuid) \| null | Parent node id. |
| `children` | array of string | Child node ids in birth order. Length > 1 = a regeneration / edit happened here. |
| `message` | object \| null | The actual message; see below. |

## Per-message fields (on `node.message`)

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | Message id. Distinct from node id. |
| `author` | object | `{role: "user"|"assistant"|"system"|"tool", name?: string, metadata: {}}`. For tool replies, `name` is the tool channel ("python", "browser", etc.). |
| `create_time` | float \| null | Unix seconds. Sometimes null on seed/system messages. |
| `update_time` | float \| null | Unix seconds; differs from `create_time` if the user edited the message. |
| `content` | object | The payload — see "Content types" below. |
| `status` | string | `finished_successfully`, `in_progress`, `finished_partial_completion`, etc. |
| `end_turn` | boolean \| null | True when this message ends the assistant's turn. False for intermediate assistant tool calls. |
| `weight` | number | 1.0 normally; 0 for messages excluded from context. |
| `recipient` | string | `all` for normal turns; a tool channel id (e.g. `t2uay3k.sj1i4kz`) when the assistant is calling a tool. |
| `metadata` | object | See below. |

## Common `message.metadata` fields

Not every field is present on every message. The extractor surfaces a curated subset.

| Field | Type | Notes |
|---|---|---|
| `model_slug` | string | Model that produced this message. |
| `default_model_slug` | string | Default slug at the time. |
| `parent_id` | string | Sometimes set; redundant with `node.parent`. |
| `request_id` | string | Server request id. Useful for support tickets. |
| `message_source` | string | E.g. `instant`. |
| `message_type` | string | E.g. `next`, `variant`. |
| `is_visually_hidden_from_conversation` | boolean | True for system prompts and `model_set_context` writes — hidden in the UI but kept in the archive. |
| `finish_details` | object | `{type, stop_tokens?, ...}`. |
| `citations` | array | Web citations: `{start_ix, end_ix, citation_format, metadata: {url, title, ...}}`. |
| `search_result_groups` | array | Grouped browsing results. |
| `attachments` | array | User-uploaded files: `{id, name, size, mime_type, ...}`. |
| `voice_mode_message` | boolean | Set on advanced-voice messages. |
| `gizmo_id` | string | If the conversation is inside a custom GPT. |

## Content types (on `message.content.content_type`)

### `text`

```json
{ "content_type": "text", "parts": ["..."] }
```

The normal case. `parts` is an array of strings; usually one element.

### `multimodal_text`

```json
{
  "content_type": "multimodal_text",
  "parts": [
    "text fragment",
    {
      "content_type": "image_asset_pointer",
      "asset_pointer": "file-service://file-...",
      "size_bytes": 12345,
      "width": 1024,
      "height": 768,
      "metadata": { ... }
    }
  ]
}
```

Text mixed with asset references. Images are not preserved in shared chats; only metadata survives.

### `code`

```json
{ "content_type": "code", "language": "python3", "text": "..." }
```

Tool-call input from the assistant. `recipient` on the parent message identifies which tool the code is sent to (e.g. `python`, `t2uay3k.sj1i4kz`).

### `execution_output`

```json
{ "content_type": "execution_output", "text": "..." }
```

The text response from a tool execution.

### `thoughts`

```json
{
  "content_type": "thoughts",
  "thoughts": [
    { "summary_text": "...", "content": "..." }
  ]
}
```

Reasoning summaries surfaced from o-series / GPT-5 models. `summary_text` is what ChatGPT shows the user; `content` (when present) is the longer internal chain.

### `reasoning_recap`

```json
{ "content_type": "reasoning_recap", "text": "..." }
```

A final summary of reasoning, distinct from `thoughts` blocks.

### `model_editable_context`

```json
{
  "content_type": "model_editable_context",
  "model_set_context": "...string or structured object..."
}
```

Custom instructions, memory writes, or similar control-plane content. Usually `is_visually_hidden_from_conversation: true` so it doesn't appear in the rendered UI, but the extractor includes it for completeness.

### `tether_quote`, `tether_browsing_display`

Browsing-tool blocks (quoted snippets, link previews). Fields vary; the extractor falls back to dumping known string keys as fenced text and object keys as JSON.

### `system_error`

```json
{ "content_type": "system_error", "name": "...", "text": "..." }
```

Errors surfaced into the conversation (e.g. tool timeouts).

### Unknown content types

The extractor's default case dumps the entire content block as JSON. If a new `content_type` appears, the archive remains lossless even if the formatting is generic.

## Tool calls in this data model

ChatGPT does not have explicit `tool_use` / `tool_result` content blocks like claude.ai. Instead:

1. **Tool call:** an assistant message with `recipient !== "all"` (e.g. `t2uay3k.sj1i4kz` for code interpreter, or a tool channel name). Content is typically `content_type: code`.
2. **Tool reply:** the next message has `author.role === "tool"` and `author.name` set to the tool channel id. Content is typically `multimodal_text` (text + image pointers) or `execution_output`.

To reconstruct call/reply pairs from the archive, walk the message list looking for consecutive `recipient !== "all"` → `author.role === "tool"` transitions.

## Active branch vs. full tree

`linear_conversation` follows the path from root to `current_node`. If the user regenerated a response or edited a previous message, the alternate branches live in `mapping` but are not in `linear_conversation`. The extractor archives only the active branch on purpose — that's what the share page renders. If you want to recover alternate branches, parse `mapping` separately.
