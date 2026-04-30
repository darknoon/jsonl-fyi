# jsonl.fyi v0.1 — Design

## Goal

A minimal browser tool that takes a Claude Code session `.jsonl` file (e.g. `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`) and renders it as a readable, chronological transcript: user messages, assistant text, thinking blocks, tool calls (with paired results), and synthesized diffs for edit-style tools.

Client-side only. No backend, no auth, no persistence in v0.1. Future versions may add Gist save/load and folder-drop sidechain detection.

## Non-goals (v0.1)

- Sidechain / subagent file attachment (manual or auto)
- Gist save/load and URL-based sharing
- Threading by `parentUuid` (we render in file order)
- Search/filter UI
- "Show all entry types" toggle
- Tests
- `git init` / committing the scaffold

## Stack

- Bun fullstack dev server (`bun --hot index.html`); no Vite, no build config
- React 19 + TypeScript
- `@phosphor-icons/react` — restricted to: Brain, Robot, File, PencilSimple, Terminal, MagnifyingGlass, Paperclip, Circle, GitDiff. Adding any other icon requires explicit approval.
- `@pierre/diffs` for Edit/MultiEdit/Write diff rendering (Shiki-backed; stacked layout)
- Plain CSS (single file, no Tailwind)
- Validation: `tsgo --noEmit` + `oxlint --type-aware` exposed as `bun run check`

## File layout (target)

```
package.json
tsconfig.json
.gitignore
index.html              # <script type="module" src="./src/index.tsx">
src/index.tsx           # mounts <App/>
src/App.tsx             # drop zone + transcript
src/parse.ts            # JSONL → Entry[]
src/types.ts            # entry/block types (subset)
src/transcript/Transcript.tsx
src/transcript/ToolCard.tsx
src/transcript/TextBlock.tsx
src/transcript/ThinkingBlock.tsx
src/transcript/EditDiff.tsx     # @pierre/diffs FileDiff wrapper
src/transcript/FileView.tsx     # @pierre/diffs File wrapper
src/transcript/ImageBlock.tsx   # inline image rendering (base64 + url)
src/transcript/toolMeta.ts      # verb maps + short-path + icon map
src/styles.css
```

The current scaffold contains only `package.json`, `tsconfig.json`, `.gitignore`, `index.html`, `src/index.tsx`, `src/App.tsx`, `src/styles.css` — drop zone and line count only.

## Reference implementation

`/Users/andrew/Developer/Prefix/prefix-eval-03-2026/web/src/components/SessionLog.tsx` — `ClaudeTraceLog` is the closest existing pattern. We adopt:

- The two-pass tool-result-pairing model (build `Map<tool_use_id, output>` first, then render)
- Tool card layout (icon + verb + short path; expandable body)
- `pastTense` verb table, `shortPath` helper, role-aware text rendering

## Data model (`src/types.ts`)

Subset of Claude Code session schema; we only model what we render.

```ts
type ImageSource =
  | { type: "base64"; media_type: string; data: string }
  | { type: "url"; url: string }

type Block =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "image"; source: ImageSource }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | {
      type: "tool_result"
      tool_use_id: string
      content:
        | string
        | Array<{ type: "text"; text: string } | { type: "image"; source: ImageSource }>
    }

type Entry = {
  uuid?: string
  parentUuid?: string | null
  isSidechain?: boolean
  timestamp?: string
  type: string // "user" | "assistant" | …
  message?: { role?: string; content?: Block[] | string }
}
```

Top-level entry types skipped during parse: `file-history-snapshot`, `queue-operation`, `permission-mode`, `last-prompt`, `attachment`, `system`. (These are bookkeeping noise for v0.1; a future toggle can show them.)

## Parsing (`src/parse.ts`)

```ts
parseJsonl(text: string): { entries: Entry[]; skipped: number }
```

- Split on `\n`, trim, ignore empty lines
- `JSON.parse` each line; on failure increment `skipped` and continue
- Filter out skip-list types
- Preserve original order

## Rendering pipeline (`Transcript.tsx`)

**Pass 1 — index tool results.** Walk all entries; for each `tool_result` block (typically inside a `user` entry), record `tool_use_id → { text, images }`. Extraction: if `content` is a string, `text` is the string and `images` is empty; if it's an array, join `text` items with `\n` and collect any `image` blocks into the `images` array. Two-pass is robust to any out-of-order results without costing anything at this scale.

**Pass 2 — render in order.** For each entry's `message.content` blocks:

- `text` → `<TextBlock text role={message.role} />`
  - `role === "user"` → bordered/bubbled left-padded block
  - otherwise → flat row with Robot icon + inline text (no bubble)
- `thinking` → `<ThinkingBlock>`: italic, line-clamped, click to expand
- `image` → `<ImageBlock source />` — renders inline. For `base64` sources we build a data URL `data:${media_type};base64,${data}`; for `url` sources we use the URL directly. User-attached images (typical case) render inside the user bubble area.
- `tool_use` → `<ToolCard block result={lookup[id]} />` (result includes both text and images)
- `tool_result` → skip (already paired)
- other → skip

If `message.content` is a string, treat as a single text block.

## ToolCard (`ToolCard.tsx`)

Header row: icon + label, expandable body.

- Icon from `toolMeta.iconFor(name)` (fallback Terminal)
- Label: `${verb} ${shortPath(title)}` where verb comes from a fixed past-tense map (Read, Wrote, Edited, Ran command, Searched files, Searched code, Applied patch, …) and `title` is `input.file_path ?? input.command ?? input.pattern ?? input.script ?? ""`. Since we view static files, status is always "completed" — present-tense forms aren't needed.

Expanded body, by tool:

- `Bash` → `<pre>$ {input.command}</pre>` then output `<pre>` (full content, scrollable via `max-height` on the container)
- `Edit` → `<EditDiff filePath={input.file_path} oldString={input.old_string} newString={input.new_string} />`
- `Write` → `<FileView filePath={input.file_path} contents={input.content} />` (full new file, syntax-highlighted; not a diff against empty)
- `Read` → `<FileView filePath={input.file_path} contents={output} />` if output present (highlighted with the file's language); otherwise output `<pre>`
- `MultiEdit` → render one `<EditDiff>` per edit in `input.edits` (we don't have the original file contents to fold them into one diff)
- All others → output `<pre>` only

When a result has images (e.g. screenshot tools, `WebFetch` rendering), they're shown inline below the text block as `<ImageBlock>`s with a `max-height` so big screenshots don't blow out the layout (click to open the data URL in a new tab).

## File / diff rendering via @pierre/diffs

`@pierre/diffs` is built on Shiki and exposes a React API at `@pierre/diffs/react` with `File` (single-file syntax-highlighted view) and `FileDiff` (two-file diff). Using one library for both keeps theming consistent.

**EditDiff (`<EditDiff>` wrapping `<FileDiff>`):**

1. Build two `FileContents` records: `{ name: filePath, contents: oldString }` and `{ name: filePath, contents: newString }`. The `name` drives Shiki language inference.
2. Call `parseDiffFromFile(oldFile, newFile)` to get a `FileDiffMetadata`.
3. Render `<FileDiff fileDiff={metadata} disableWorkerPool />`.
4. Layout: stacked (unified) to keep each tool body compact.

**FileView (`<FileView>` wrapping `<File>`):**

1. Build a `FileContents` record `{ name: filePath, contents }`.
2. Render the corresponding non-diff React component from `@pierre/diffs/react` (the `File` export, with `disableWorkerPool` if available — exact prop name to be confirmed against the type during implementation).

**Highlighter setup:** the library uses Shiki under the hood. For v0.1 we accept whatever default theme handling falls out of `disableWorkerPool` mode. If a `WorkerPoolContextProvider` is required, we add a single provider near the App root.

This is the area with the most unknowns. A small spike at the start of implementation is warranted; if the API requires more setup than is reasonable for v0.1 (e.g. mandatory worker bootstrap), we surface that and decide whether to fall back to plain Shiki for `<FileView>` and a simpler `diff`-package renderer for `<EditDiff>`.

## App shell (`App.tsx`)

State: `entries: Entry[] | null`, `fileName: string | null`, `skipped: number`.

UI:

- Header: title, and once a file is loaded — file name, entry count, skipped count (if > 0), reset button.
- When no file: large drop zone "Drop a Claude session `.jsonl` here / or click to choose a file". Supports drag-and-drop and file picker (hidden `<input type="file" accept=".jsonl,application/jsonl,text/plain">`). `FileReader`/`File.text()` → `parseJsonl` → setState.
- When file loaded: `<Transcript entries={entries} />`.

## Verification

Driven by the `agent-browser` skill (Vercel) so the implementing agent verifies end-to-end without a human in the loop. Steps:

1. `bun install`
2. `bun run check` — tsgo + oxlint pass clean.
3. `bun dev` in the background; capture the printed local URL.
4. Use `agent-browser` to:
   - Navigate to the dev URL.
   - Upload `/Users/andrew/.claude/projects/-Users-andrew-Developer-Web-Dave/0512d505-a628-4e5f-93e2-7f1f99168488.jsonl` (383 lines) via the file input (avoid drag-and-drop in automation; the hidden `<input type="file">` is the reliable path). This file has good tool coverage — 79 Bash, 25 Read, 12 Edit, 7 Grep — and 11 image entries, so it exercises the full v0.1 surface in one run.
   - Screenshot the page after load.
   - Assert via DOM/text content:
     - Header shows the file name and a non-zero entry count.
     - At least one user bubble, one assistant text row, and one tool card are present.
     - Clicking a tool card reveals its body (programmatic click + screenshot).
     - An `Edit`-tool body contains a `@pierre/diffs`-rendered diff (look for the library's class names or a `pre` with addition/deletion lines).
     - A `Bash`-tool body shows `$ <command>` and output.
     - No row labelled `file-history-snapshot`, `queue-operation`, etc.
   - Capture screenshots at empty state, after upload, and with a tool card expanded.
5. Confirm at least one `<img>` element renders (the chosen file contains 11 image entries, so any zero-image result is a regression).
6. Stop the dev server.

Failures from `agent-browser` (missing elements, console errors) are blockers — fix and re-run before declaring the task complete.

## Future (v0.2+)

- Sidechain support: detect a folder drop or multi-file drop, merge sidechain transcripts inline indented under their invoking `Task` calls.
- Gist save/load and URL-based sharing.
- `parentUuid`-based threading view (toggle).
- Search and filter.
- "Show all entry types" toggle to surface attachments/hooks/permission-mode entries.
- Pretty rendering for additional tools (TodoWrite, WebFetch result formatting, Grep result line numbers).
