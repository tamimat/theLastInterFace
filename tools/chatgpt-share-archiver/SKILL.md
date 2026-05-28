---
name: chatgpt-share-archiver
description: Archive a publicly-shared ChatGPT conversation as a verbatim markdown transcript plus the actual image binaries, bundled into a single ZIP — full metadata (timestamps in ISO 8601, message and node UUIDs, parent links, model slug, tool-channel recipients), code/tool-call blocks, multimodal asset metadata, reasoning summaries, citations, and inline `![alt](assets/...)` references to downloaded images. Use this skill whenever the user pastes or mentions a `https://chatgpt.com/share/` URL (also `https://chat.openai.com/share/`) and wants it captured, saved, archived, exported, preserved, or downloaded — including phrasings like "archive this share link", "save this ChatGPT conversation", "extract this chat", "capture this thread into the repo", "I want a record of this conversation", "download the chat with images". Do NOT use for `https://chatgpt.com/c/...` URLs — those require authentication and aren't shareable.
---

# ChatGPT chat archiver

This skill turns a public ChatGPT share URL into a single ZIP containing the conversation as markdown plus all the generated images as PNGs, ready to drop into a repo. The reason it exists: ChatGPT's share renderer flattens the rich conversation graph into prose. Per-message timestamps, message UUIDs, the parent/child structure from `mapping`, tool-call channels (when the model talks to `python`, `web`, etc.), model-set-context blocks, reasoning summaries, and asset-pointer metadata for images are all dropped in the rendered HTML. The data is in the page, but it lives in the React Router loader hydration state. The bundled `scripts/extractor.js` reads that loader payload directly, fetches the image binaries from the share-page CDN, and packages everything into one ZIP.

## When to invoke this skill

Trigger on any user request that combines (a) a `https://chatgpt.com/share/<uuid>` URL (or the older `https://chat.openai.com/share/<uuid>` form, or a clear reference to one), with (b) intent to save / archive / preserve / capture / extract / export the conversation. Examples of phrasings:

- "Here's a ChatGPT share link — archive it"
- "Save this chat to my repo: https://chatgpt.com/share/..."
- "I want this conversation preserved as a markdown file, with images"
- "Pull this into the archive folder"
- "Export this thread"
- "Capture the full content of this conversation including timestamps, tool calls, and images"

If the URL is `chatgpt.com/c/...` or `chatgpt.com/g/...` instead of `chatgpt.com/share/...`, the page requires authentication and the share data isn't exposed. Tell the user to click the Share button on the conversation in ChatGPT, generate a public link, and send the resulting `/share/` URL instead.

## What this skill produces

A single `.zip` file with this layout:

```
{first-day-YYYY-MM-DD}--chatgpt__{title-slug}.zip
  {first-day-YYYY-MM-DD}--chatgpt__{title-slug}.md
  assets/
    01__alt-text-slug.png
    02__another-alt-text-slug.png
    ...
    INDEX.md
```

The markdown shape (excerpt):

```markdown
# {conversation title}

- Source: https://chatgpt.com/share/{uuid}
- Conversation id: `{uuid}`
- Model: {Display name} (`{slug}`) default `{default_slug}`
- Conversation created: {ISO 8601 local}
- Conversation last updated: {ISO 8601 local}
- Message span: {first message ISO 8601 local} to {last message ISO 8601 local}
- Local timezone: {IANA timezone}
- Message count: {N} ({a user, b assistant, c system, d tool})
- Assets: {N} unique images ({K} downloaded into assets/, {M} unavailable)
- Schema note: ...

---

--- {YYYY-MM-DD} ---

## User — {ISO 8601 local}
- ...metadata block...

### Content
- content_type: text

{message text verbatim}

---

## Tool — {ISO 8601 local}
- author_name: python
- recipient: all

### Content
- content_type: multimodal_text

{stdout text}

![Generated image: AI communication pipeline diagram](assets/01__ai-communication-pipeline-diagram.png)

- asset_pointer: `sediment://file_<32hex>?shared_conversation_id=...`
- dimensions: 1693x929
- size_bytes: 1122566
- local_file: `assets/01__ai-communication-pipeline-diagram.png`
- download_status: downloaded
```

ISO 8601 timestamps with the user's local offset, plain-text date dividers, no emojis. Inline image refs use relative paths that resolve when the markdown is rendered alongside the `assets/` folder.

`assets/INDEX.md` is a sidecar table listing every asset with alt text, dimensions, and whether it was successfully downloaded.

## How to execute the workflow

### Step 1 — Verify the URL

Check the URL matches `https://chatgpt.com/share/<uuid>` or `https://chat.openai.com/share/<uuid>`. The `/share/` segment is critical — `/c/`, `/g/`, or `/?model=...` URLs require login and won't work.

### Step 2 — Connect a browser

Use `mcp__Claude_in_Chrome__list_connected_browsers` to confirm a browser is connected. If not, ask the user to install/connect the Claude in Chrome extension. Create or reuse a tab via `mcp__Claude_in_Chrome__tabs_context_mcp` (with `createIfEmpty: true` if no tab group exists).

### Step 3 — Navigate to the share URL

Use `mcp__Claude_in_Chrome__navigate` with the share URL. Wait a moment for the React app to render.

### Step 4 — Run the extractor

Read `scripts/extractor.js` from this skill folder and execute it via `mcp__Claude_in_Chrome__javascript_tool` with `action: "javascript_exec"`. The script returns a Promise; it:

1. Locates `window.__reactRouterContext.state.loaderData[…].serverResponse.data` — the loader payload that mirrors the internal conversation API.
2. Scrolls the chat container end-to-end to trigger lazy-load of all images.
3. Builds an `asset_pointer → public CDN URL` map by matching file IDs (32 hex chars in `sediment://file_<id>`) against the DOM `<img>` URLs at `/files/<uuid>`.
4. Fetches every image via `fetch()` (one retry on failure), with `credentials: 'omit'`.
5. Iterates `data.linear_conversation`, serializes each message + content block, and inlines `![alt](assets/...)` references next to each image.
6. Builds a ZIP in-memory (inline STORED-mode encoder — chatgpt.com's CSP blocks loading JSZip from any CDN), containing the markdown, the PNG binaries under `assets/`, and `assets/INDEX.md`.
7. Triggers a single `<a download>` click. The file lands in `~/Downloads/`.
8. Stashes `markdown` on `window.__archiveContent`, the filename on `window.__archiveFilename`, the zip name on `window.__zipName`, and the raw bytes on `window.__zipBytes` so a caller can recover them if the download was suppressed.

Return value: `{zipName, mdName, conversationTitle, conversationId, model, zipSize, markdownLen, messageCount, roleCounts, assetTotal, assetsOk, assetsFail}`.

### Step 5 — Place the archive

The canonical destination is a per-chat subfolder inside the user's `/chats/` directory, so the archive is self-contained and ChatGPT and Claude archives look the same to anyone (human or LLM) reading the repo later:

```
<repo>/chats/<YYYY-MM-DD>--chatgpt__<title-slug>/
    <YYYY-MM-DD>--chatgpt__<title-slug>.md
    assets/
        01__alt-text-slug.png
        02__another-alt-text-slug.png
        ...
        INDEX.md
```

The ZIP arrives in `~/Downloads/`. The agent doesn't have direct write access to arbitrary host folders, so either:

- If `~/Downloads` is already mounted in the Cowork session: `mkdir -p <repo>/chats/<basename>/ && unzip` the ZIP into that subfolder, then remove the ZIP from `~/Downloads/`.
- If `~/Downloads` is not mounted: request it via `mcp__cowork__request_cowork_directory` once (explaining it's needed to place this single archive). If the user declines, give them a one-line shell command to do the unzip themselves.

If the user's repo has a different layout convention (e.g. they want assets in a parallel `/visuals/` folder), follow that — but the per-chat subfolder is the recommended default for a fresh setup.

### Step 6 — Verify

Report: archive folder path, total size, message count by role (user/assistant/system/tool), conversation span, model slug, asset count (`assetsOk / assetTotal`), and any `assetsFail` entries with their reason. If any images failed, mention that user-uploaded images and certain pruned regenerations aren't reachable from share-page renders — this is expected, not a bug to chase.

### Step 7 — Promotion to /visuals/ (optional, human-driven)

If a particular image becomes a book asset — i.e. the user references it in the manuscript or wants it discoverable outside the chat context — that's when it crosses over to the project's `/visuals/` folder (or equivalent). Copy it there with a name that describes its book role, not its chat origin. The copy in `chats/<chat>/assets/` stays where it is as provenance; the `/visuals/` copy is the working asset. This skill does *not* do that promotion automatically — it's a deliberate editorial step the user takes when content earns a place in the book.

## Important context for the extractor

### Why reading the loader hydration state is necessary

Per-message timestamps, UUIDs, the parent/child tree, tool-channel recipients, model slugs, asset-pointer metadata, and reasoning summaries are not in the rendered DOM. They live in the loader payload that React Router hydrates from. The conversation object is the same shape ChatGPT's internal `/backend-api/conversation/{id}` endpoint returns — see `references/data-structure.md`.

The script avoids React fiber walking entirely: the data is already a plain JS object on `window.__reactRouterContext`. If OpenAI ever changes their hydration mechanism (back to `__NEXT_DATA__`, or to a streaming RSC payload), the route to the data may change — the script's first 30 lines locate the payload defensively and log a clear error if it isn't found.

### Why a ZIP, and why an inline encoder

Two constraints force this design:

- The browser's only built-in "write to disk" path for arbitrary bytes is the synthetic `<a download>` click, which deposits the file in the user's Downloads folder. There is no API to write to an arbitrary host path from page JS.
- chatgpt.com's Content-Security-Policy blocks loading scripts from third-party CDNs (cdnjs, unpkg, jsdelivr all tested — all blocked). So JSZip can't be lazy-loaded. The extractor inlines a ~80-line STORED-mode (no compression) ZIP encoder. PNGs are already compressed, so stored mode produces an archive about the same size as a deflated one.

### What can't be captured

- **User-uploaded images.** ChatGPT's share-page render does not expose these — the `<img>` elements aren't present in the DOM and no public CDN URL exists for them. The asset is listed as `download_status: unavailable` in the markdown and as `no` in `INDEX.md`.
- **Pruned regenerations.** Sometimes the data references an asset that isn't in the rendered DOM — usually because the message that owned it was edited or regenerated, and the share page is rendering the active branch only. The same `unavailable` treatment applies.
- **The owning user's account info** — no name, no IP, no geolocation. The browser's `Intl.DateTimeFormat().resolvedOptions().timeZone` is the closest proxy and is captured in the header.

### Tool calls in the ChatGPT data model

Unlike claude.ai's `tool_use` / `tool_result` content blocks, ChatGPT uses the `recipient` field on messages:

- An assistant message with `recipient !== "all"` (e.g. `t2uay3k.sj1i4kz` for the code interpreter) is a tool call. Its content is typically `content_type: code` with `language` and `text`.
- The reply comes back as the next message with `author.role === "tool"` and `author.name` set to the tool identifier. Its content is typically `multimodal_text` (text + image asset pointers) or `execution_output`.

Reading `recipient` is the way to identify tool calls. The extractor surfaces it on every message.

### Content type dispatch

`text`, `multimodal_text`, `code`, `thoughts`, `reasoning_recap`, `model_editable_context`, `execution_output`, `tether_*`, `system_error`, plus a JSON fallback for unknown types. See `references/data-structure.md` for the complete catalogue.

## Edge cases and recovery

- **Loader data not found** — the page hasn't fully rendered, or the share URL was invalid. Wait a beat and re-run, or check the URL is `/share/`. The script returns `{error: 'no react router context'}` or `{error: 'no share route'}` in this case.
- **Some images marked unavailable** — see "What can't be captured." The bundle is still complete and useful; just note in the report.
- **ZIP not downloaded** — the synthetic-link click can be blocked by browser settings. The bytes live on `window.__zipBytes` until the page is closed; a follow-up `javascript_exec` can re-trigger the download.
- **Multiple files with `(1).zip`, `(2).zip` suffixes** — happens when re-running the same share URL because the browser doesn't overwrite. `mv -f ~/Downloads/<base>*.zip <destination>/<base>.zip` to overwrite.
- **`is_visually_hidden_from_conversation: true` messages** — the extractor includes these (system prompts, model_set_context writes). This is intentional: the archive should be more complete than the rendered page.

## A note on emojis

Don't put emojis in the output file — including in the date dividers. The extractor uses plain text `--- YYYY-MM-DD ---`. Some users archive transcripts into git repos and emojis create unwanted visual noise in code-style contexts.
