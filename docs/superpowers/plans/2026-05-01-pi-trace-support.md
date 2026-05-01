# Pi Trace Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only rendering for local pi session JSONL files, following pi's active branch and showing integrated tool cards for built-in and extension tools.

**Architecture:** Add a dedicated `src/transcript/pi/` sibling with wire types, parser, transcript renderer, entry renderer, and tool renderer. Reuse existing shared transcript components for markdown, thinking, images, tool cards, diffs, previews, and unknown tools. Keep pi tree traversal in `parse.ts` so future full tree UI can build on the same data.

**Tech Stack:** Vite, React, TypeScript, Bun tests, existing jsonl.fyi transcript components, existing agent-browser UI verification against port 3000.

---

## File Structure

Create:

- `src/transcript/pi/types.ts` — pi JSONL wire types plus parsed transcript shape.
- `src/transcript/pi/parse.ts` — validates/keeps pi entries, separates header, reconstructs active branch, computes hidden/orphan counts.
- `src/transcript/pi/parse.test.ts` — parser tests for active branch, hidden branches, orphan tolerance, unknown entries.
- `src/transcript/pi/toolResult.ts` — converts pi `toolResult` message content to the shared normalized `ToolResult`, including ordered text/image content.
- `src/transcript/pi/toolResult.test.ts` — tool result conversion tests, including mixed text/image ordering.
- `src/transcript/pi/Tool.tsx` — pi tool card rendering for built-ins, `plan_tracker`, `subagent`, and unknown tools.
- `src/transcript/pi/Tool.test.tsx` — render tests for pi tool cards and unknown fallback.
- `src/transcript/pi/EntryView.tsx` — renders pi entries/content blocks and skips paired tool result entries.
- `src/transcript/pi/PiTranscript.tsx` — pre-pairs tool results, renders header, active entries, branch footnote.

Modify:

- `src/types.ts` — add shared ordered `ToolResult.content` for text/image result parts.
- `src/transcript/shared.tsx` and `src/transcript/UnknownTool.tsx` — render ordered result content for unknown/custom tools.
- `src/transcript/claude/extractResult.ts` and tests — populate ordered result content for Claude.
- `src/transcript/codex/CodexTranscript.tsx` and tests — populate ordered result content for Codex.
- `src/parse/classify.ts` — add `"pi"` to format label and pi-specific classifier signals.
- `src/parse/classify.test.ts` — add pi classification tests and guard generic `message.role` from classifying as pi.
- `src/App.tsx` — parse/render pi sessions and update copy/errors.
- `src/FileIcon.tsx` — add `"pi"` format variant.
- `src/styles.css` — add small pi metadata/footnote styles using existing design tokens.

Add fixture:

- Copy one real pi trace from `~/.pi/agent/sessions/--Users-andrew-Developer-Prefix-jsonl-fyi--/` into `src/transcript/__fixtures__/`, preserving the original filename.

---

### Task 1: Classify pi JSONL without false positives

**Files:**

- Modify: `src/parse/classify.ts`
- Modify: `src/parse/classify.test.ts`

- [ ] **Step 1: Write failing classifier tests**

Add these tests to `src/parse/classify.test.ts`:

```ts
test("classifyJsonl: pi from session header", () => {
  expect(
    classifyJsonl([
      {
        type: "session",
        version: 3,
        id: "019de507-1cf4-74ae-b5bc-907e992ba866",
        timestamp: "2026-05-01T19:32:21.877Z",
        cwd: "/Users/andrew/Developer/Prefix/jsonl-fyi",
      },
    ]),
  ).toBe("pi")
})

test("classifyJsonl: pi from model_change", () => {
  expect(
    classifyJsonl([
      {
        type: "model_change",
        id: "63ff15ff",
        parentId: null,
        timestamp: "2026-05-01T19:32:21.917Z",
        provider: "openai-codex",
        modelId: "gpt-5.5",
      },
    ]),
  ).toBe("pi")
})

test("classifyJsonl: pi from thinking_level_change", () => {
  expect(
    classifyJsonl([
      {
        type: "thinking_level_change",
        id: "4b424fab",
        parentId: "63ff15ff",
        timestamp: "2026-05-01T19:32:21.917Z",
        thinkingLevel: "medium",
      },
    ]),
  ).toBe("pi")
})

test("classifyJsonl: generic message role alone is unknown", () => {
  expect(
    classifyJsonl([
      {
        type: "message",
        id: "m1",
        parentId: null,
        timestamp: "2026-01-01T00:00:00.000Z",
        message: { role: "user", content: "hello" },
      },
    ]),
  ).toBe("unknown")
})
```

- [ ] **Step 2: Run classifier tests and verify failure**

Run:

```bash
bun test src/parse/classify.test.ts
```

Expected: at least the new pi tests fail because `"pi"` is not a known return value yet.

- [ ] **Step 3: Implement pi classifier signals**

Replace `src/parse/classify.ts` with:

```ts
const CODEX_TYPES = new Set([
  "session_meta",
  "response_item",
  "turn_context",
  "event_msg",
  "compacted",
])
const CLAUDE_TYPES = new Set(["user", "assistant", "system"])
const PI_TYPES = new Set(["model_change", "thinking_level_change"])

export type FormatLabel = "claude" | "codex" | "pi" | "unknown"

function isPiSessionHeader(line: Record<string, unknown>): boolean {
  return (
    line.type === "session" &&
    typeof line.version === "number" &&
    typeof line.id === "string" &&
    typeof line.cwd === "string"
  )
}

export function classifyJsonl(lines: readonly unknown[]): FormatLabel {
  let sawClaude = false
  for (let i = 0; i < lines.length && i < 10; i++) {
    const line = lines[i]
    if (!line || typeof line !== "object") continue
    const obj = line as Record<string, unknown>
    const t = obj.type
    if (typeof t !== "string") continue
    if (CODEX_TYPES.has(t)) return "codex"
    if (isPiSessionHeader(obj) || PI_TYPES.has(t)) return "pi"
    if (CLAUDE_TYPES.has(t)) sawClaude = true
  }
  return sawClaude ? "claude" : "unknown"
}
```

- [ ] **Step 4: Run classifier tests and verify pass**

Run:

```bash
bun test src/parse/classify.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit classifier support**

```bash
git add src/parse/classify.ts src/parse/classify.test.ts
git commit -m "feat(pi): classify pi session jsonl"
```

---

### Task 2: Define pi wire types and active-branch parser

**Files:**

- Create: `src/transcript/pi/types.ts`
- Create: `src/transcript/pi/parse.ts`
- Create: `src/transcript/pi/parse.test.ts`

- [ ] **Step 1: Create pi type definitions**

Create `src/transcript/pi/types.ts`:

```ts
import type { ImageSource } from "../../types"

export type PiTextContent = { type: "text"; text: string }
export type PiImageContent = { type: "image"; data: string; mimeType: string }
export type PiThinkingContent = { type: "thinking"; thinking: string; thinkingSignature?: string }
export type PiToolCallContent = {
  type: "toolCall"
  id: string
  name: string
  arguments: Record<string, unknown>
}
export type PiContent = PiTextContent | PiImageContent | PiThinkingContent | PiToolCallContent

export type PiUsage = {
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
  totalTokens?: number
  cost?: {
    input?: number
    output?: number
    cacheRead?: number
    cacheWrite?: number
    total?: number
  }
}

export type PiUserMessage = {
  role: "user"
  content: string | Array<PiTextContent | PiImageContent>
  timestamp?: number
}

export type PiAssistantMessage = {
  role: "assistant"
  content: PiContent[]
  api?: string
  provider?: string
  model?: string
  usage?: PiUsage
  stopReason?: "stop" | "length" | "toolUse" | "error" | "aborted" | string
  errorMessage?: string
  timestamp?: number
  responseId?: string
}

export type PiToolResultMessage = {
  role: "toolResult"
  toolCallId: string
  toolName: string
  content: Array<PiTextContent | PiImageContent>
  details?: unknown
  isError?: boolean
  timestamp?: number
}

export type PiBashExecutionMessage = {
  role: "bashExecution"
  command: string
  output: string
  exitCode?: number
  cancelled: boolean
  truncated: boolean
  fullOutputPath?: string
  excludeFromContext?: boolean
  timestamp?: number
}

export type PiCustomMessage = {
  role: "custom"
  customType: string
  content: string | Array<PiTextContent | PiImageContent>
  display: boolean
  details?: unknown
  timestamp?: number
}

export type PiBranchSummaryMessage = {
  role: "branchSummary"
  summary: string
  fromId: string
  timestamp?: number
}

export type PiCompactionSummaryMessage = {
  role: "compactionSummary"
  summary: string
  tokensBefore: number
  timestamp?: number
}

export type PiMessage =
  | PiUserMessage
  | PiAssistantMessage
  | PiToolResultMessage
  | PiBashExecutionMessage
  | PiCustomMessage
  | PiBranchSummaryMessage
  | PiCompactionSummaryMessage
  | { role: string; [key: string]: unknown }

export type PiSessionHeader = {
  type: "session"
  version?: number
  id: string
  timestamp: string
  cwd?: string
  parentSession?: string
}

export type PiEntryBase = {
  type: string
  id: string
  parentId: string | null
  timestamp?: string
}

export type PiMessageEntry = PiEntryBase & { type: "message"; message: PiMessage }
export type PiModelChangeEntry = PiEntryBase & {
  type: "model_change"
  provider: string
  modelId: string
}
export type PiThinkingLevelChangeEntry = PiEntryBase & {
  type: "thinking_level_change"
  thinkingLevel: string
}
export type PiCompactionEntry = PiEntryBase & {
  type: "compaction"
  summary: string
  firstKeptEntryId: string
  tokensBefore: number
  details?: unknown
  fromHook?: boolean
}
export type PiBranchSummaryEntry = PiEntryBase & {
  type: "branch_summary"
  fromId: string
  summary: string
  details?: unknown
  fromHook?: boolean
}
export type PiCustomEntry = PiEntryBase & { type: "custom"; customType: string; data?: unknown }
export type PiCustomMessageEntry = PiEntryBase & {
  type: "custom_message"
  customType: string
  content: string | Array<PiTextContent | PiImageContent>
  display: boolean
  details?: unknown
}
export type PiLabelEntry = PiEntryBase & { type: "label"; targetId: string; label?: string }
export type PiSessionInfoEntry = PiEntryBase & { type: "session_info"; name?: string }
export type PiUnknownEntry = PiEntryBase & { type: string; [key: string]: unknown }

export type PiTreeEntry =
  | PiMessageEntry
  | PiModelChangeEntry
  | PiThinkingLevelChangeEntry
  | PiCompactionEntry
  | PiBranchSummaryEntry
  | PiCustomEntry
  | PiCustomMessageEntry
  | PiLabelEntry
  | PiSessionInfoEntry
  | PiUnknownEntry

export type PiParsedSession = {
  header: PiSessionHeader | null
  entries: PiTreeEntry[]
  activeEntries: PiTreeEntry[]
  hiddenBranchEntryCount: number
  orphanedEntryCount: number
}

export function piImageToSource(image: PiImageContent): ImageSource {
  return { type: "base64", media_type: image.mimeType, data: image.data }
}
```

- [ ] **Step 2: Write failing parser tests**

Create `src/transcript/pi/parse.test.ts`:

```ts
import { test, expect } from "bun:test"
import { parsePiEntries } from "./parse"

const header = {
  type: "session",
  version: 3,
  id: "s1",
  timestamp: "2026-05-01T00:00:00.000Z",
  cwd: "/repo",
}

function msg(id: string, parentId: string | null, role: "user" | "assistant", text: string) {
  return {
    type: "message",
    id,
    parentId,
    timestamp: `2026-05-01T00:00:0${id.length}.000Z`,
    message: { role, content: [{ type: "text", text }] },
  }
}

test("parsePiEntries: preserves header and active linear branch", () => {
  const parsed = parsePiEntries([
    header,
    {
      type: "model_change",
      id: "m",
      parentId: null,
      timestamp: "t",
      provider: "openai",
      modelId: "gpt",
    },
    msg("u1", "m", "user", "hello"),
    msg("a1", "u1", "assistant", "hi"),
  ])
  expect(parsed.header?.id).toBe("s1")
  expect(parsed.entries.map((e) => e.id)).toEqual(["m", "u1", "a1"])
  expect(parsed.activeEntries.map((e) => e.id)).toEqual(["m", "u1", "a1"])
  expect(parsed.hiddenBranchEntryCount).toBe(0)
  expect(parsed.orphanedEntryCount).toBe(0)
})

test("parsePiEntries: active branch follows last non-session entry", () => {
  const parsed = parsePiEntries([
    header,
    msg("u1", null, "user", "start"),
    msg("a1", "u1", "assistant", "first"),
    msg("u2", "a1", "user", "old branch"),
    msg("a2", "u2", "assistant", "old answer"),
    msg("u3", "a1", "user", "new branch"),
    msg("a3", "u3", "assistant", "new answer"),
  ])
  expect(parsed.activeEntries.map((e) => e.id)).toEqual(["u1", "a1", "u3", "a3"])
  expect(parsed.hiddenBranchEntryCount).toBe(2)
})

test("parsePiEntries: missing parent starts an orphan path", () => {
  const parsed = parsePiEntries([header, msg("u1", "missing", "user", "orphan")])
  expect(parsed.activeEntries.map((e) => e.id)).toEqual(["u1"])
  expect(parsed.orphanedEntryCount).toBe(1)
})

test("parsePiEntries: keeps unknown tree entries with id", () => {
  const parsed = parsePiEntries([
    header,
    {
      type: "surprise",
      id: "x",
      parentId: null,
      timestamp: "2026-05-01T00:00:01.000Z",
      payload: { ok: true },
    },
  ])
  expect(parsed.entries.map((e) => e.type)).toEqual(["surprise"])
  expect(parsed.activeEntries.map((e) => e.id)).toEqual(["x"])
})

test("parsePiEntries: drops malformed objects without id", () => {
  const parsed = parsePiEntries([header, { type: "message", parentId: null }, null, "bad"])
  expect(parsed.entries).toHaveLength(0)
  expect(parsed.activeEntries).toHaveLength(0)
})
```

- [ ] **Step 3: Run parser tests and verify failure**

Run:

```bash
bun test src/transcript/pi/parse.test.ts
```

Expected: fails because `src/transcript/pi/parse.ts` does not exist.

- [ ] **Step 4: Implement active-branch parser**

Create `src/transcript/pi/parse.ts`:

```ts
import type { PiParsedSession, PiSessionHeader, PiTreeEntry } from "./types"

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object"
}

function isHeader(value: Record<string, unknown>): value is PiSessionHeader {
  return value.type === "session" && typeof value.id === "string"
}

function isTreeEntry(value: Record<string, unknown>): value is PiTreeEntry {
  return (
    typeof value.type === "string" &&
    value.type !== "session" &&
    typeof value.id === "string" &&
    (typeof value.parentId === "string" || value.parentId === null)
  )
}

export function parsePiEntries(lines: Iterable<unknown>): PiParsedSession {
  let header: PiSessionHeader | null = null
  const entries: PiTreeEntry[] = []

  for (const line of lines) {
    if (!isObject(line)) continue
    if (isHeader(line)) {
      header ??= line
      continue
    }
    if (isTreeEntry(line)) entries.push(line)
  }

  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const activeEntries: PiTreeEntry[] = []
  let orphanedEntryCount = 0
  let current = entries.at(-1)
  const seen = new Set<string>()

  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    activeEntries.unshift(current)
    if (current.parentId == null) break
    const parent = byId.get(current.parentId)
    if (!parent) {
      orphanedEntryCount++
      break
    }
    current = parent
  }

  return {
    header,
    entries,
    activeEntries,
    hiddenBranchEntryCount: Math.max(0, entries.length - activeEntries.length),
    orphanedEntryCount,
  }
}
```

- [ ] **Step 5: Run parser tests and verify pass**

Run:

```bash
bun test src/transcript/pi/parse.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit parser**

```bash
git add src/transcript/pi/types.ts src/transcript/pi/parse.ts src/transcript/pi/parse.test.ts
git commit -m "feat(pi): parse active session branch"
```

---

### Task 3: Replace ToolResult summaries with canonical ordered content

**Files:**

- Modify: `src/types.ts`
- Modify: `src/transcript/shared.tsx`
- Modify: `src/transcript/UnknownTool.tsx`
- Modify: `src/transcript/claude/extractResult.ts`
- Modify: `src/transcript/claude/extractResult.test.ts`
- Modify: `src/transcript/claude/ClaudeCodeTranscript.tsx`
- Modify: `src/transcript/claude/EntryView.tsx`
- Modify: `src/transcript/claude/Tool.tsx`
- Modify: `src/transcript/claude/Tool.test.tsx`
- Modify: `src/transcript/codex/CodexTranscript.tsx`
- Modify: `src/transcript/codex/EntryView.tsx`
- Modify: `src/transcript/codex/Tool.tsx`
- Modify: `src/transcript/codex/Tool.test.tsx`

- [ ] **Step 1: Write failing tests for canonical ordered results**

In `src/transcript/claude/extractResult.test.ts`, replace the mixed array test with:

```ts
test("extractResult preserves ordered text/image content", () => {
  const image = { type: "base64" as const, media_type: "image/png", data: "X" }
  const mixed = extractResult({
    type: "tool_result",
    tool_use_id: "b",
    content: [
      { type: "text", text: "out" },
      { type: "image", source: image },
      { type: "text", text: "more" },
    ],
  })

  expect(mixed.content).toEqual([
    { type: "text", text: "out" },
    { type: "image", source: image },
    { type: "text", text: "more" },
  ])
})
```

Add a shared rendering test to `src/transcript/claude/Tool.test.tsx` or a new shared test file:

```tsx
test("UnknownTool renders ordered mixed text and image output", () => {
  const image = { type: "base64" as const, media_type: "image/png", data: "X" }
  const html = renderToStaticMarkup(
    <SettingsProvider initial={{ renderMarkdown: true, viewMode: "normal" }}>
      <UnknownTool
        name="mixed_tool"
        input={{}}
        output={{
          content: [
            { type: "text", text: "before" },
            { type: "image", source: image },
            { type: "text", text: "after" },
          ],
          isError: false,
        }}
      />
    </SettingsProvider>,
  )
  expect(html.indexOf("before")).toBeLessThan(html.indexOf("image-block"))
  expect(html.indexOf("image-block")).toBeLessThan(html.indexOf("after"))
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun test src/transcript/claude/extractResult.test.ts src/transcript/claude/Tool.test.tsx
```

Expected: fails because `ToolResult` is still summary-field based and renderers do not use canonical ordered content.

- [ ] **Step 3: Replace the shared ToolResult type**

In `src/types.ts`, replace `ToolResult` with a canonical ordered shape:

```ts
export type ToolResultContent =
  | { type: "text"; text: string }
  | { type: "image"; source: ImageSource }

export type ToolResult = {
  content: ToolResultContent[]
  isError: boolean
  // Text the harness emits as a sibling user message right after the
  // tool_result, related to this tool call. Today only the Skill tool uses
  // it (the injected skill markdown body); see Transcript.tsx pre-pass.
  injectedText?: string
}
```

Remove `text`, `images`, and `toolRefs` from the normalized type. They duplicate data that belongs in `content` or in tool-specific rendering.

- [ ] **Step 4: Add shared helper functions and ordered renderer**

In `src/transcript/shared.tsx`, replace `Output`, `Extras`, and `hasOutput` with helpers derived from `content`:

```tsx
export function toolResultText(output: ToolResult): string {
  return output.content
    .filter(
      (item): item is Extract<ToolResult["content"][number], { type: "text" }> =>
        item.type === "text",
    )
    .map((item) => item.text)
    .join("\n")
}

export function toolResultImages(output: ToolResult): ImageSource[] {
  return output.content
    .filter(
      (item): item is Extract<ToolResult["content"][number], { type: "image" }> =>
        item.type === "image",
    )
    .map((item) => item.source)
}

export function Output({ output }: { output: ToolResult }) {
  const text = toolResultText(output)
  return text ? <pre className="output">{text}</pre> : null
}

export function ToolResultContent({ output }: { output: ToolResult }) {
  return (
    <>
      {output.content.map((item, i) => {
        if (item.type === "text")
          return (
            <pre key={i} className="output">
              {item.text}
            </pre>
          )
        return <ImageBlock key={i} source={item.source} />
      })}
    </>
  )
}

export function Extras({ output }: { output: ToolResult }) {
  return (
    <>
      {toolResultImages(output).map((src, i) => (
        <ImageBlock key={i} source={src} />
      ))}
    </>
  )
}

export function hasOutput(output: ToolResult): boolean {
  return output.content.length > 0
}
```

Also import `ImageSource` from `../types` at the top of `shared.tsx`:

```ts
import type { ImageSource, ToolResult } from "../types"
```

- [ ] **Step 5: Update Claude extraction**

In `src/transcript/claude/extractResult.ts`, return only ordered `content` plus `isError`:

```ts
export function extractResult(block: ToolResultBlock): ToolResult {
  const c = block.content
  const isError = block.is_error === true
  if (typeof c === "string") {
    return { content: c ? [{ type: "text", text: c }] : [], isError }
  }
  const content: ToolResult["content"] = []
  for (const item of c) {
    if (item.type === "text") content.push({ type: "text", text: item.text })
    else if (item.type === "image") content.push({ type: "image", source: item.source })
  }
  return { content, isError }
}
```

Do not carry Claude `tool_reference` into the canonical shared result. It is specific to Claude `ToolSearch`; keep that behavior in the specific ToolSearch renderer if needed later.

- [ ] **Step 6: Update existing renderers to use helper-derived summaries**

Replace all direct reads of old summary fields with helpers in known tool renderers. Use `toolResultText(output)` for text previews/output and `toolResultImages(output)` only when a component specifically needs image counts or image-only summaries. Files to update include:

- `src/transcript/UnknownTool.tsx`
- `src/transcript/claude/Tool.tsx`
- `src/transcript/codex/Tool.tsx`

For unknown/custom tool output, render full output with ordered content:

```tsx
<ToolResultContent output={output} />
```

For known tools that intentionally show text-only shell output, use:

```ts
const text = toolResultText(output)
const tail = text ? tailLines(text, 3) : null
```

- [ ] **Step 7: Update ToolResult literals across Claude and Codex paths**

Update empty results to:

```ts
const EMPTY_RESULT: ToolResult = { content: [], isError: false }
```

Update Codex result construction in `src/transcript/codex/CodexTranscript.tsx` to:

```ts
results.set(p.call_id, {
  content: p.output ? [{ type: "text", text: p.output }] : [],
  isError: deriveIsError(p.output, "function"),
})
```

Use the same shape for `custom_tool_call_output`.

Update tests in `src/transcript/claude/Tool.test.tsx` and `src/transcript/codex/Tool.test.tsx` so `okOutput` is:

```ts
export const okOutput: ToolResult = { content: [], isError: false }
```

When a test needs output text, use:

```ts
{ ...okOutput, content: [{ type: "text", text: "line 1\nline 2" }] }
```

- [ ] **Step 8: Run tests and verify pass**

Run:

```bash
bun test src/transcript/claude/extractResult.test.ts src/transcript/claude/Tool.test.tsx src/transcript/codex/Tool.test.tsx src/transcript/codex/CodexTranscript.test.tsx
bun run check
```

Expected: tests and checks pass.

- [ ] **Step 9: Commit shared normalization**

```bash
git add src/types.ts src/transcript/shared.tsx src/transcript/UnknownTool.tsx src/transcript/claude/extractResult.ts src/transcript/claude/extractResult.test.ts src/transcript/claude/ClaudeCodeTranscript.tsx src/transcript/claude/EntryView.tsx src/transcript/claude/Tool.tsx src/transcript/claude/Tool.test.tsx src/transcript/codex/CodexTranscript.tsx src/transcript/codex/EntryView.tsx src/transcript/codex/Tool.tsx src/transcript/codex/Tool.test.tsx
git commit -m "feat(transcript): use ordered tool result content"
```

---

### Task 4: Convert pi tool results while preserving mixed text/image order

**Files:**

- Create: `src/transcript/pi/toolResult.ts`
- Create: `src/transcript/pi/toolResult.test.ts`

- [ ] **Step 1: Write failing tool result conversion tests**

Create `src/transcript/pi/toolResult.test.ts`:

```ts
import { test, expect } from "bun:test"
import { extractPiToolResult } from "./toolResult"
import type { PiToolResultMessage } from "./types"

function result(overrides: Partial<PiToolResultMessage>): PiToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: "call-1",
    toolName: "read",
    content: [],
    isError: false,
    ...overrides,
  }
}

test("extractPiToolResult: preserves text blocks", () => {
  const out = extractPiToolResult(
    result({
      content: [
        { type: "text", text: "hello" },
        { type: "text", text: "world" },
      ],
    }),
  )
  expect(out.content).toEqual([
    { type: "text", text: "hello" },
    { type: "text", text: "world" },
  ])
  expect(out.isError).toBe(false)
})

test("extractPiToolResult: preserves mixed text/image order", () => {
  const out = extractPiToolResult(
    result({
      content: [
        { type: "text", text: "before" },
        { type: "image", data: "abc", mimeType: "image/png" },
        { type: "text", text: "after" },
      ],
    }),
  )
  expect(out.content).toEqual([
    { type: "text", text: "before" },
    { type: "image", source: { type: "base64", media_type: "image/png", data: "abc" } },
    { type: "text", text: "after" },
  ])
})

test("extractPiToolResult: preserves isError", () => {
  expect(extractPiToolResult(result({ isError: true })).isError).toBe(true)
})
```

- [ ] **Step 2: Run tool result tests and verify failure**

Run:

```bash
bun test src/transcript/pi/toolResult.test.ts
```

Expected: fails because `toolResult.ts` does not exist.

- [ ] **Step 3: Implement conversion**

Create `src/transcript/pi/toolResult.ts`:

```ts
import type { ToolResult } from "../../types"
import type { PiToolResultMessage } from "./types"
import { piImageToSource } from "./types"

export function extractPiToolResult(message: PiToolResultMessage): ToolResult {
  const content: ToolResult["content"] = []

  for (const item of message.content) {
    if (item.type === "text") {
      content.push({ type: "text", text: item.text })
    } else if (item.type === "image") {
      content.push({ type: "image", source: piImageToSource(item) })
    }
  }

  return { content, isError: !!message.isError }
}
```

- [ ] **Step 4: Run tool result tests and verify pass**

Run:

```bash
bun test src/transcript/pi/toolResult.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit result conversion**

```bash
git add src/transcript/pi/toolResult.ts src/transcript/pi/toolResult.test.ts
git commit -m "feat(pi): convert tool results"
```

---

### Task 5: Render pi tool cards

**Files:**

- Create: `src/transcript/pi/Tool.tsx`
- Create: `src/transcript/pi/Tool.test.tsx`

- [ ] **Step 1: Write failing pi tool render tests**

Create `src/transcript/pi/Tool.test.tsx`:

```tsx
import { test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { SettingsProvider, type Settings } from "../../settings"
import type { ToolResult } from "../../types"
import { PiTool } from "./Tool"

const okOutput: ToolResult = { content: [], isError: false }

function renderTool(
  name: string,
  input: Record<string, unknown>,
  output: ToolResult = okOutput,
  details?: unknown,
  settings: Partial<Settings> = {},
): string {
  return renderToStaticMarkup(
    <SettingsProvider initial={{ renderMarkdown: true, viewMode: "normal", ...settings }}>
      <PiTool
        call={{ type: "toolCall", id: "c1", name, arguments: input }}
        output={output}
        details={details}
      />
    </SettingsProvider>,
  )
}

test("PiTool: bash renders command and tail preview", () => {
  const html = renderTool(
    "bash",
    { command: "ls -la", timeout: 10 },
    { ...okOutput, content: [{ type: "text", text: "1\n2\n3\n4" }] },
  )
  expect(html).toContain("bash")
  expect(html).toContain("ls -la")
  expect(html).toContain("2\n3\n4")
})

test("PiTool: read renders path and output summary", () => {
  const html = renderTool(
    "read",
    { path: "/tmp/file.ts", offset: 1, limit: 20 },
    { ...okOutput, content: [{ type: "text", text: "a\nb" }] },
  )
  expect(html).toContain("read")
  expect(html).toContain("file.ts")
  expect(html).toContain("Read 2 lines")
})

test("PiTool: plan_tracker renders progress preview", () => {
  const html = renderTool(
    "plan_tracker",
    { action: "update", index: 0, status: "complete" },
    okOutput,
    {
      action: "update",
      tasks: [
        { name: "Explore", status: "complete" },
        { name: "Build", status: "pending" },
      ],
    },
  )
  expect(html).toContain("plan_tracker")
  expect(html).toContain("1 / 2 complete")
})

test("PiTool: subagent renders mode and result preview", () => {
  const html = renderTool(
    "subagent",
    { agent: "scout", task: "inspect" },
    { ...okOutput, content: [{ type: "text", text: "Scout found parser files" }] },
    { mode: "single", results: [{ agent: "scout", exitCode: 0 }] },
  )
  expect(html).toContain("subagent")
  expect(html).toContain("single")
  expect(html).toContain("Scout found parser files")
})

test("PiTool: read preserves ordered mixed text and image result content", () => {
  const image = { type: "base64" as const, media_type: "image/png", data: "abc" }
  const html = renderTool(
    "read",
    { path: "/tmp/file.ts" },
    {
      ...okOutput,
      content: [
        { type: "text", text: "before" },
        { type: "image", source: image },
        { type: "text", text: "after" },
      ],
    },
  )
  expect(html.indexOf("before")).toBeLessThan(html.indexOf("image-block"))
  expect(html.indexOf("image-block")).toBeLessThan(html.indexOf("after"))
})

test("PiTool: unknown tool uses integrated fallback", () => {
  const html = renderTool(
    "my_extension_tool",
    { action: "go" },
    { ...okOutput, content: [{ type: "text", text: "Done" }] },
  )
  expect(html).toContain("my_extension_tool")
  expect(html).toContain("action")
  expect(html).toContain("Done")
})
```

- [ ] **Step 2: Run pi tool tests and verify failure**

Run:

```bash
bun test src/transcript/pi/Tool.test.tsx
```

Expected: fails because `Tool.tsx` does not exist.

- [ ] **Step 3: Implement pi tool rendering**

Create `src/transcript/pi/Tool.tsx`:

```tsx
import type { ReactNode } from "react"
import type { ToolResult } from "../../types"
import { ToolCard } from "../ToolCard"
import { Header, Field, ToolResultContent, ToolTitle, hasOutput, toolResultText } from "../shared"
import { UnknownTool } from "../UnknownTool"
import { MoreHint } from "../MoreHint"
import { headLines, tailLines } from "../preview"
import type { PiToolCallContent } from "./types"

function shortPath(path: string): string {
  const parts = path.split("/").filter(Boolean)
  return parts.at(-1) ?? path
}

function readSummary(text: string): string {
  if (!text) return "(no output)"
  const trimmed = text.endsWith("\n") ? text.slice(0, -1) : text
  const n = trimmed ? trimmed.split("\n").length : 0
  return `Read ${n} ${n === 1 ? "line" : "lines"}`
}

function objectDetails(details: unknown): Record<string, unknown> | null {
  return details && typeof details === "object" && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : null
}

function ShellTool({ call, output }: { call: PiToolCallContent; output: ToolResult }) {
  const command = typeof call.arguments.command === "string" ? call.arguments.command : undefined
  const timeout = typeof call.arguments.timeout === "number" ? call.arguments.timeout : undefined
  const outputText = toolResultText(output)
  const tail = outputText ? tailLines(outputText, output.isError ? 10 : 3) : null
  const snippetClass = output.isError
    ? "tool-preview-snippet snippet-error"
    : "tool-preview-snippet"
  return (
    <ToolCard.Root
      hasContent={!!command || timeout != null || hasOutput(output)}
      status={output.isError ? "error" : "success"}
    >
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="bash" detail={command} />
        </Header>
      </ToolCard.Trigger>
      {tail && (
        <ToolCard.Preview>
          <pre className={snippetClass}>{tail.text}</pre>
          <MoreHint count={tail.remaining} />
        </ToolCard.Preview>
      )}
      <ToolCard.Content>
        {command && <pre className="output cmd">{command}</pre>}
        {timeout != null && (
          <dl className="tool-fields">
            <Field name="timeout" value={`${timeout}s`} />
          </dl>
        )}
        <ToolResultContent output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function ReadTool({ call, output }: { call: PiToolCallContent; output: ToolResult }) {
  const path = typeof call.arguments.path === "string" ? call.arguments.path : undefined
  const offset = typeof call.arguments.offset === "number" ? call.arguments.offset : undefined
  const limit = typeof call.arguments.limit === "number" ? call.arguments.limit : undefined
  return (
    <ToolCard.Root
      hasContent={offset != null || limit != null || hasOutput(output)}
      status={output.isError ? "error" : "success"}
    >
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="read" detail={path && shortPath(path)} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Preview>
        <div className="tool-preview-line">{readSummary(toolResultText(output))}</div>
      </ToolCard.Preview>
      <ToolCard.Content>
        {(offset != null || limit != null) && (
          <dl className="tool-fields">
            {offset != null && <Field name="offset" value={offset} />}
            {limit != null && <Field name="limit" value={limit} />}
          </dl>
        )}
        <ToolResultContent output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function GenericFileTool({ call, output }: { call: PiToolCallContent; output: ToolResult }) {
  const path = typeof call.arguments.path === "string" ? call.arguments.path : undefined
  const outputText = toolResultText(output)
  const head = outputText ? headLines(outputText, 3) : null
  return (
    <ToolCard.Root
      hasContent={Object.keys(call.arguments).length > 0 || hasOutput(output)}
      status={output.isError ? "error" : "success"}
    >
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name={call.name} detail={path && shortPath(path)} />
        </Header>
      </ToolCard.Trigger>
      {head && (
        <ToolCard.Preview>
          <pre className="tool-preview-snippet">{head.text}</pre>
          <MoreHint count={head.remaining} />
        </ToolCard.Preview>
      )}
      <ToolCard.Content>
        {Object.keys(call.arguments).length > 0 && (
          <dl className="tool-fields">
            {Object.entries(call.arguments).map(([key, value]) => (
              <Field
                key={key}
                name={key}
                value={typeof value === "string" ? value : JSON.stringify(value, null, 2)}
              />
            ))}
          </dl>
        )}
        <ToolResultContent output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function PlanTrackerTool({
  call,
  output,
  details,
}: {
  call: PiToolCallContent
  output: ToolResult
  details?: unknown
}) {
  const d = objectDetails(details)
  const tasks = Array.isArray(d?.tasks) ? d.tasks : []
  const done = tasks.filter((task) => objectDetails(task)?.status === "complete").length
  const total = tasks.length
  const action = typeof call.arguments.action === "string" ? call.arguments.action : "plan_tracker"
  return (
    <ToolCard.Root
      hasContent={Object.keys(call.arguments).length > 0 || total > 0 || hasOutput(output)}
      status={output.isError ? "error" : "success"}
    >
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="plan_tracker" detail={action} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Preview>
        <div className="tool-preview-line">
          {done} / {total} complete
        </div>
      </ToolCard.Preview>
      <ToolCard.Content>
        {total > 0 && (
          <ul className="todo-list">
            {tasks.map((task, i) => {
              const t = objectDetails(task)
              const name = typeof t?.name === "string" ? t.name : `Task ${i + 1}`
              const status = typeof t?.status === "string" ? t.status : "unknown"
              return (
                <li key={i} className={`todo todo-${status}`}>
                  <span className="todo-status">{status}</span>
                  <span>{name}</span>
                </li>
              )
            })}
          </ul>
        )}
        <ToolResultContent output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function SubagentTool({
  call,
  output,
  details,
}: {
  call: PiToolCallContent
  output: ToolResult
  details?: unknown
}) {
  const d = objectDetails(details)
  const mode = typeof d?.mode === "string" ? d.mode : undefined
  const outputText = toolResultText(output)
  const head = outputText ? headLines(outputText, 3) : null
  const fields: Array<[string, ReactNode]> = []
  if (typeof call.arguments.agent === "string") fields.push(["agent", call.arguments.agent])
  if (typeof call.arguments.task === "string") fields.push(["task", call.arguments.task])
  if (mode) fields.push(["mode", mode])
  return (
    <ToolCard.Root
      hasContent={fields.length > 0 || hasOutput(output)}
      status={output.isError ? "error" : "success"}
    >
      <ToolCard.Trigger>
        <Header>
          <ToolTitle
            name="subagent"
            detail={mode ?? (call.arguments.agent as string | undefined)}
          />
        </Header>
      </ToolCard.Trigger>
      {head && (
        <ToolCard.Preview>
          <div className="tool-preview-prose">{head.text}</div>
          <MoreHint count={head.remaining} />
        </ToolCard.Preview>
      )}
      <ToolCard.Content>
        {fields.length > 0 && (
          <dl className="tool-fields">
            {fields.map(([k, v]) => (
              <Field key={k} name={k} value={v} />
            ))}
          </dl>
        )}
        {outputText && <div className="tool-output-prose">{outputText}</div>}
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

export function PiTool({
  call,
  output,
  details,
}: {
  call: PiToolCallContent
  output: ToolResult
  details?: unknown
}) {
  switch (call.name) {
    case "bash":
      return <ShellTool call={call} output={output} />
    case "read":
      return <ReadTool call={call} output={output} />
    case "write":
    case "edit":
    case "grep":
    case "find":
    case "ls":
      return <GenericFileTool call={call} output={output} />
    case "plan_tracker":
      return <PlanTrackerTool call={call} output={output} details={details} />
    case "subagent":
      return <SubagentTool call={call} output={output} details={details} />
    default:
      return <UnknownTool name={call.name} input={call.arguments} output={output} />
  }
}
```

- [ ] **Step 4: Run pi tool tests and verify pass**

Run:

```bash
bun test src/transcript/pi/Tool.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit tool rendering**

```bash
git add src/transcript/pi/Tool.tsx src/transcript/pi/Tool.test.tsx
git commit -m "feat(pi): render pi tool cards"
```

---

### Task 6: Render pi entries and transcript

**Files:**

- Create: `src/transcript/pi/EntryView.tsx`
- Create: `src/transcript/pi/PiTranscript.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Create entry renderer**

Create `src/transcript/pi/EntryView.tsx`:

```tsx
import type { ReactNode } from "react"
import type { ToolResult } from "../../types"
import { ImageBlock } from "../ImageBlock"
import { ThinkingBlock } from "../ThinkingBlock"
import { ToolCard } from "../ToolCard"
import { Header, ToolTitle } from "../shared"
import { TextBlock } from "../claude/TextBlock"
import { PiTool } from "./Tool"
import type { PiContent, PiMessageEntry, PiTreeEntry, PiToolResultMessage } from "./types"
import { piImageToSource } from "./types"

const EMPTY_RESULT: ToolResult = { content: [], isError: false }

function isToolResultMessage(message: unknown): message is PiToolResultMessage {
  return (
    !!message &&
    typeof message === "object" &&
    (message as { role?: unknown }).role === "toolResult"
  )
}

function UnknownEntry({ entry }: { entry: PiTreeEntry }) {
  return (
    <ToolCard.Root hasContent>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name={entry.type} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        <pre className="output">{JSON.stringify(entry, null, 2)}</pre>
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function UnknownContent({ block }: { block: unknown }) {
  return (
    <ToolCard.Root hasContent>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="unknown content block" />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        <pre className="output">{JSON.stringify(block, null, 2)}</pre>
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function renderContentBlock(
  block: PiContent,
  index: number,
  role: string,
  results: Map<string, ToolResult & { details?: unknown }>,
): ReactNode {
  if (block.type === "text") return <TextBlock key={index} role={role} text={block.text} />
  if (block.type === "thinking") return <ThinkingBlock key={index} text={block.thinking} />
  if (block.type === "image")
    return <ImageBlock key={index} role={role} source={piImageToSource(block)} />
  if (block.type === "toolCall") {
    const result = results.get(block.id)
    return (
      <PiTool key={index} call={block} output={result ?? EMPTY_RESULT} details={result?.details} />
    )
  }
  return <UnknownContent key={index} block={block} />
}

function MessageEntryView({
  entry,
  results,
}: {
  entry: PiMessageEntry
  results: Map<string, ToolResult & { details?: unknown }>
}) {
  const { message } = entry
  if (message.role === "toolResult") return null

  if (message.role === "user") {
    if (typeof message.content === "string") return <TextBlock role="user" text={message.content} />
    return (
      <>
        {message.content.map((block, i) =>
          renderContentBlock(block as PiContent, i, "user", results),
        )}
      </>
    )
  }

  if (message.role === "assistant") {
    return (
      <>{message.content.map((block, i) => renderContentBlock(block, i, "assistant", results))}</>
    )
  }

  if (message.role === "bashExecution") {
    return <TextBlock role="assistant" text={`$ ${message.command}\n${message.output}`} />
  }

  if (message.role === "custom") {
    if (!message.display) return null
    const content =
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content, null, 2)
    return <TextBlock role="assistant" text={content} />
  }

  if (message.role === "branchSummary") return <TextBlock role="assistant" text={message.summary} />
  if (message.role === "compactionSummary")
    return <TextBlock role="assistant" text={message.summary} />

  if (isToolResultMessage(message)) return null
  return <UnknownEntry entry={entry} />
}

export function PiEntryView({
  entry,
  results,
}: {
  entry: PiTreeEntry
  results: Map<string, ToolResult & { details?: unknown }>
}) {
  if (entry.type === "message") return <MessageEntryView entry={entry} results={results} />
  if (entry.type === "model_change")
    return (
      <div className="pi-meta-row">
        Model:{" "}
        <code>
          {entry.provider}/{entry.modelId}
        </code>
      </div>
    )
  if (entry.type === "thinking_level_change")
    return (
      <div className="pi-meta-row">
        Thinking: <code>{entry.thinkingLevel}</code>
      </div>
    )
  if (entry.type === "branch_summary") return <TextBlock role="assistant" text={entry.summary} />
  if (entry.type === "compaction") return <TextBlock role="assistant" text={entry.summary} />
  if (entry.type === "custom_message") {
    if (!entry.display) return null
    const content =
      typeof entry.content === "string" ? entry.content : JSON.stringify(entry.content, null, 2)
    return <TextBlock role="assistant" text={content} />
  }
  if (entry.type === "session_info")
    return entry.name ? (
      <div className="pi-meta-row">
        Session: <code>{entry.name}</code>
      </div>
    ) : null
  if (entry.type === "label" || entry.type === "custom") return null
  return <UnknownEntry entry={entry} />
}
```

- [ ] **Step 2: Create transcript renderer**

Create `src/transcript/pi/PiTranscript.tsx`:

```tsx
import type { ToolResult } from "../../types"
import { TranscriptHeader } from "../TranscriptHeader"
import { PiEntryView } from "./EntryView"
import { extractPiToolResult } from "./toolResult"
import type { PiParsedSession, PiToolResultMessage } from "./types"

function isPiToolResultMessage(message: unknown): message is PiToolResultMessage {
  return (
    !!message &&
    typeof message === "object" &&
    (message as { role?: unknown }).role === "toolResult"
  )
}

export function PiTranscript({ session }: { session: PiParsedSession }) {
  const results = new Map<string, ToolResult & { details?: unknown }>()
  for (const entry of session.activeEntries) {
    if (entry.type !== "message") continue
    const message = entry.message
    if (!isPiToolResultMessage(message)) continue
    results.set(message.toolCallId, { ...extractPiToolResult(message), details: message.details })
  }

  return (
    <div className="transcript">
      {session.header && <TranscriptHeader startTimestamp={session.header.timestamp} />}
      {session.header && (
        <div className="pi-session-card">
          <div>
            <strong>pi session</strong> <code>{session.header.id}</code>
          </div>
          {session.header.cwd && (
            <div>
              cwd <code>{session.header.cwd}</code>
            </div>
          )}
          {session.header.parentSession && (
            <div>
              parent <code>{session.header.parentSession}</code>
            </div>
          )}
        </div>
      )}
      {session.activeEntries.map((entry) => (
        <PiEntryView key={entry.id} entry={entry} results={results} />
      ))}
      {(session.hiddenBranchEntryCount > 0 || session.orphanedEntryCount > 0) && (
        <div className="pi-branch-footnote">
          {session.hiddenBranchEntryCount > 0 && (
            <span>{session.hiddenBranchEntryCount} entries on other branches are not shown.</span>
          )}
          {session.orphanedEntryCount > 0 && (
            <span>{session.orphanedEntryCount} missing parent link encountered.</span>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add pi metadata styles**

Append to `src/styles.css` near transcript styles:

```css
.pi-session-card,
.pi-branch-footnote,
.pi-meta-row {
  color: var(--color-muted);
  font-size: var(--fs-sm);
}

.pi-session-card {
  align-self: center;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-card);
}

.pi-session-card code,
.pi-meta-row code {
  font-family: var(--font-mono);
}

.pi-meta-row {
  padding: 2px 6px 2px 24px;
}

.pi-branch-footnote {
  align-self: center;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 12px 0;
}
```

- [ ] **Step 4: Run TypeScript check for new files**

Run:

```bash
bun test src/transcript/pi/parse.test.ts src/transcript/pi/toolResult.test.ts src/transcript/pi/Tool.test.tsx
bun run check
```

Expected: tests pass and check reports no TypeScript/lint/format errors. If formatting fails, run `bunx oxfmt --write src/transcript/pi src/styles.css` and rerun `bun run check`.

- [ ] **Step 5: Commit transcript rendering**

```bash
git add src/transcript/pi/EntryView.tsx src/transcript/pi/PiTranscript.tsx src/styles.css
git commit -m "feat(pi): render pi transcript entries"
```

---

### Task 7: Wire pi into app loading and icons

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/FileIcon.tsx`

- [ ] **Step 1: Update app type imports and LoadedSession**

In `src/App.tsx`, add imports:

```ts
import { parsePiEntries } from "./transcript/pi/parse"
import { PiTranscript } from "./transcript/pi/PiTranscript"
import type { PiParsedSession } from "./transcript/pi/types"
```

Change `LoadedSession` to:

```ts
type LoadedSession =
  | { format: "claude"; entries: Entry[] }
  | { format: "codex"; entries: CodexEntry[] }
  | { format: "pi"; session: PiParsedSession }
```

- [ ] **Step 2: Add pi load branch and update error copy**

In `loadText`, after the Codex branch and before Claude, add:

```ts
    } else if (format === "pi") {
      setSession({ format: "pi", session: parsePiEntries(allLines) })
      setDropError(null)
```

Change the unknown error to:

```ts
setDropError(`Couldn't parse ${name} as a Claude Code, OpenAI Codex, or pi JSONL file`)
```

Change drop-zone copy to:

```tsx
Drop a Claude Code, OpenAI Codex, or pi <code>.jsonl</code> here
```

Add pi location hint after Codex hint:

```tsx
              <p className="drop-zone-hint">
                pi stores sessions in <code>~/.pi/agent/sessions/</code>:
              </p>
              <TerminalCommand command="open ~/.pi/agent/sessions/" />
```

Add render branch near existing transcript render branches:

```tsx
{
  session && session.format === "pi" && <PiTranscript session={session.session} />
}
```

- [ ] **Step 3: Update FileIcon format type**

In `src/FileIcon.tsx`, change:

```ts
export type FileIconFormat = "claude" | "codex"
```

to:

```ts
export type FileIconFormat = "claude" | "codex" | "pi"
```

No SVG path change is required; the class `file-icon-pi` is enough for future styling.

- [ ] **Step 4: Run app checks**

Run:

```bash
bun test src/parse/classify.test.ts src/transcript/pi/parse.test.ts src/transcript/pi/toolResult.test.ts src/transcript/pi/Tool.test.tsx
bun run check
```

Expected: tests pass and check passes.

- [ ] **Step 5: Commit app wiring**

```bash
git add src/App.tsx src/FileIcon.tsx
git commit -m "feat(pi): wire pi transcript viewer"
```

---

### Task 8: Add real pi fixture with original filename

**Files:**

- Create: `src/transcript/__fixtures__/<original-pi-session-filename>.jsonl`

- [ ] **Step 1: Select representative real pi trace**

Run:

```bash
ls -lh ~/.pi/agent/sessions/--Users-andrew-Developer-Prefix-jsonl-fyi--/*.jsonl
```

Choose the smallest real trace that includes representative tools. Prefer one with `plan_tracker` or `subagent` if not unreasonably large.

- [ ] **Step 2: Copy fixture preserving original filename**

Use the chosen filename exactly. Example:

```bash
cp ~/.pi/agent/sessions/--Users-andrew-Developer-Prefix-jsonl-fyi--/2026-05-01T19-32-21-877Z_019de507-1cf4-74ae-b5bc-907e992ba866.jsonl \
  src/transcript/__fixtures__/2026-05-01T19-32-21-877Z_019de507-1cf4-74ae-b5bc-907e992ba866.jsonl
```

- [ ] **Step 3: Verify fixture classifies and parses**

Run:

```bash
bun test src/parse/classify.test.ts src/transcript/pi/parse.test.ts
```

Expected: tests still pass. If desired, add one parser test loading this fixture and asserting `header?.id` plus `activeEntries.length > 0`; keep the original fixture unchanged.

- [ ] **Step 4: Commit fixture**

```bash
git add src/transcript/__fixtures__/*.jsonl
git commit -m "test(pi): add real pi session fixture"
```

---

### Task 9: Verify in browser on existing dev server

**Files:**

- No source changes unless verification finds bugs.

- [ ] **Step 1: Confirm dev server is already available**

Run:

```bash
curl -sI http://localhost:3000/ | head
```

Expected: HTTP response from Vite/dev server. Do not start another server.

- [ ] **Step 2: Use agent-browser against port 3000**

Use the `agent-browser` skill. Load:

```text
http://localhost:3000
```

Upload or drag the real pi fixture from `src/transcript/__fixtures__/`.

- [ ] **Step 3: Verify pi UI behavior**

Check the rendered page shows:

- `pi` file icon/class does not crash the header.
- pi session card with session id and cwd.
- active branch entries in readable conversation order.
- `bash`, `read`, `plan_tracker`, and `subagent` cards render if present in the chosen fixture.
- unknown/custom tools render via integrated `UnknownTool` card.
- branch footnote appears only when hidden branch entries are present.
- browser console has no runtime errors.

- [ ] **Step 4: Spot-check existing formats**

Load one existing Claude fixture and one existing Codex fixture from project fixtures/examples.

Expected: both still classify and render as before.

- [ ] **Step 5: Run final checks**

Run:

```bash
bun test
bun run check
```

Expected: all tests and checks pass.

- [ ] **Step 6: Commit verification fixes, if any**

If verification required fixes:

```bash
git add <changed-files>
git commit -m "fix(pi): address viewer verification issues"
```

If no fixes were needed, do not create an empty commit.
