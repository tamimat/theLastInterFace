---
name: claudeai-share-archiver
description: Archive a publicly-shared claude.ai conversation as a self-contained chat folder — verbatim markdown transcript with full metadata (timestamps in ISO 8601, message UUIDs, threading via parent_message_uuid, input mode, stop reasons, all tool calls with inputs and results, attachments with extracted content, and citations), plus every Claude-authored file (`create_file` tool calls) extracted into a sibling `artifacts/` folder with YAML front matter pointing back to the source chat. The transcript's `file_text` references are rewritten to point at the local artifact files. Everything bundles into a single ZIP. Use this skill whenever the user pastes or mentions a `https://claude.ai/share/` URL and wants it captured, saved, archived, exported, preserved, or downloaded — including phrasings like "archive this share link", "save this conversation URL", "extract this chat", "capture this thread into the repo", "I want a record of this conversation". Do NOT use for `https://claude.ai/chat/...` URLs — those require authentication and aren't shareable.
---

# claude.ai chat archiver

This skill turns a public claude.ai share URL into a single ZIP containing a self-contained chat folder. When unzipped, you get:

```
<YYYY-MM-DD>--claudeai__<title-slug>/
    <YYYY-MM-DD>--claudeai__<title-slug>.md     ← transcript
    artifacts/
        <slug>.md                                ← each Claude-authored file
        <slug>-v2.md                             ← versioned regenerations
        INDEX.md                                 ← table of all artifacts
```

This layout is parallel to what the `chatgpt-share-archiver` skill produces (a per-chat folder with a sibling `assets/` for images), so ChatGPT and Claude archives look the same to any tool or person reading the repo later.

The reason this skill exists: claude.ai's share renderer hides almost all metadata. Timestamps only appear on hover (a Radix tooltip that lazy-mounts the time string when you mouse over), per-message UUIDs aren't shown, tool calls are flattened into prose, and the body of every Claude-authored file is buried inside a `tool_use` block's JSON input. The data is in the page, but it lives in React component props rather than the rendered DOM. The bundled `scripts/extractor.js` walks the React fiber tree to pull everything out, then extracts each artifact into its own file so the chat folder reads like a normal directory of source material.

## When to invoke this skill

Trigger on any user request that combines (a) a `https://claude.ai/share/<uuid>` URL or a clear reference to one, with (b) intent to save / archive / preserve / capture / extract / export the conversation. Examples:

- "Here's a claude.ai share link — archive it"
- "Save this chat to my repo: https://claude.ai/share/..."
- "I want this conversation preserved as a markdown file, with the artifacts broken out"
- "Pull this into the archive folder"
- "Export this thread"
- "Capture the full content of this conversation including timestamps and artifacts"

If the URL is `claude.ai/chat/...` instead of `claude.ai/share/...`, the page requires authentication and the share data isn't exposed. Tell the user to click the Share button on the conversation in claude.ai, make the link public, and send the resulting `/share/` URL instead.

## Relationship to the older `shared-chat-archiver` skill

The older `shared-chat-archiver` skill writes a flat `.md` to the user's Downloads folder with all artifact bodies inlined as JSON inside `tool_use` blocks. This skill replaces it. The naming is more specific (`claudeai-` mirrors the `chatgpt-` skill), the layout is per-chat-folder, and artifact bodies are extracted into separate files. If both skills are installed, prefer this one for new archives.

## What this skill produces

A single `.zip` file with the layout shown above. The transcript (`.md`) has the same shape as the v1 archiver, with two differences:

- Header includes `Artifacts extracted: N (see \`artifacts/\` folder)` and a schema note explaining that `create_file` `file_text` fields are rewritten to references.
- Inside any `create_file` tool_use input JSON, the `file_text` value is replaced with `[artifact body extracted to artifacts/<slug>.<ext>]`. All other fields (`path`, `description`, `tool_use_id`, the paired `tool_result` block) are preserved verbatim, so the structural record of the file-creation event survives in the transcript.

Each extracted artifact file has YAML front matter at the top recording where it came from:

```yaml
---
source_chat: 2026-05-20--claudeai__intent-based-hci-model.md
source_path: /mnt/user-data/outputs/the-last-interface-manifesto.md
created_in_chat: 2026-05-20T21:58:47+02:00
created_at_utc: 2026-05-20T19:58:47.123Z
tool_use_id: toolu_01REb5J6rD1D5Ut9318SJpSj
description: "Rewrite as a manifesto — short, punchy, ..."
tool_sequence:
  create_file: 1
  str_replace_succeeded: 0
  str_replace_failed: 0
  present_files: 1
extraction_method: automatic
---

# {artifact body verbatim from here on}
```

`artifacts/INDEX.md` is a sidecar table listing every extracted artifact with its source path and description.

Timestamps in the transcript use ISO 8601 with the user's local offset (e.g. `2026-05-20T07:00:54+02:00`); the UTC source values are preserved separately under `created_at_utc`. Plain-text date dividers (`--- YYYY-MM-DD ---`) separate calendar days. No emojis.

## Filename derivation

Inside `artifacts/`, each file is named just `<slug>.<ext>` — the date and source are already encoded in the parent chat folder, so they aren't repeated.

The slug is derived from the path of the `create_file` tool's `input.path`:

1. Take the basename, drop the extension.
2. Strip a project-wide prefix if one is detected. Two strategies run; the longer result wins:
   - **Multi-stem detection** — when ≥2 artifacts exist, tokenize each basename on `-` and find the longest token-prefix matched by at least (n − allowedOutliers) of them, where `allowedOutliers = max(1, floor(n * 0.15))`. The prefix must end in `-` and be ≥5 chars. This handles the common case where a chat writes a bunch of files like `the-last-interface-manifesto.md`, `the-last-interface-pitch.md`, `the-end-of-apps.md` → `manifesto.md`, `pitch.md`, and the outlier `the-end-of-apps.md` kept as-is.
   - **Project-name hint** — derive a slug from the conversation's `Project: <name>` header (parsed from the share-page banner). If any basename starts with that slug followed by `-`, use it as the prefix candidate. This catches single-artifact chats where multi-stem detection can't run (e.g., `the-last-interface-notes-v2.md` in a project named "The Last Interface" → `notes-v2.md`).
3. Kebab-case the result (lowercase, non-alphanumeric → `-`).
4. If two artifacts produce the same slug, append `-v2`, `-v3` in chronological order. This is the case when Claude regenerates the same file multiple times in one conversation — both versions are preserved as distinct files (per the user-side principle that divergent versions are data).

## Identifying artifacts

The extractor walks every message's `content[]` array. For each `tool_use` block:

- `name == "create_file"` with `input.path` and `input.file_text` set → extract this as an artifact. Initial body = `input.file_text`.
- `name == "str_replace"` with `input.path` set → find the immediately following `tool_result` with matching `tool_use_id`, check `is_error`. If successful, **apply the edit to the currently-open artifact's running body**: find the first occurrence of `input.old_str` in the body and replace it with `input.new_str`. Bump `str_replace_succeeded` or `str_replace_failed` on the path's tool_sequence counter.
- `name == "present_files"` → bump `present_files` for each path in `input.filepaths` (newer schema) / `input.files` / `input.file_path`.

The "currently-open artifact for path P" is the most recent `create_file` on P. A second `create_file` on the same path starts a fresh artifact (which becomes the new -v2 entry); subsequent str_replace edits then apply to it, not the previous version.

So the body written to `artifacts/<slug>.<ext>` is the **final state after all applied edits**, matching what the user actually got at the end of the conversation. Each artifact's YAML front matter records `tool_sequence` counts so the editing history is still legible.

Other tool calls (`web_search`, MCP integrations, etc.) are preserved in the transcript verbatim and don't produce extracted files.

### Limitation: view-then-edit-on-/home/claude pattern

Some chats route file edits through a different sequence: Claude uses `view` to load a file from `/mnt/project/`, `bash` to copy it into `/home/claude/`, runs multiple `str_replace` edits on the `/home/claude/` copy, then `bash` to copy the result into `/mnt/user-data/outputs/`, then `present_files`. In this flow there's no `create_file` to anchor against, so the extractor sees zero artifacts for the chat.

For now, those have to be reconstructed by hand. The artifact file gets `extraction_method: manual` in its YAML front matter along with a note describing the reconstruction. A future extractor pass could detect this pattern by following the `view → str_replace → bash cp` sequence, but it's not in scope yet.

## How to execute the workflow

### Step 1 — Verify the URL

Check the URL matches `https://claude.ai/share/<uuid>`. The `/share/` segment is critical — `/chat/` URLs require login.

### Step 2 — Connect a browser

Use `mcp__Claude_in_Chrome__list_connected_browsers` to confirm a browser is connected. If not, ask the user to install/connect the Claude in Chrome extension. Create or reuse a tab via `mcp__Claude_in_Chrome__tabs_context_mcp` (with `createIfEmpty: true` if no tab group exists).

### Step 3 — Navigate to the share URL

Use `mcp__Claude_in_Chrome__navigate` with the share URL. Wait a moment for the React app to render (usually a second or two for static share pages).

### Step 4 — Run the extractor

Read `scripts/extractor.js` from this skill folder and execute via `mcp__Claude_in_Chrome__javascript_tool` with `action: "javascript_exec"`. The script:

1. Walks the React fiber tree starting from each speaker `<h2 class="sr-only">` to collect every `message` object.
2. First pass: scans every `tool_use` for `create_file` (with `input.path` + `input.file_text`), `str_replace`, and `present_files` events; builds an `artifactCandidates` list and a per-path `toolSequence` count.
3. Derives slugs (with common-prefix stripping and version suffixes on collision).
4. Builds the transcript markdown, rewriting each extracted `create_file` input's `file_text` to a reference string.
5. Builds an artifact file per candidate with YAML front matter + verbatim body.
6. Bundles the transcript, every artifact file, and `artifacts/INDEX.md` into a STORED-mode ZIP (no compression — the inline encoder is the same one used by `chatgpt-share-archiver`; necessary because share-page CSP blocks loading JSZip from any CDN).
7. Triggers a single `<a download>` click.
8. Stashes the markdown on `window.__archiveContent`, the filename on `window.__archiveFilename`, the zip name on `window.__zipName`, and the raw bytes on `window.__zipBytes` for fallback access.

Return value: `{zipName, mdName, archiveBasename, conversationTitle, projectName, zipSize, messageCount, userCount, assistantCount, artifactCount, artifacts[], commonPrefixStripped}`.

### Step 5 — Place the archive

The ZIP arrives in `~/Downloads/`. The agent doesn't have direct write access to arbitrary host folders, so either:

- If `~/Downloads` is already mounted in the Cowork session: `mkdir -p <repo>/chats/<archiveBasename>/ && unzip` the ZIP into that subfolder, then remove the ZIP from `~/Downloads/`.
- If `~/Downloads` is not mounted: request it via `mcp__cowork__request_cowork_directory` once. If the user declines, give them a one-line shell command to do the unzip themselves.

If the user has the project-specific `/artifacts/` flat folder from the old v1 system, the per-chat layout supersedes it. The migration plan is to re-archive each chat from its share URL into the new layout, verify, then delete the legacy flat `chats/<slug>.md` and the legacy `/artifacts/<file>.md` entries.

### Step 6 — Verify

Report: archive folder path, total size, message count (user/assistant split), conversation span (ISO 8601 local), artifact count, and if `commonPrefixStripped` is non-null, mention what was stripped so the user can confirm the slug naming looks right.

## Important context

### Why React fiber walking is necessary

Per-message timestamps, UUIDs, the parent/child structure, tool-call inputs, and the artifact body all live in React component props, not the rendered DOM. The data model on the share page mirrors what's at claude.ai's internal API — each message is an object with `uuid`, `index`, `sender`, `created_at`, `updated_at`, `parent_message_uuid`, `input_mode`, `truncated`, `stop_reason`, `image_count`, `file_count`, `attachments[]`, `files[]`, `content[]`, and `compaction_summary`. The script accesses this object through the React internal property `__reactFiber$<random>` on the DOM node, walking up the fiber's `.return` chain until it finds a fiber whose `memoizedProps.message.created_at` is set.

The selectors (`h2.sr-only` speaker labels) are claude.ai-specific and may break if the share page is redesigned. The fiber walking itself relies on React's internal naming, stable across React versions but not part of React's public API.

### What can't be captured

- **Image and file binary blobs from attachments** — claude.ai's share renderer strips them; only `extracted_content` (the parsed text) is preserved on attachments.
- **The owning user's account info** — no name, no IP, no geolocation. The browser's `Intl.DateTimeFormat().resolvedOptions().timeZone` is the closest proxy and is captured in the header.
- **Conversation-level wrapper metadata** — title, project, share-creation timestamp are read from the page header banner, not from a single React prop.

### Why a ZIP, and why an inline encoder

The browser's only path to write to disk is the synthetic `<a download>` click, which lands in the user's Downloads folder. claude.ai's CSP blocks loading scripts from third-party CDNs (cdnjs, unpkg, jsdelivr all blocked), so JSZip can't be lazy-loaded. The extractor inlines a STORED-mode ZIP encoder (~80 lines). PNGs and source files are typically not size-sensitive in this context, so no compression is fine.

## Edge cases and recovery

- **Container/speaker H2 not found** — page hasn't fully rendered. Wait a beat and re-run. Returns `{error: 'no speakers'}`.
- **Zero messages found via fiber walk** — same root cause. Returns `{error: 'no messages'}`. Check the URL is a `/share/` URL, not `/chat/`.
- **`create_file` with empty file_text** — the script still records the tool call in the transcript but produces no extracted file. Rare.
- **Identical slug from two paths** — auto-versioned with `-v2`, `-v3`. Look at `commonPrefixStripped` and the artifact paths in the return value to verify the naming.
- **Download blocked / no download appeared** — the synthetic-link click may have been blocked. Content is stashed on `window.__archiveContent`, `window.__zipBytes`, etc. — a follow-up `javascript_exec` can recover them.
- **Multiple files with `(1).zip`, `(2).zip` suffixes** — re-running the same share URL re-downloads without overwriting. `mv -f ~/Downloads/<base>*.zip <destination>/<base>.zip` to overwrite.

## A note on emojis

Don't put emojis in the output file — including in the date dividers. The extractor uses plain text `--- YYYY-MM-DD ---`. Many users archive transcripts into git repos and emojis create unwanted visual noise in code-style contexts.
