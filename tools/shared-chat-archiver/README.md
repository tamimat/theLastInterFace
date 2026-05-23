# claude.ai chat extractor

A browser-side script that extracts a full transcript of a publicly-shared claude.ai conversation, preserving all metadata the share page exposes (timestamps, message UUIDs, threading, tool calls, attachments).

## Why this exists

claude.ai's "Share" feature produces a public URL like `https://claude.ai/share/<uuid>` that renders the conversation as a static page. There is no public API for retrieving share-page contents. The HTML alone is missing critical context — timestamps are only visible on hover (rendered via a Radix UI tooltip that lazy-mounts the time string when you mouse over it), and per-message metadata like UUIDs and tool calls aren't displayed in the UI at all.

This script reaches into the page's React component tree to pull the underlying data and serializes it to a clean, machine-readable markdown file suitable for archiving in a git repo and feeding to an LLM later.

## What the output looks like

A single `.md` file. Header with conversation-level metadata; one block per message:

```markdown
## User — 2026-05-20T07:00:54+02:00

- uuid: `019e43c2-141f-7616-a646-b3a186536fcb`
- index: 0
- sender: human
- parent_message_uuid: `00000000-0000-4000-8000-000000000000`
- created_at_utc: `2026-05-20T05:00:54.246552Z`
- updated_at_utc: `2026-05-20T05:00:54.246552Z` (no edit)
- input_mode: text
- truncated: false
- image_count: 1
- file_count: 0

### Content

[1] text

What I'm do you understand from this picture?
```

For Claude messages that called tools, the content array is preserved in order with each `tool_use` and `tool_result` rendered as its own block.

Plain text date dividers (`--- 2026-05-21 ---`) separate days when a conversation spans multiple calendar days. Timestamps are ISO 8601 with local offset.

## How to use it

1. Open the claude.ai share URL in a Chrome browser that has Claude in Chrome installed.
2. Either: (a) ask a Cowork session that has Claude-in-Chrome tools to "archive this share link, paste URL", and it will navigate, run the script, and trigger the download; or (b) open the share URL manually, paste the contents of `extractor.js` into the DevTools console, and the file will download.
3. Move the downloaded `.md` from `~/Downloads` into your archive folder.

Filename convention used by this project: `YYYY-MM-DD--claudeai__short-slug.md` based on the conversation's start date.

## What's captured per message

| Field | Source | Notes |
|---|---|---|
| `uuid` | `message.uuid` | Message-level unique ID |
| `index` | `message.index` | Position in conversation |
| `sender` | `message.sender` | `human` or `assistant` |
| `parent_message_uuid` | `message.parent_message_uuid` | Threading; `00000000-...` for conversation root |
| `created_at` (UTC + local) | `message.created_at` | ISO 8601 |
| `updated_at` | `message.updated_at` | Differs from `created_at` if message was edited |
| `input_mode` | `message.input_mode` | `text`, `retry`, `speech_input` |
| `truncated` | `message.truncated` | Was the response cut off |
| `stop_reason` | `message.stop_reason` | `stop_sequence` (normal), `user_canceled`, `max_tokens`, etc. |
| `image_count` / `file_count` | `message.image_count` / `message.file_count` | Counts of attached media |
| `attachments[]` | `message.attachments` | Each: `id`, `file_name`, `file_type`, `file_size`, `extracted_content`, `created_at` |
| `compaction_summary` | `message.compaction_summary` | If claude.ai compacted the conversation, the summary kept |
| `content[]` | `message.content` | Array of content items |

For each content item:

| Field | Notes |
|---|---|
| `type` | `text`, `tool_use`, `tool_result`, possibly others |
| `text` | For text items |
| `start_timestamp` / `stop_timestamp` | Streaming bounds |
| `flags` | Unknown semantics, possibly moderation hints |
| `citations[]` | If Claude cited sources |
| `id`, `name`, `input` | For tool_use items |
| `integration_name`, `integration_icon_url`, `is_mcp_app`, `mcp_server_url` | Tool metadata |
| `tool_use_id`, `content`, `is_error`, `structured_content`, `display_content`, `meta` | For tool_result items |

## What's NOT captured

claude.ai's share renderer strips certain things, so they aren't available regardless of how clever the script is:

- **Image and file blobs.** Attachments are listed by name and type, but the binary content of uploaded images/files is not preserved in the share. References to them in the conversation point to nothing.
- **Per-Claude-response timestamps in the rendered DOM.** Claude's responses don't show a date tooltip in the UI, but the script pulls timestamps from React props which DO include `created_at` for every message including assistant responses.
- **The owning user's account info.** No IP, no geolocation, no email or user identifier. The browser's timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) is the closest proxy for "where the user was" — and only because the browser exposes it client-side.

## How the extraction works (technical)

The challenge: claude.ai is a React app, and the data the script needs (timestamps, UUIDs, tool calls) is in component props, not in the rendered DOM. The script:

1. Finds the conversation container by looking for a `<div>` with at least 50 children where the first few children contain `<h2 class="sr-only">` elements (the accessibility-only speaker labels like "You said: ..." / "Claude responded: ...").

2. For each child of that container that represents a message, walks **up** the React fiber tree (using the `__reactFiber$...` property on the DOM node, walking through `.return` parents) until it finds a `memoizedProps.message` object with a `created_at` field. That object contains the full message data.

3. Walks the message's `content[]` array, dispatching by `type` (`text`, `tool_use`, `tool_result`, fallback) to produce one markdown block per content item.

4. Inserts plain-text date dividers when consecutive messages cross a calendar day boundary (in local time).

5. Serializes to a single string, builds a Blob, triggers a download via a synthetic `<a>` click.

The browser's local timezone is captured via `Intl.DateTimeFormat().resolvedOptions().timeZone` and stamped in the header.

## Caveats and assumptions

- The React fiber walking depends on internal React property names (`__reactFiber$<random>`, `memoizedProps`, `return`). These are stable across React versions but not part of React's public API. If React changes them, the script breaks.
- The CSS class names used as anchors (`h2.sr-only`, `span[data-state]`, `text-text-500.text-xs`) are claude.ai's. If they redesign the share page, the script may need adjustments to the anchor selectors, but the fiber-walking logic should still apply.
- The script assumes the share page has fully rendered when it runs. In an automated pipeline, allow a second or two after navigation before executing.

## License

Same as the parent repo. (License decision deferred at time of writing — likely CC BY 4.0.)
