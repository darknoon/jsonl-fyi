# jsonl.fyi v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal Bun fullstack web app that loads a Claude Code session `.jsonl` file and renders it as a chronological transcript with tool calls, diffs, syntax-highlighted file views, and inline images.

**Architecture:** Client-side only React 19 app served by `bun --hot index.html`. JSONL parsed in-browser. Two-pass rendering: first pass indexes `tool_result` blocks by `tool_use_id` (text + images), second pass renders entries in order, pairing each `tool_use` with its result. Edit/MultiEdit produce diffs and Read/Write produce file views via `@pierre/diffs` (Shiki-backed).

**Tech Stack:** Bun, React 19, TypeScript, `@pierre/diffs`, `@phosphor-icons/react`. Validation via `tsgo` (`@typescript/native-preview`) and `oxlint --type-aware`. End-to-end verification via the `agent-browser` skill.

**Spec:** `docs/superpowers/specs/2026-04-28-jsonl-viewer-design.md`

**Scope notes:**
- Pure transformations (JSONL parsing, tool-result extraction, toolMeta label generation) get unit tests via `bun test`. UI rendering does not — that's covered end-to-end by `agent-browser` in Task 8.
- Test style: build a realistic fixture, run the transformation, format the result into a single concise summary string, and snapshot that string with `toMatchInlineSnapshot()`. One snapshot per transformation — no scattered `expect()` calls per field. This makes regressions easy to read as a diff.
- Each task ends with a commit; the repo is initialized in Task 0 since the working dir is not yet a git repo.
- The `@pierre/diffs` integration is the single biggest unknown — Task 2 is a deliberate spike with a documented fallback.

---

## File map

Files this plan creates or modifies:

| Path | Created in | Responsibility |
| --- | --- | --- |
| `package.json` | scaffold (exists) | Deps + scripts. Updated in Task 0. |
| `tsconfig.json` | scaffold (exists) | TS config. |
| `index.html` | scaffold (exists) | Entry. |
| `src/index.tsx` | scaffold (exists) | Mount `<App/>`. |
| `src/App.tsx` | scaffold (exists) | Drop zone + routing between empty state and `<Transcript/>`. Modified in Task 8. |
| `src/styles.css` | scaffold (exists) | Single CSS file. Extended throughout. |
| `src/types.ts` | Task 1 | Block / Entry / ImageSource types. |
| `src/parse.ts` | Task 1 | `parseJsonl` — split, JSON.parse, filter noise. |
| `src/parse.test.ts` | Task 1 | Snapshot tests for `parseJsonl`. |
| `src/__fixtures__/sample.jsonl` | Task 1 | Anonymized real Claude session, used by all transform tests. |
| `src/transcript/extractResult.ts` | Task 6 | Pure transform: `tool_result.content` → `{ text, images }`. |
| `src/transcript/extractResult.test.ts` | Task 6 | Snapshot tests for the transform. |
| `src/transcript/toolMeta.test.ts` | Task 3 | Snapshot tests for `toolLabel` / `shortPath`. |
| `src/transcript/toolMeta.ts` | Task 3 | Verb map, `shortPath`, `toolTitle`, icon map. |
| `src/transcript/TextBlock.tsx` | Task 4 | Text rendering (user bubble vs assistant flat). |
| `src/transcript/ThinkingBlock.tsx` | Task 4 | Italic line-clamped expandable. |
| `src/transcript/ImageBlock.tsx` | Task 4 | Inline `<img>` for base64 + url sources. |
| `src/transcript/EditDiff.tsx` | Task 2/5 | `<FileDiff>` wrapper. |
| `src/transcript/FileView.tsx` | Task 2/5 | `<File>` wrapper. |
| `src/transcript/ToolCard.tsx` | Task 5 | Header row + tool-specific body. |
| `src/transcript/Transcript.tsx` | Task 6 | Two-pass renderer. |

---

## Task 0: Initialize git and lock in dev tooling

**Files:**
- Modify: `package.json`
- Create: `.gitignore` (already in scaffold; verify)

- [ ] **Step 1: Verify scaffold installs**

```bash
cd /Users/andrew/Developer/Prefix/jsonl-fyi
bun install
```

Expected: dependencies install with no errors. `node_modules/@pierre/diffs/package.json` exists. `node_modules/@phosphor-icons/react/package.json` exists.

- [ ] **Step 2: Confirm `bun run check` works (will fail cleanly until tooling is fixed)**

Run: `bun run check`
Expected: either passes or fails with a clear message about `tsgo`/`oxlint`. If `tsgo` is not found, install with `bun add -d @typescript/native-preview` (the binary is `tsgo`); if `oxlint` is not found, install with `bun add -d oxlint`.

- [ ] **Step 3: Smoke test `bun dev`**

Run in background: `bun --hot index.html`
Open the printed URL with `agent-browser` (or curl the root) and verify the page loads with the title "jsonl.fyi" and a drop zone. Stop the dev server.

- [ ] **Step 4: Initialize git, first commit**

```bash
cd /Users/andrew/Developer/Prefix/jsonl-fyi
git init
git add .
git commit -m "chore: initial scaffold"
```

---

## Task 1: Data model, JSONL parser, and tests

**Files:**
- Create: `src/types.ts`
- Create: `src/parse.ts`
- Create: `src/__fixtures__/sample.jsonl` (anonymized real session)
- Create: `src/parse.test.ts`

**Fixture sourcing:** the source is `/Users/andrew/.claude/projects/-Users-andrew-Developer-Web-Dave/04819ab3-be01-4118-8196-5dfc2a411442.jsonl` — 31 lines, contains user/assistant turns plus tool calls (Edit, Read, Agent, ToolSearch, mcp__dave__RenameChat) and one image, so it exercises the parser and the tool-result extractor in one file. Copy into `src/__fixtures__/sample.jsonl` and anonymize before committing.

**Anonymization rules** (apply in this order, per line, preserving line count):
1. Replace any absolute path containing `/Users/andrew` or `/Users/<name>` with `/Users/example`.
2. Replace any cwd or path mentioning `Developer/Web/Dave` (or similar private project names) with `Developer/example/project`.
3. Replace `gitBranch` values that aren't `main`/`master` with `main`.
4. For any `image` block with a `base64` source, replace `data` with the literal `"REDACTED_BASE64"` and keep `media_type` as-is. (Tests only need a recognizable image-shaped payload, not real bytes.)
5. Replace any email-like substring not ending in `example.com` with `user@example.com`.
6. Replace any 32+-char hex/base64 token that is clearly an API key or auth header with `REDACTED_TOKEN`.

A short script (`bun run scripts/anonymize.ts`) is fine if useful, but a one-shot manual scrub then `git diff` for a sanity check is also OK — the fixture is small.

- [ ] **Step 1: Define types**

Write `src/types.ts`:

```ts
export type ImageSource =
  | { type: "base64"; media_type: string; data: string }
  | { type: "url"; url: string }

export type TextBlock = { type: "text"; text: string }
export type ThinkingBlock = { type: "thinking"; thinking: string }
export type ImageBlock = { type: "image"; source: ImageSource }
export type ToolUseBlock = {
  type: "tool_use"
  id: string
  name: string
  input: Record<string, unknown>
}
export type ToolResultContentItem =
  | { type: "text"; text: string }
  | { type: "image"; source: ImageSource }
export type ToolResultBlock = {
  type: "tool_result"
  tool_use_id: string
  content: string | ToolResultContentItem[]
}

export type Block =
  | TextBlock
  | ThinkingBlock
  | ImageBlock
  | ToolUseBlock
  | ToolResultBlock

export type Entry = {
  uuid?: string
  parentUuid?: string | null
  isSidechain?: boolean
  timestamp?: string
  type: string
  message?: { role?: string; content?: Block[] | string }
}

export type ToolResult = { text: string; images: ImageSource[] }
```

- [ ] **Step 2: Write parser**

Write `src/parse.ts`:

```ts
import type { Entry } from "./types"

const SKIP_TYPES = new Set([
  "file-history-snapshot",
  "queue-operation",
  "permission-mode",
  "last-prompt",
  "attachment",
  "system",
])

export function parseJsonl(text: string): { entries: Entry[]; skipped: number } {
  const entries: Entry[] = []
  let skipped = 0
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    try {
      const obj = JSON.parse(line) as Entry
      if (obj && typeof obj === "object" && obj.type && !SKIP_TYPES.has(obj.type)) {
        entries.push(obj)
      }
    } catch {
      skipped++
    }
  }
  return { entries, skipped }
}
```

- [ ] **Step 3: Prepare fixture**

```bash
mkdir -p src/__fixtures__
cp /Users/andrew/.claude/projects/-Users-andrew-Developer-Web-Dave/04819ab3-be01-4118-8196-5dfc2a411442.jsonl src/__fixtures__/sample.jsonl
```

Apply the anonymization rules above. Verify with `git diff src/__fixtures__/sample.jsonl` that no real user paths, secrets, or base64 image bodies remain.

- [ ] **Step 4: Write parser tests**

Create `src/parse.test.ts`:

```ts
import { test, expect } from "bun:test"
import { parseJsonl } from "./parse"

test("parseJsonl summarizes a real session correctly", async () => {
  const text = await Bun.file(
    new URL("./__fixtures__/sample.jsonl", import.meta.url),
  ).text()
  const { entries, skipped } = parseJsonl(text)

  // Build a single concise summary string covering: total kept, skipped count,
  // top-level types (sorted), and the sequence of block types per entry.
  const typeCounts = new Map<string, number>()
  for (const e of entries) typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1)
  const types = [...typeCounts.entries()]
    .sort()
    .map(([k, v]) => `${k}=${v}`)
    .join(" ")

  const blockSeq = entries
    .map(e => {
      const c = e.message?.content
      if (!c) return `${e.type}:-`
      if (typeof c === "string") return `${e.type}:str`
      const blocks = c.map(b => {
        if (b.type === "tool_use") return `tool_use(${b.name})`
        if (b.type === "tool_result") return `tool_result`
        return b.type
      })
      return `${e.type}:[${blocks.join(",")}]`
    })
    .join("\n")

  const summary = [
    `entries=${entries.length} skipped=${skipped}`,
    `types: ${types}`,
    `blocks:\n${blockSeq}`,
  ].join("\n")

  expect(summary).toMatchInlineSnapshot()
})

test("malformed lines increment skipped, valid lines keep parsing", () => {
  const text = [
    `{"type":"user","message":{"role":"user","content":"hi"}}`,
    `not json`,
    ``,
    `{"type":"file-history-snapshot"}`,
    `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hello"}]}}`,
  ].join("\n")
  const { entries, skipped } = parseJsonl(text)
  const summary = `entries=${entries.length} skipped=${skipped} kept=${entries.map(e => e.type).join(",")}`
  expect(summary).toMatchInlineSnapshot(`"entries=2 skipped=1 kept=user,assistant"`)
})
```

The first test calls `toMatchInlineSnapshot()` with no argument — on first run, Bun will fill it in. Run the test and inspect the inline snapshot that's written to confirm it matches the fixture's true shape; if it does, commit. The second test is hand-written so it documents the noise/skip behavior even without the fixture.

- [ ] **Step 5: Run tests**

Run: `bun test src/parse.test.ts`
Expected: both tests pass. The first run writes the inline snapshot; subsequent runs compare against it.

- [ ] **Step 6: Type-check**

Run: `bun run check`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/parse.ts src/parse.test.ts src/__fixtures__/sample.jsonl
git commit -m "feat: jsonl parser, types, and snapshot tests"
```

---

## Task 2: @pierre/diffs spike — confirm FileView + EditDiff render

This task is intentionally scoped tight: prove the library works with our setup before building the rest of the UI on top. If it requires a `WorkerPoolContextProvider` or other root-level setup, this is where we discover it.

**Files:**
- Create: `src/transcript/EditDiff.tsx`
- Create: `src/transcript/FileView.tsx`
- Modify: `src/App.tsx` (temporary spike harness)

- [ ] **Step 1: Implement `FileView`**

Write `src/transcript/FileView.tsx`:

```tsx
import { File } from "@pierre/diffs/react"

export function FileView({
  filePath,
  contents,
}: {
  filePath: string
  contents: string
}) {
  return (
    <File
      file={{ name: filePath, contents }}
      disableWorkerPool
    />
  )
}
```

If `<File>` rejects the `file`/`disableWorkerPool` prop names, consult `node_modules/@pierre/diffs/dist/react/File.d.ts` for the actual prop schema and update accordingly. The goal is the smallest invocation that renders a single highlighted file.

- [ ] **Step 2: Implement `EditDiff`**

Write `src/transcript/EditDiff.tsx`:

```tsx
import { FileDiff } from "@pierre/diffs/react"
import { parseDiffFromFile } from "@pierre/diffs"

export function EditDiff({
  filePath,
  oldString,
  newString,
}: {
  filePath: string
  oldString: string
  newString: string
}) {
  const meta = parseDiffFromFile(
    { name: filePath, contents: oldString },
    { name: filePath, contents: newString },
  )
  return <FileDiff fileDiff={meta} disableWorkerPool />
}
```

- [ ] **Step 3: Wire a temporary spike harness in `App.tsx`**

Replace `src/App.tsx` with:

```tsx
import { FileView } from "./transcript/FileView"
import { EditDiff } from "./transcript/EditDiff"

export function App() {
  const sample = `function add(a: number, b: number) {\n  return a + b\n}\n`
  const sampleAfter = `function add(a: number, b: number) {\n  // sum\n  return a + b\n}\n`
  return (
    <div className="app">
      <h1>jsonl.fyi — spike</h1>
      <h2>FileView</h2>
      <FileView filePath="example.ts" contents={sample} />
      <h2>EditDiff</h2>
      <EditDiff filePath="example.ts" oldString={sample} newString={sampleAfter} />
    </div>
  )
}
```

- [ ] **Step 4: Run dev server and verify visually with agent-browser**

```bash
bun dev &
```

Use `agent-browser` to load the printed URL and screenshot. Confirm:
- The TS source renders with syntax highlighting (keywords colored).
- The diff renders with the comment line marked as an addition.
- No console errors.

If a worker pool / context is required, add `<WorkerPoolContextProvider>` (from `@pierre/diffs/react`) wrapping `<App/>` in `src/index.tsx` and re-verify. Stop the dev server.

- [ ] **Step 5: Type-check**

Run: `bun run check`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/transcript/FileView.tsx src/transcript/EditDiff.tsx src/App.tsx src/index.tsx
git commit -m "feat: pierre/diffs FileView + EditDiff spike"
```

**If the spike fails after a reasonable attempt** (worker bootstrap unworkable, missing peer deps, etc.) — stop, document the blocker in a `BLOCKERS.md` at the repo root with what was tried, and surface for human review before continuing. Do not silently fall back; the spec calls out a fallback option (plain Shiki + the `diff` package) but the user should approve that switch.

---

## Task 3: Tool metadata helpers

**Files:**
- Create: `src/transcript/toolMeta.ts`

- [ ] **Step 1: Write the module**

```ts
import {
  Brain,
  Robot,
  File as FileIcon,
  PencilSimple,
  GitDiff,
  Terminal,
  MagnifyingGlass,
  Paperclip,
  Circle,
  type Icon,
} from "@phosphor-icons/react"

const PAST: Record<string, string> = {
  Read: "Read",
  Write: "Wrote",
  Edit: "Edited",
  MultiEdit: "Edited",
  Bash: "Ran command",
  Glob: "Searched files",
  Grep: "Searched code",
  WebFetch: "Fetched",
  WebSearch: "Searched",
  Task: "Ran task",
  TodoWrite: "Updated todos",
}

export function shortPath(p: string): string {
  if (typeof p !== "string") return ""
  const parts = p.split("/")
  return parts.length > 2 ? `.../${parts.slice(-2).join("/")}` : parts.join("/")
}

export function toolLabel(name: string, title: string): string {
  if (name === "Bash") return title ? shortPath(title) : "Done"
  const verb = PAST[name] ?? `Ran ${name}`
  return title ? `${verb} ${shortPath(title)}` : verb
}

export function toolTitle(input: Record<string, unknown>): string {
  const v =
    (input?.file_path as string | undefined) ??
    (input?.command as string | undefined) ??
    (input?.pattern as string | undefined) ??
    (input?.script as string | undefined) ??
    ""
  return typeof v === "string" ? v : ""
}

const ICONS: Record<string, { Icon: Icon; color: string }> = {
  Read: { Icon: FileIcon, color: "tool-blue" },
  Write: { Icon: PencilSimple, color: "tool-amber" },
  Edit: { Icon: PencilSimple, color: "tool-amber" },
  MultiEdit: { Icon: PencilSimple, color: "tool-amber" },
  Bash: { Icon: Terminal, color: "tool-muted" },
  Glob: { Icon: MagnifyingGlass, color: "tool-green" },
  Grep: { Icon: MagnifyingGlass, color: "tool-green" },
  WebFetch: { Icon: Paperclip, color: "tool-violet" },
  WebSearch: { Icon: MagnifyingGlass, color: "tool-green" },
  Task: { Icon: GitDiff, color: "tool-violet" },
}

export function iconFor(name: string): { Icon: Icon; color: string } {
  return ICONS[name] ?? { Icon: Terminal, color: "tool-muted" }
}

export const Icons = { Brain, Robot, Circle }
```

- [ ] **Step 2: Write tests**

Create `src/transcript/toolMeta.test.ts`:

```ts
import { test, expect } from "bun:test"
import { toolLabel, toolTitle, shortPath } from "./toolMeta"

test("toolLabel covers known tools and falls back for unknown ones", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["Read", { file_path: "/Users/example/Developer/example/project/src/foo/bar.ts" }],
    ["Edit", { file_path: "src/foo.ts" }],
    ["Write", { file_path: "newfile.md" }],
    ["MultiEdit", { file_path: "deep/nested/path/x.ts" }],
    ["Bash", { command: "npm install --save-dev typescript" }],
    ["Bash", {}],
    ["Grep", { pattern: "TODO" }],
    ["Glob", { pattern: "**/*.ts" }],
    ["WebFetch", { url: "https://example.com" }],
    ["TodoWrite", {}],
    ["mcp__dave__RenameChat", { title: "x" }],
  ]
  const summary = cases
    .map(([name, input]) => `${name}\t${toolLabel(name, toolTitle(input))}`)
    .join("\n")
  expect(summary).toMatchInlineSnapshot()
})

test("shortPath collapses deep paths but preserves shallow ones", () => {
  const summary = [
    "/a",
    "a/b",
    "a/b/c",
    "a/b/c/d/e",
    "",
  ]
    .map(p => `${JSON.stringify(p)} -> ${JSON.stringify(shortPath(p))}`)
    .join("\n")
  expect(summary).toMatchInlineSnapshot()
})
```

Run `bun test src/transcript/toolMeta.test.ts` — the first run fills in the snapshots. Confirm they look correct, then move on.

- [ ] **Step 3: Type-check**

Run: `bun run check` — pass.

- [ ] **Step 4: Commit**

```bash
git add src/transcript/toolMeta.ts src/transcript/toolMeta.test.ts
git commit -m "feat: tool metadata helpers with snapshot tests"
```

---

## Task 4: Leaf rendering blocks (Text, Thinking, Image)

**Files:**
- Create: `src/transcript/TextBlock.tsx`
- Create: `src/transcript/ThinkingBlock.tsx`
- Create: `src/transcript/ImageBlock.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: TextBlock**

```tsx
import { Icons } from "./toolMeta"

export function TextBlock({ text, role }: { text: string; role?: string }) {
  if (!text.trim()) return null
  if (role === "user") return <div className="user-bubble">{text}</div>
  return (
    <div className="assistant-row">
      <Icons.Robot size={16} className="icon-muted" />
      <span>{text}</span>
    </div>
  )
}
```

- [ ] **Step 2: ThinkingBlock**

```tsx
import { useState } from "react"
import { Icons } from "./toolMeta"

export function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  if (!text.trim()) return null
  return (
    <button className="thinking" onClick={() => setExpanded(!expanded)}>
      <Icons.Brain size={16} className="icon-muted" />
      <span className={expanded ? "" : "clamp-1"}>{text}</span>
    </button>
  )
}
```

- [ ] **Step 3: ImageBlock**

```tsx
import type { ImageSource } from "../types"

export function ImageBlock({ source }: { source: ImageSource }) {
  const src =
    source.type === "base64"
      ? `data:${source.media_type};base64,${source.data}`
      : source.url
  return (
    <a href={src} target="_blank" rel="noreferrer" className="image-block">
      <img src={src} alt="" />
    </a>
  )
}
```

- [ ] **Step 4: Append CSS**

Append to `src/styles.css`:

```css
.user-bubble {
  background: var(--user-bubble, #1c2030);
  border-left: 3px solid var(--user-border, #3a4566);
  padding: 8px 12px;
  border-radius: 4px;
  white-space: pre-wrap;
  margin: 8px 0;
}
.assistant-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 0;
}
.assistant-row span { white-space: pre-wrap; flex: 1; }
.icon-muted { color: var(--muted); flex-shrink: 0; margin-top: 2px; }
.thinking {
  display: flex; align-items: flex-start; gap: 8px; width: 100%;
  text-align: left; color: var(--muted); font-style: italic; padding: 4px 0;
  background: none; border: none; cursor: pointer;
}
.thinking span { flex: 1; white-space: pre-wrap; }
.clamp-1 {
  display: -webkit-box; -webkit-line-clamp: 1;
  -webkit-box-orient: vertical; overflow: hidden;
}
.image-block { display: inline-block; margin: 4px 0; }
.image-block img {
  max-width: 100%;
  max-height: 320px;
  border: 1px solid var(--border);
  border-radius: 4px;
  display: block;
}
```

Add the user-bubble color tokens to the `:root` block at the top of `styles.css` (and the light-mode override) if they aren't already there:

```css
/* in :root */
--user-bubble: #1c2030;
--user-border: #3a4566;

/* in light prefers-color-scheme :root */
--user-bubble: #f0f4ff;
--user-border: #c0d0f0;
```

- [ ] **Step 5: Type-check**

Run: `bun run check` — pass.

- [ ] **Step 6: Commit**

```bash
git add src/transcript/TextBlock.tsx src/transcript/ThinkingBlock.tsx src/transcript/ImageBlock.tsx src/styles.css
git commit -m "feat: text/thinking/image leaf blocks"
```

---

## Task 5: ToolCard

**Files:**
- Create: `src/transcript/ToolCard.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write component**

```tsx
import { useState, type ReactNode } from "react"
import type { ToolUseBlock, ToolResult } from "../types"
import { iconFor, toolLabel, toolTitle } from "./toolMeta"
import { EditDiff } from "./EditDiff"
import { FileView } from "./FileView"
import { ImageBlock } from "./ImageBlock"

export function ToolCard({
  block,
  result,
}: {
  block: ToolUseBlock
  result: ToolResult
}) {
  const [expanded, setExpanded] = useState(false)
  const { Icon, color } = iconFor(block.name)
  const title = toolTitle(block.input)
  const label = toolLabel(block.name, title)
  const input = block.input ?? {}
  const output = result.text
  const filePath = (input.file_path as string) ?? ""

  let body: ReactNode = null
  if (block.name === "Bash") {
    const cmd = (input.command as string) ?? ""
    body = (
      <>
        {cmd && <pre className="cmd">$ {cmd}</pre>}
        {output && <pre className="output">{output}</pre>}
      </>
    )
  } else if (block.name === "Edit") {
    body = (
      <EditDiff
        filePath={filePath}
        oldString={(input.old_string as string) ?? ""}
        newString={(input.new_string as string) ?? ""}
      />
    )
  } else if (block.name === "MultiEdit") {
    const edits =
      (input.edits as Array<{ old_string?: string; new_string?: string }>) ?? []
    body = (
      <div className="multi-edit">
        {edits.map((e, i) => (
          <EditDiff
            key={i}
            filePath={filePath}
            oldString={e.old_string ?? ""}
            newString={e.new_string ?? ""}
          />
        ))}
      </div>
    )
  } else if (block.name === "Write") {
    body = (
      <FileView
        filePath={filePath}
        contents={(input.content as string) ?? ""}
      />
    )
  } else if (block.name === "Read" && output) {
    body = <FileView filePath={filePath} contents={output} />
  } else if (output) {
    body = <pre className="output">{output}</pre>
  }

  const images = result.images
  const hasBody = body !== null || images.length > 0
  const expandable = hasBody

  return (
    <div className="tool-card">
      <button
        className={`tool-row ${expandable ? "clickable" : ""}`}
        onClick={() => expandable && setExpanded(!expanded)}
      >
        <Icon size={16} className={`icon ${color}`} />
        <span>{label}</span>
      </button>
      {expanded && hasBody && (
        <div className="tool-body">
          {body}
          {images.map((src, i) => (
            <ImageBlock key={i} source={src} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Append CSS**

Append to `src/styles.css`:

```css
.tool-card { display: flex; flex-direction: column; }
.tool-row {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 6px; border-radius: 4px; width: 100%;
  text-align: left; background: none; border: none;
  color: inherit; font: inherit;
}
.tool-row.clickable { cursor: pointer; }
.tool-row.clickable:hover { background: var(--card); }
.tool-row .icon { flex-shrink: 0; }
.icon.tool-blue { color: #7ab7ff; }
.icon.tool-amber { color: #f5b870; }
.icon.tool-green { color: #74d99f; }
.icon.tool-violet { color: #c79bf3; }
.icon.tool-muted { color: var(--muted); }
.tool-body {
  margin: 4px 0 8px 24px;
  display: flex; flex-direction: column; gap: 6px;
}
.cmd, .output {
  font-size: 12px;
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px 10px;
  margin: 0;
  max-height: 480px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
.cmd { color: var(--muted); }
.multi-edit { display: flex; flex-direction: column; gap: 8px; }
```

- [ ] **Step 3: Type-check**

Run: `bun run check` — pass.

- [ ] **Step 4: Commit**

```bash
git add src/transcript/ToolCard.tsx src/styles.css
git commit -m "feat: ToolCard with per-tool body rendering"
```

---

## Task 6: Transcript (two-pass renderer)

**Files:**
- Create: `src/transcript/extractResult.ts`
- Create: `src/transcript/extractResult.test.ts`
- Create: `src/transcript/Transcript.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Extract the pure transform**

Create `src/transcript/extractResult.ts`:

```ts
import type {
  Entry,
  Block,
  ImageSource,
  ToolResult,
  ToolResultBlock,
} from "../types"

export function extractResult(block: ToolResultBlock): ToolResult {
  const c = block.content
  if (typeof c === "string") return { text: c, images: [] }
  const text: string[] = []
  const images: ImageSource[] = []
  for (const item of c) {
    if (item.type === "text") text.push(item.text)
    else if (item.type === "image") images.push(item.source)
  }
  return { text: text.join("\n"), images }
}

export function getBlocks(entry: Entry): Block[] {
  const c = entry.message?.content
  if (!c) return []
  if (typeof c === "string") return [{ type: "text", text: c }]
  return c
}
```

- [ ] **Step 2: Write tests**

Create `src/transcript/extractResult.test.ts`:

```ts
import { test, expect } from "bun:test"
import { parseJsonl } from "../parse"
import { extractResult, getBlocks } from "./extractResult"

test("extractResult on every tool_result in the fixture", async () => {
  const text = await Bun.file(
    new URL("../__fixtures__/sample.jsonl", import.meta.url),
  ).text()
  const { entries } = parseJsonl(text)

  const lines: string[] = []
  for (const entry of entries) {
    for (const block of getBlocks(entry)) {
      if (block.type === "tool_result") {
        const r = extractResult(block)
        lines.push(
          `${block.tool_use_id} text=${r.text.length}b images=${r.images.length}`,
        )
      }
    }
  }
  expect(lines.join("\n")).toMatchInlineSnapshot()
})

test("extractResult handles string content, mixed array, and image-only", () => {
  const summary = [
    extractResult({ type: "tool_result", tool_use_id: "a", content: "hello" }),
    extractResult({
      type: "tool_result",
      tool_use_id: "b",
      content: [
        { type: "text", text: "out" },
        { type: "image", source: { type: "base64", media_type: "image/png", data: "X" } },
        { type: "text", text: "more" },
      ],
    }),
    extractResult({
      type: "tool_result",
      tool_use_id: "c",
      content: [
        { type: "image", source: { type: "url", url: "https://x/y.png" } },
      ],
    }),
  ]
    .map(r => `text=${JSON.stringify(r.text)} images=${r.images.length}`)
    .join("\n")
  expect(summary).toMatchInlineSnapshot(
    `"text=\"hello\" images=0\ntext=\"out\\nmore\" images=1\ntext=\"\" images=1"`,
  )
})
```

- [ ] **Step 3: Run tests**

Run: `bun test src/transcript/extractResult.test.ts`
Expected: pass; first run writes the fixture-driven snapshot.

- [ ] **Step 4: Write the renderer**

Create `src/transcript/Transcript.tsx`:

```tsx
import type { ReactNode } from "react"
import type { Entry, ToolResult } from "../types"
import { extractResult, getBlocks } from "./extractResult"
import { TextBlock } from "./TextBlock"
import { ThinkingBlock } from "./ThinkingBlock"
import { ImageBlock } from "./ImageBlock"
import { ToolCard } from "./ToolCard"

const EMPTY_RESULT: ToolResult = { text: "", images: [] }

export function Transcript({ entries }: { entries: Entry[] }) {
  // Pass 1: index tool results
  const results = new Map<string, ToolResult>()
  for (const entry of entries) {
    for (const block of getBlocks(entry)) {
      if (block.type === "tool_result") {
        results.set(block.tool_use_id, extractResult(block))
      }
    }
  }

  // Pass 2: render
  const nodes: ReactNode[] = []
  let key = 0
  for (const entry of entries) {
    const role = entry.message?.role ?? entry.type
    for (const block of getBlocks(entry)) {
      const k = key++
      if (block.type === "text") {
        nodes.push(<TextBlock key={k} text={block.text} role={role} />)
      } else if (block.type === "thinking") {
        nodes.push(<ThinkingBlock key={k} text={block.thinking} />)
      } else if (block.type === "image") {
        nodes.push(<ImageBlock key={k} source={block.source} />)
      } else if (block.type === "tool_use") {
        nodes.push(
          <ToolCard
            key={k}
            block={block}
            result={results.get(block.id) ?? EMPTY_RESULT}
          />,
        )
      }
      // tool_result skipped (already paired)
    }
  }

  return <div className="transcript">{nodes}</div>
}
```

- [ ] **Step 5: Append CSS**

```css
.transcript { display: flex; flex-direction: column; gap: 4px; }
```

- [ ] **Step 6: Type-check**

Run: `bun run check` — pass.

- [ ] **Step 7: Commit**

```bash
git add src/transcript/extractResult.ts src/transcript/extractResult.test.ts src/transcript/Transcript.tsx src/styles.css
git commit -m "feat: Transcript two-pass renderer with snapshot tests"
```

---

## Task 7: Replace App spike with real shell

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Rewrite App**

Replace `src/App.tsx`:

```tsx
import { useRef, useState } from "react"
import { parseJsonl } from "./parse"
import type { Entry } from "./types"
import { Transcript } from "./transcript/Transcript"

export function App() {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [skipped, setSkipped] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function loadFile(file: File) {
    const text = await file.text()
    const result = parseJsonl(text)
    setEntries(result.entries)
    setFileName(file.name)
    setSkipped(result.skipped)
  }

  function reset() {
    setEntries(null)
    setFileName(null)
    setSkipped(0)
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>jsonl.fyi</h1>
        {entries && (
          <div className="meta">
            <span className="filename">{fileName}</span>
            <span className="count">{entries.length} entries</span>
            {skipped > 0 && <span className="skipped">{skipped} skipped</span>}
            <button className="reset" onClick={reset}>Clear</button>
          </div>
        )}
      </header>

      {!entries && (
        <div
          className={`drop-zone ${dragOver ? "drag-over" : ""}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault()
            setDragOver(false)
            const f = e.dataTransfer.files[0]
            if (f) void loadFile(f)
          }}
          onClick={() => inputRef.current?.click()}
        >
          <div className="drop-zone-text">
            Drop a Claude session <code>.jsonl</code> here
            <div className="drop-zone-sub">or click to choose a file</div>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".jsonl,application/jsonl,text/plain"
            data-testid="file-input"
            style={{ display: "none" }}
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) void loadFile(f)
            }}
          />
        </div>
      )}

      {entries && <Transcript entries={entries} />}
    </div>
  )
}
```

The `data-testid="file-input"` is for `agent-browser` to target reliably.

- [ ] **Step 2: Append/adjust CSS**

```css
.app-header {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 16px; margin-bottom: 16px;
}
.meta {
  display: flex; align-items: center; gap: 12px;
  font-size: 12px; color: var(--muted);
}
.meta .filename { color: var(--fg); font-family: ui-monospace, monospace; }
.meta .reset {
  color: var(--muted); text-decoration: underline; cursor: pointer;
  background: none; border: none; padding: 0; font: inherit;
}
.drop-zone-sub { margin-top: 8px; font-size: 12px; color: var(--muted); }
.drop-zone.drag-over { border-color: var(--fg); background: var(--card); }
```

- [ ] **Step 3: Type-check**

Run: `bun run check` — pass.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/styles.css
git commit -m "feat: drop zone shell + Transcript wiring"
```

---

## Task 8: End-to-end verification with agent-browser

**Files:**
- (No source changes; this task verifies the full app.)

The fixture file is `/Users/andrew/.claude/projects/-Users-andrew-Developer-Web-Dave/0512d505-a628-4e5f-93e2-7f1f99168488.jsonl` (383 lines, 79 Bash, 25 Read, 12 Edit, 7 Grep, 11 image entries).

- [ ] **Step 1: Start the dev server in the background**

```bash
cd /Users/andrew/Developer/Prefix/jsonl-fyi
bun --hot index.html &
```

Capture the printed URL (typically `http://localhost:3000/`).

- [ ] **Step 2: Drive the browser**

Use the `agent-browser` skill to:

1. Navigate to the dev URL.
2. Screenshot — confirm `<h1>jsonl.fyi</h1>` and the drop zone are present, no console errors.
3. Locate `input[data-testid="file-input"]` and upload the fixture file (use the input directly; do not attempt drag-and-drop).
4. Wait for the transcript to render.
5. Screenshot — confirm:
   - Header shows `0512d505-...jsonl` and an entry count > 100.
   - At least one element with class `user-bubble`, `assistant-row`, and `tool-card` is in the DOM.
   - At least one `<img>` element is rendered (fixture has 11 images).
6. Click the first `.tool-card .tool-row` — screenshot — confirm a `.tool-body` becomes visible underneath.
7. Click a tool card whose label starts with `Edited` — screenshot — confirm the `@pierre/diffs` `<FileDiff>` content renders (look for the library's CSS class names or addition/deletion markers).
8. Click a tool card whose label starts with `Ran command` — confirm `.cmd` and `.output` `<pre>` blocks are visible.

- [ ] **Step 3: Stop the dev server**

```bash
kill %1   # or whichever job number was assigned
```

- [ ] **Step 4: Commit any small fixes that came out of verification**

If verification surfaced bugs, fix them and commit:

```bash
git add -A
git commit -m "fix: <specific issue from agent-browser run>"
```

Then re-run Task 8 from Step 1.

If verification passes cleanly, no commit needed for this task.

---

## Self-Review

Spec coverage:
- Drop zone + file picker → Task 7
- JSONL parsing + noise filtering → Task 1
- Two-pass render with tool result pairing (text + images) → Task 6
- Text/thinking/image leaf blocks → Task 4
- ToolCard with per-tool branches (Bash, Edit, MultiEdit, Write, Read, default) → Task 5
- `@pierre/diffs` integration (FileView + EditDiff) → Tasks 2 + 5
- Phosphor icon set restricted to allowed list → Task 3
- tsgo + oxlint validation → Task 0
- agent-browser end-to-end verification with image-bearing fixture → Task 8

Placeholder scan: all code blocks contain real implementations; the only conditional ("if the spike fails…") in Task 2 has explicit fallback instructions.

Type consistency: `ToolResult = { text: string; images: ImageSource[] }` defined in Task 1 and consumed identically in Tasks 5 and 6. `extractResult` returns the same shape. `Block` discriminated union is consistent across files.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-28-jsonl-viewer.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration. Good fit since each task is independent and small.

**2. Inline Execution** — execute tasks in this session using executing-plans, with batch checkpoints for review.

Which approach?
