# Codex Transcripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-04-29-codex-transcripts-design.md`
**Corpus reference:** `docs/codex-corpus-stats.md`

**Goal:** Drag-and-drop a Codex `rollout-*.jsonl` file (from `~/.codex/sessions/**`) onto jsonl.fyi and get a faithful transcript view with parity to Claude Code rendering — user/assistant text, reasoning, tool calls (rich for the common ones), tool outputs, plus a session header.

**Architecture:** Auto-classify every dropped file (Codex vs Claude Code) on the first ~10 parsed lines. Route to one of two parallel data models (`Entry` / `CodexEntry`) and two parallel top-level transcript components (`<ClaudeCodeTranscript>` / `<CodexTranscript>`). Both formats share the same low-level building blocks (`ToolCard.*`, `<Header>`, `<ToolTitle>`, `<Field>`, `<Output>`, `<EditDiff>` / `<PatchDiff>`, `<ImageBlock>`, `<ThinkingBlock>`, `<TranscriptHeader>`, `<TurnSeparator>`, shared `<UnknownTool>`). Per-tool components live as siblings under each format's directory; no normalization layer.

**Tech Stack:** React 19, TypeScript (`@typescript/native-preview` via `tsgo`), Bun (`bun:test`), `@pierre/diffs/react` (existing — both `EditDiff` and the not-yet-used `PatchDiff` ship in this lib). No new dependencies.

**UI conventions to follow** (introduced by recent refactor on main):

- Tool headers use `<Header><ToolTitle name="..." detail="..." /></Header>`. No icons, no color props.
- Every `<ToolCard.Root>` passes `status={output.isError ? "error" : "success"}`.
- `ToolResult.isError: boolean` is required on every output (default `false`).

---

## File Structure

**Refactor / rename (Task 1):**

- Move `src/parse.ts` → `src/transcript/claude/parse.ts`
- Move `src/parse.test.ts` → `src/transcript/claude/parse.test.ts`
- Rename `src/transcript/claude/Transcript.tsx` (export name `Transcript`) → `src/transcript/claude/ClaudeCodeTranscript.tsx` (export name `ClaudeCodeTranscript`)
- Update imports in `src/App.tsx`

**Format-agnostic helpers (Tasks 2–4):**

- Create `src/parse/iter.ts` — `iterJsonlLines` generator
- Create `src/parse/iter.test.ts`
- Create `src/parse/classify.ts` — `classifyJsonl`
- Create `src/parse/classify.test.ts`
- Create `scripts/validate-classifier.ts`

**Codex parsing (Tasks 5–7):**

- Create `src/transcript/codex/types.ts`
- Create `src/transcript/codex/parse.ts`
- Create `src/transcript/codex/parse.test.ts`
- Create `src/transcript/codex/v4a.ts`
- Create `src/transcript/codex/v4a.test.ts`

**Shared extraction (Task 8):**

- Modify `src/transcript/shared.tsx` — move `ToolTitle` here from `claude/Tool.tsx`
- Create `src/transcript/UnknownTool.tsx` (extracted from `claude/Tool.tsx`)
- Modify `src/transcript/claude/Tool.tsx` — import `ToolTitle` and `UnknownTool` from shared locations

**Codex tool components (Tasks 9–12):**

- Create `src/transcript/codex/Tool.tsx` — dispatcher + ShellCommand, ExecCommand, Shell components
- Create `src/transcript/codex/ApplyPatch.tsx` (referenced from `Tool.tsx`)
- Modify `src/transcript/codex/Tool.tsx` — add UpdatePlan, ViewImage, WebSearchCall components
- Modify `src/transcript/codex/Tool.tsx` — add SpawnAgent, WaitAgent components

**Codex top-level rendering (Tasks 13–14):**

- Create `src/transcript/codex/EntryView.tsx`
- Create `src/transcript/codex/SessionHeader.tsx`
- Create `src/transcript/codex/CompactedMarker.tsx`
- Modify `src/styles.css` — `.session-header`, `.compacted-marker`, plan/apply-patch helpers
- Create `src/transcript/codex/CodexTranscript.tsx`
- Modify `src/App.tsx` — classification routing

**Verification (Task 15):**

- Run `bun run check`, `bun test`, manual browser test
- Commit any final tweaks

---

## Task 1: Refactor — rename Claude path for symmetry

**Files:**

- Move: `src/parse.ts` → `src/transcript/claude/parse.ts`
- Move: `src/parse.test.ts` → `src/transcript/claude/parse.test.ts`
- Move: `src/transcript/claude/Transcript.tsx` → `src/transcript/claude/ClaudeCodeTranscript.tsx` (rename component too)
- Modify: `src/App.tsx` (imports)

This task is a pure file move + rename. Behavior unchanged.

- [ ] **Step 1: Move `parse.ts` to `claude/parse.ts`**

```bash
git mv src/parse.ts src/transcript/claude/parse.ts
```

- [ ] **Step 2: Move `parse.test.ts` to `claude/parse.test.ts` and fix the fixture import URL**

```bash
git mv src/parse.test.ts src/transcript/claude/parse.test.ts
```

Open `src/transcript/claude/parse.test.ts`. The fixture loader uses `new URL("./__fixtures__/sample.jsonl", import.meta.url)`. After the move, the fixture lives two directories up. Change line ~5 to:

```ts
const text = await Bun.file(new URL("../../__fixtures__/sample.jsonl", import.meta.url)).text()
```

The import on line 2 already says `from "./parse"` — that still resolves correctly (both files are in the same directory now).

- [ ] **Step 3: Rename `Transcript.tsx` to `ClaudeCodeTranscript.tsx` and rename the export**

```bash
git mv src/transcript/claude/Transcript.tsx src/transcript/claude/ClaudeCodeTranscript.tsx
```

Open the renamed file and change the function name on the `export function Transcript({ entries }: ...)` line to `export function ClaudeCodeTranscript({ entries }: ...)`.

- [ ] **Step 4: Update imports in `src/App.tsx`**

Change line 2:

```ts
import { parseJsonl } from "./parse"
```

to:

```ts
import { parseJsonl } from "./transcript/claude/parse"
```

Change line 4:

```ts
import { Transcript } from "./transcript/claude/Transcript"
```

to:

```ts
import { ClaudeCodeTranscript } from "./transcript/claude/ClaudeCodeTranscript"
```

Change line 182:

```tsx
{
  entries && <Transcript entries={entries} />
}
```

to:

```tsx
{
  entries && <ClaudeCodeTranscript entries={entries} />
}
```

- [ ] **Step 5: Search for any leftover references**

Run: `grep -rn 'from "\./parse"\|from "\./transcript/claude/Transcript"\|<Transcript ' src/`

Expected: no results outside fixture content.

- [ ] **Step 6: Type-check + tests**

Run: `bun run check && bun test`

Expected: all green. The fixture-stats inline snapshot in `parse.test.ts` should still match.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: rename Transcript→ClaudeCodeTranscript, move parser into claude/ subdir"
```

---

## Task 2: `iterJsonlLines` generator

Extract the JSONL line-streaming concern into a format-agnostic generator. Both formats can iterate the same source.

**Files:**

- Create: `src/parse/iter.ts`
- Create: `src/parse/iter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/parse/iter.test.ts`:

```ts
import { test, expect } from "bun:test"
import { iterJsonlLines } from "./iter"

test("iterJsonlLines: yields one parsed value per non-empty line", () => {
  const text = ['{"a":1}', '{"b":2}', "", '{"c":3}'].join("\n")
  const out = []
  for (const v of iterJsonlLines(text)) out.push(v)
  expect(out).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }])
})

test("iterJsonlLines: malformed lines are skipped, count exposed via return", () => {
  const text = ['{"a":1}', "not json", "", '{"b":2}'].join("\n")
  const it = iterJsonlLines(text)
  const values = []
  let result = it.next()
  while (!result.done) {
    values.push(result.value)
    result = it.next()
  }
  expect(values).toEqual([{ a: 1 }, { b: 2 }])
  expect(result.value).toEqual({ skipped: 1 })
})

test("iterJsonlLines: empty input yields nothing, skipped=0", () => {
  const it = iterJsonlLines("")
  const result = it.next()
  expect(result.done).toBe(true)
  expect(result.value).toEqual({ skipped: 0 })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/parse/iter.test.ts`

Expected: FAIL with `Cannot find module './iter'`.

- [ ] **Step 3: Implement**

Create `src/parse/iter.ts`:

```ts
export function* iterJsonlLines(text: string): Generator<unknown, { skipped: number }, void> {
  let skipped = 0
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    try {
      yield JSON.parse(line)
    } catch {
      skipped++
    }
  }
  return { skipped }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/parse/iter.test.ts`

Expected: 3 pass, 0 fail.

- [ ] **Step 5: Type-check**

Run: `bun run check`

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/parse/iter.ts src/parse/iter.test.ts
git commit -m "feat: iterJsonlLines generator (format-agnostic)"
```

---

## Task 3: Format classifier

Decide whether a dropped JSONL file is Claude Code, Codex, or unknown — based on the first ~10 parsed lines.

**Files:**

- Create: `src/parse/classify.ts`
- Create: `src/parse/classify.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/parse/classify.test.ts`:

```ts
import { test, expect } from "bun:test"
import { classifyJsonl } from "./classify"

test("classifyJsonl: codex from session_meta", () => {
  const lines = [
    { type: "session_meta", payload: { id: "x", cwd: "/" } },
    { type: "response_item", payload: { type: "message", role: "user", content: [] } },
  ]
  expect(classifyJsonl(lines)).toBe("codex")
})

test("classifyJsonl: codex from response_item alone", () => {
  expect(
    classifyJsonl([{ type: "response_item", payload: { type: "reasoning", summary: [] } }]),
  ).toBe("codex")
})

test("classifyJsonl: codex from turn_context", () => {
  expect(classifyJsonl([{ type: "turn_context", payload: { model: "gpt-5" } }])).toBe("codex")
})

test("classifyJsonl: codex from event_msg", () => {
  expect(
    classifyJsonl([{ type: "event_msg", payload: { type: "agent_message", message: "hi" } }]),
  ).toBe("codex")
})

test("classifyJsonl: claude from user/assistant + content array", () => {
  const lines = [
    { type: "user", uuid: "u1", message: { role: "user", content: "hi" } },
    {
      type: "assistant",
      uuid: "a1",
      message: { role: "assistant", content: [{ type: "text", text: "hello" }] },
    },
  ]
  expect(classifyJsonl(lines)).toBe("claude")
})

test("classifyJsonl: claude from system entries (turn_duration)", () => {
  expect(
    classifyJsonl([
      { type: "system", subtype: "turn_duration", parentUuid: "u1", durationMs: 100 },
    ]),
  ).toBe("claude")
})

test("classifyJsonl: unknown when nothing matches", () => {
  expect(classifyJsonl([{ foo: "bar" }, "string", null, 42])).toBe("unknown")
})

test("classifyJsonl: empty input → unknown", () => {
  expect(classifyJsonl([])).toBe("unknown")
})

test("classifyJsonl: prefers codex when both signals present (defensive)", () => {
  expect(
    classifyJsonl([
      { type: "user", message: { role: "user", content: "hi" } },
      { type: "session_meta", payload: { id: "x" } },
    ]),
  ).toBe("codex")
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/parse/classify.test.ts`

Expected: FAIL with `Cannot find module './classify'`.

- [ ] **Step 3: Implement**

Create `src/parse/classify.ts`:

```ts
const CODEX_TYPES = new Set([
  "session_meta",
  "response_item",
  "turn_context",
  "event_msg",
  "compacted",
])
const CLAUDE_TYPES = new Set(["user", "assistant", "system"])

export type FormatLabel = "claude" | "codex" | "unknown"

export function classifyJsonl(lines: readonly unknown[]): FormatLabel {
  let sawClaude = false
  for (let i = 0; i < lines.length && i < 10; i++) {
    const line = lines[i]
    if (!line || typeof line !== "object") continue
    const t = (line as { type?: unknown }).type
    if (typeof t !== "string") continue
    if (CODEX_TYPES.has(t)) return "codex"
    if (CLAUDE_TYPES.has(t)) sawClaude = true
  }
  return sawClaude ? "claude" : "unknown"
}
```

The order matters: any single Codex-typed line wins over Claude signals. Defensive against malformed mixed files.

- [ ] **Step 4: Run tests**

Run: `bun test src/parse/classify.test.ts`

Expected: 9 pass, 0 fail.

- [ ] **Step 5: Type-check**

Run: `bun run check`

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/parse/classify.ts src/parse/classify.test.ts
git commit -m "feat: classifyJsonl format detector"
```

---

## Task 4: Validation script — exercise classifier on local logs

**Files:**

- Create: `scripts/validate-classifier.ts`

- [ ] **Step 1: Implement**

Create `scripts/validate-classifier.ts`:

```ts
#!/usr/bin/env bun
import { Glob } from "bun"
import { iterJsonlLines } from "../src/parse/iter"
import { classifyJsonl } from "../src/parse/classify"
import { homedir } from "os"

type Result = {
  path: string
  label: ReturnType<typeof classifyJsonl>
  expected: "claude" | "codex"
}

async function* walk(
  root: string,
  pattern: string,
  expected: "claude" | "codex",
): AsyncGenerator<Result> {
  const glob = new Glob(pattern)
  for await (const path of glob.scan({ cwd: root, absolute: true, onlyFiles: true })) {
    const text = await Bun.file(path).text()
    const headLines: unknown[] = []
    for (const v of iterJsonlLines(text)) {
      headLines.push(v)
      if (headLines.length >= 10) break
    }
    yield { path, label: classifyJsonl(headLines), expected }
  }
}

const home = homedir()
const counts = { claude: 0, codex: 0, unknown: 0, mismatch: 0 }
const mismatches: Result[] = []

for await (const r of walk(`${home}/.claude/projects`, "**/*.jsonl", "claude")) {
  counts[r.label]++
  if (r.label !== r.expected) {
    counts.mismatch++
    mismatches.push(r)
  }
}
for await (const r of walk(`${home}/.codex/sessions`, "**/rollout-*.jsonl", "codex")) {
  counts[r.label]++
  if (r.label !== r.expected) {
    counts.mismatch++
    mismatches.push(r)
  }
}

console.log("counts:", counts)
if (mismatches.length > 0) {
  console.log("\nmismatches (first 10):")
  for (const m of mismatches.slice(0, 10)) {
    console.log(`  ${m.label} (expected ${m.expected})  ${m.path}`)
  }
  process.exit(1)
}
console.log("\nall files classified as expected ✓")
```

- [ ] **Step 2: Run the script**

Run: `bun scripts/validate-classifier.ts`

Expected: prints counts; `unknown` is 0 (or near-zero — investigate any hits); `mismatch` is 0; exits 0.

If there are mismatches, examine the first few — usually they're truncated or empty files. Adjust the classifier only if there's a real wire-format case the heuristic missed; otherwise add file-emptiness handling at the script level (skip 0-byte files).

- [ ] **Step 3: Commit**

```bash
git add scripts/validate-classifier.ts
git commit -m "chore: validate-classifier script for local Claude+Codex logs"
```

---

## Task 5: Codex types

Define the `CodexEntry` discriminated union mirroring the wire shape.

**Files:**

- Create: `src/transcript/codex/types.ts`

- [ ] **Step 1: Implement**

Create `src/transcript/codex/types.ts`:

```ts
// Wire-shape types for OpenAI Codex rollout-*.jsonl files.
// See docs/codex-corpus-stats.md for prevalence and observed shapes.

export type CodexInputText = { type: "input_text"; text: string }
export type CodexOutputText = { type: "output_text"; text: string }
export type CodexInputImage = { type: "input_image"; image_url: string }
export type CodexContentItem = CodexInputText | CodexOutputText | CodexInputImage

export type CodexReasoningSummary = { type: "summary_text"; text: string }

export type CodexResponseItemPayload =
  | { type: "message"; role: "user" | "assistant"; content: CodexContentItem[] }
  | {
      type: "reasoning"
      summary: CodexReasoningSummary[]
      content?: unknown
      encrypted_content?: string
    }
  | { type: "function_call"; name: string; arguments: string; call_id: string }
  | { type: "function_call_output"; call_id: string; output: string }
  | { type: "custom_tool_call"; name: string; input: string; call_id: string; status?: string }
  | { type: "custom_tool_call_output"; call_id: string; output: string }
  | { type: "ghost_snapshot"; ghost_commit: { id: string; parent: string } }
  | {
      type: "web_search_call"
      status?: string
      action?: { type: "search"; query?: string; queries?: string[] }
    }

export type CodexResponseItem = {
  type: "response_item"
  timestamp?: string
  payload: CodexResponseItemPayload
}

export type CodexSessionMeta = {
  type: "session_meta"
  payload: {
    id: string
    timestamp?: string
    cwd?: string
    originator?: string
    cli_version?: string
    source?: string
    model_provider?: string
    git?: { commit_hash?: string; branch?: string; repository_url?: string } | null
  }
}

export type CodexTurnContext = {
  type: "turn_context"
  payload: {
    cwd?: string
    model?: string
    effort?: string
    sandbox_policy?: unknown
    approval_policy?: string
    summary?: string
  }
}

export type CodexCompacted = {
  type: "compacted"
  payload: { message?: unknown; replacement_history?: unknown }
}

// `event_msg` lines exist in the wire format but we drop them — see spec §4.
export type CodexEventMsg = { type: "event_msg"; payload: unknown }

export type CodexEntry = CodexSessionMeta | CodexTurnContext | CodexResponseItem | CodexCompacted
```

- [ ] **Step 2: Type-check**

Run: `bun run check`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/transcript/codex/types.ts
git commit -m "feat: Codex wire-shape types"
```

---

## Task 6: Codex parser

Convert iterated raw line objects (from `iterJsonlLines`) into a typed `CodexEntry[]`. Drop `event_msg` lines (spec §4). Be liberal: unknown payload subtypes flow through, malformed rows are dropped silently.

**Files:**

- Create: `src/transcript/codex/parse.ts`
- Create: `src/transcript/codex/parse.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/transcript/codex/parse.test.ts`:

```ts
import { test, expect } from "bun:test"
import { parseCodexEntries } from "./parse"

test("parseCodexEntries: keeps known top-level types, drops event_msg", () => {
  const lines: unknown[] = [
    { type: "session_meta", payload: { id: "abc", cwd: "/x" } },
    { type: "turn_context", payload: { model: "gpt-5.2-codex", cwd: "/x" } },
    { type: "event_msg", payload: { type: "agent_message", message: "hi" } },
    {
      type: "response_item",
      timestamp: "2026-01-01T00:00:00Z",
      payload: { type: "message", role: "user", content: [{ type: "input_text", text: "yo" }] },
    },
    {
      type: "response_item",
      payload: {
        type: "reasoning",
        summary: [{ type: "summary_text", text: "thinking..." }],
        encrypted_content: "...",
      },
    },
    {
      type: "response_item",
      payload: {
        type: "function_call",
        name: "shell_command",
        arguments: '{"command":"ls"}',
        call_id: "c1",
      },
    },
    { type: "compacted", payload: { message: null, replacement_history: null } },
  ]
  const entries = parseCodexEntries(lines)
  expect(entries.map((e) => e.type)).toEqual([
    "session_meta",
    "turn_context",
    "response_item",
    "response_item",
    "response_item",
    "compacted",
  ])
})

test("parseCodexEntries: skips unknown top-level types and malformed objects", () => {
  const lines: unknown[] = [
    { type: "session_meta", payload: { id: "x" } },
    { type: "totally_unknown", payload: {} },
    null,
    "not an object",
    { no_type_field: true },
    { type: "response_item", payload: { type: "message", role: "user", content: [] } },
  ]
  expect(parseCodexEntries(lines).map((e) => e.type)).toEqual(["session_meta", "response_item"])
})

test("parseCodexEntries: drops response_item lines whose payload is malformed", () => {
  const lines: unknown[] = [
    { type: "response_item", payload: null },
    { type: "response_item", payload: { type: "unknown_subtype" } },
    { type: "response_item", payload: { type: "message", role: "user", content: [] } },
  ]
  // Unknown subtypes pass through; only payloads missing the discriminator are dropped.
  expect(parseCodexEntries(lines).length).toBe(2)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/transcript/codex/parse.test.ts`

Expected: FAIL with `Cannot find module './parse'`.

- [ ] **Step 3: Implement**

Create `src/transcript/codex/parse.ts`:

```ts
import type { CodexEntry } from "./types"

const KEEP_TYPES = new Set(["session_meta", "turn_context", "response_item", "compacted"])

export function parseCodexEntries(lines: Iterable<unknown>): CodexEntry[] {
  const out: CodexEntry[] = []
  for (const line of lines) {
    if (!line || typeof line !== "object") continue
    const t = (line as { type?: unknown }).type
    if (typeof t !== "string" || !KEEP_TYPES.has(t)) continue
    if (t === "response_item") {
      const payload = (line as { payload?: unknown }).payload
      if (!payload || typeof payload !== "object") continue
      const subtype = (payload as { type?: unknown }).type
      if (typeof subtype !== "string") continue
    }
    out.push(line as CodexEntry)
  }
  return out
}
```

- [ ] **Step 4: Run tests**

Run: `bun test src/transcript/codex/parse.test.ts`

Expected: 3 pass, 0 fail.

- [ ] **Step 5: Type-check**

Run: `bun run check`

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/transcript/codex/parse.ts src/transcript/codex/parse.test.ts
git commit -m "feat: Codex JSONL parser"
```

---

## Task 7: V4A patch parser

Parse OpenAI's V4A patch format (used by `apply_patch`) into per-file unified-diff strings that can be fed to `<PatchDiff>` from `@pierre/diffs/react`.

V4A grammar (see spec §6 V4A parser):

```
*** Begin Patch
*** Update File: /path
[*** Move to: /newpath]
@@ [optional anchor]
 context line
-removed
+added
@@ next hunk
...
*** Add File: /path
+line 1
+line 2
*** Delete File: /path
*** End of File   ← optional, ignored
*** End Patch
```

**Files:**

- Create: `src/transcript/codex/v4a.ts`
- Create: `src/transcript/codex/v4a.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/transcript/codex/v4a.test.ts`:

```ts
import { test, expect } from "bun:test"
import { parseV4A } from "./v4a"

test("parseV4A: single-file Update with one hunk", () => {
  const patch = [
    "*** Begin Patch",
    "*** Update File: /a/b.json",
    "@@",
    '-  "name": "old",',
    '+  "name": "new",',
    "*** End Patch",
  ].join("\n")
  const result = parseV4A(patch)
  expect("error" in result).toBe(false)
  if ("error" in result) return
  expect(result.files).toHaveLength(1)
  const f = result.files[0]
  expect(f.op).toBe("update")
  expect(f.path).toBe("/a/b.json")
  expect((f as { unifiedDiff: string }).unifiedDiff).toMatchInlineSnapshot()
})

test("parseV4A: Update with context and multiple hunks", () => {
  const patch = [
    "*** Begin Patch",
    "*** Update File: /x.py",
    "@@",
    " def foo():",
    "-    return 1",
    "+    return 2",
    "@@",
    " def bar():",
    "-    pass",
    "+    return 3",
    "*** End Patch",
  ].join("\n")
  const result = parseV4A(patch)
  expect("error" in result).toBe(false)
  if ("error" in result) return
  expect(result.files).toHaveLength(1)
  expect((result.files[0] as { unifiedDiff: string }).unifiedDiff).toMatchInlineSnapshot()
})

test("parseV4A: Add File", () => {
  const patch = [
    "*** Begin Patch",
    "*** Add File: /new.txt",
    "+line one",
    "+line two",
    "*** End Patch",
  ].join("\n")
  const result = parseV4A(patch)
  expect("error" in result).toBe(false)
  if ("error" in result) return
  expect(result.files[0].op).toBe("add")
  expect(result.files[0].path).toBe("/new.txt")
  expect((result.files[0] as { unifiedDiff: string }).unifiedDiff).toMatchInlineSnapshot()
})

test("parseV4A: Delete File (no body)", () => {
  const patch = ["*** Begin Patch", "*** Delete File: /gone.txt", "*** End Patch"].join("\n")
  const result = parseV4A(patch)
  expect("error" in result).toBe(false)
  if ("error" in result) return
  expect(result.files).toEqual([{ op: "delete", path: "/gone.txt" }])
})

test("parseV4A: Move (Update with rename)", () => {
  const patch = [
    "*** Begin Patch",
    "*** Update File: /old.txt",
    "*** Move to: /new.txt",
    "@@",
    "-old",
    "+new",
    "*** End Patch",
  ].join("\n")
  const result = parseV4A(patch)
  expect("error" in result).toBe(false)
  if ("error" in result) return
  expect(result.files[0].op).toBe("update")
  expect((result.files[0] as { movedTo?: string }).movedTo).toBe("/new.txt")
})

test("parseV4A: hunk anchor lines (e.g. '@@ class Foo') are accepted and dropped", () => {
  const patch = [
    "*** Begin Patch",
    "*** Update File: /x.py",
    "@@ class Foo",
    "-    return 1",
    "+    return 2",
    "*** End Patch",
  ].join("\n")
  const result = parseV4A(patch)
  expect("error" in result).toBe(false)
  if ("error" in result) return
  expect((result.files[0] as { unifiedDiff: string }).unifiedDiff).toContain("@@ -1,1 +1,1 @@")
})

test("parseV4A: multiple files in one patch", () => {
  const patch = [
    "*** Begin Patch",
    "*** Update File: /a.txt",
    "@@",
    "-old",
    "+new",
    "*** Add File: /b.txt",
    "+content",
    "*** End Patch",
  ].join("\n")
  const result = parseV4A(patch)
  expect("error" in result).toBe(false)
  if ("error" in result) return
  expect(result.files.map((f) => f.op)).toEqual(["update", "add"])
})

test("parseV4A: malformed patch (missing Begin Patch)", () => {
  const patch = "*** Update File: /x\n@@\n-a\n+b\n*** End Patch"
  const result = parseV4A(patch)
  expect("error" in result).toBe(true)
})

test("parseV4A: malformed patch (Update with no @@)", () => {
  const patch = "*** Begin Patch\n*** Update File: /x\n*** End Patch"
  const result = parseV4A(patch)
  expect("error" in result).toBe(true)
})

test("parseV4A: tolerates *** End of File marker inside an Update", () => {
  const patch = [
    "*** Begin Patch",
    "*** Update File: /x.txt",
    "@@",
    "-old",
    "+new",
    "*** End of File",
    "*** End Patch",
  ].join("\n")
  const result = parseV4A(patch)
  expect("error" in result).toBe(false)
})
```

(`toMatchInlineSnapshot()` calls without arguments are recorded by `bun test -u` in step 4.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/transcript/codex/v4a.test.ts`

Expected: FAIL with `Cannot find module './v4a'`.

- [ ] **Step 3: Implement**

Create `src/transcript/codex/v4a.ts`:

```ts
export type V4AFile =
  | { op: "add"; path: string; unifiedDiff: string }
  | { op: "update"; path: string; movedTo?: string; unifiedDiff: string }
  | { op: "delete"; path: string }

export type V4AResult = { files: V4AFile[] } | { error: string; raw: string }

const BEGIN = "*** Begin Patch"
const END = "*** End Patch"

export function parseV4A(input: string): V4AResult {
  const lines = input.split("\n")
  if (lines[0]?.trim() !== BEGIN) {
    return { error: "missing *** Begin Patch", raw: input }
  }
  let i = 1
  const files: V4AFile[] = []

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === END) {
      i++
      break
    }
    const m = /^\*\*\* (Add File|Update File|Delete File): (.+)$/.exec(line)
    if (!m) {
      if (line.trim() === "") {
        i++
        continue
      }
      return { error: `unexpected line: ${line}`, raw: input }
    }
    const op = m[1]
    const path = m[2]
    i++

    if (op === "Delete File") {
      files.push({ op: "delete", path })
      continue
    }

    if (op === "Add File") {
      const body: string[] = []
      while (i < lines.length && !lines[i].startsWith("*** ")) {
        const ln = lines[i]
        if (ln.startsWith("+")) body.push(ln.slice(1))
        i++
      }
      const unified = buildUnifiedDiff(path, "add", [{ context: [], removed: [], added: body }])
      files.push({ op: "add", path, unifiedDiff: unified })
      continue
    }

    // Update File
    let movedTo: string | undefined
    if (lines[i] && /^\*\*\* Move to: /.test(lines[i])) {
      movedTo = lines[i].replace(/^\*\*\* Move to: /, "")
      i++
    }
    const hunks: { context: string[]; removed: string[]; added: string[] }[] = []
    if (!lines[i] || !/^@@/.test(lines[i])) {
      return { error: `Update File without @@ hunk: ${path}`, raw: input }
    }
    while (i < lines.length && /^@@/.test(lines[i])) {
      i++ // skip the @@ line (anchor text after @@ is dropped intentionally)
      const hunk = { context: [] as string[], removed: [] as string[], added: [] as string[] }
      while (i < lines.length && !/^@@/.test(lines[i]) && !lines[i].startsWith("*** ")) {
        const ln = lines[i]
        if (ln.startsWith(" ")) hunk.context.push(ln.slice(1))
        else if (ln.startsWith("-")) hunk.removed.push(ln.slice(1))
        else if (ln.startsWith("+")) hunk.added.push(ln.slice(1))
        i++
      }
      hunks.push(hunk)
      if (lines[i] === "*** End of File") i++
    }
    files.push({
      op: "update",
      path,
      movedTo,
      unifiedDiff: buildUnifiedDiff(path, "update", hunks),
    })
  }

  return { files }
}

function buildUnifiedDiff(
  path: string,
  op: "add" | "update",
  hunks: { context: string[]; removed: string[]; added: string[] }[],
): string {
  const fromHeader = op === "add" ? "/dev/null" : `a/${path}`
  const toHeader = `b/${path}`
  const out: string[] = [`--- ${fromHeader}`, `+++ ${toHeader}`]
  for (const h of hunks) {
    const fromCount = h.context.length + h.removed.length
    const toCount = h.context.length + h.added.length
    out.push(`@@ -1,${fromCount} +1,${toCount} @@`)
    // Reconstruct: context first, then removed, then added. Original
    // interleaving inside a hunk isn't preserved; for *display* this is fine.
    for (const c of h.context) out.push(` ${c}`)
    for (const r of h.removed) out.push(`-${r}`)
    for (const a of h.added) out.push(`+${a}`)
  }
  return out.join("\n") + "\n"
}
```

- [ ] **Step 4: Record snapshots and run tests**

Run: `bun test src/transcript/codex/v4a.test.ts -u` once to capture inline snapshots, then `bun test src/transcript/codex/v4a.test.ts` to verify.

Expected: 10 pass, 0 fail. Manually inspect the recorded `unifiedDiff` snapshots — they should look like reasonable unified diffs.

If any recorded snapshot looks visibly broken, fix the parser, not the snapshot.

- [ ] **Step 5: Type-check**

Run: `bun run check`

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/transcript/codex/v4a.ts src/transcript/codex/v4a.test.ts
git commit -m "feat: V4A patch parser → unified-diff strings"
```

---

## Task 8: Extract `ToolTitle` and `UnknownTool` to shared

`ToolTitle` is currently a private helper in `claude/Tool.tsx`. `UnknownTool` is also private. Both will be reused by Codex tool components.

**Files:**

- Modify: `src/transcript/shared.tsx` — add `ToolTitle` export
- Create: `src/transcript/UnknownTool.tsx`
- Modify: `src/transcript/claude/Tool.tsx` — remove private copies, import from shared

- [ ] **Step 1: Add `ToolTitle` to `shared.tsx`**

Open `src/transcript/shared.tsx`. Add this export at the bottom of the file (after `hasOutput`):

```tsx
export function ToolTitle({ name, detail }: { name: string; detail?: ReactNode }) {
  return (
    <>
      <strong className="tool-title-name">{name}</strong>
      {detail != null && (
        <>
          (<span>{detail}</span>)
        </>
      )}
    </>
  )
}
```

- [ ] **Step 2: Create `src/transcript/UnknownTool.tsx`**

```tsx
import type { ToolResult } from "../types"
import { ToolCard } from "./ToolCard"
import { Header, Field, Output, Extras, ToolTitle, hasOutput } from "./shared"

export function UnknownTool({
  name,
  input,
  output,
}: {
  name: string
  input: Record<string, unknown>
  output: ToolResult
}) {
  const keys = Object.keys(input)
  const hasContent = keys.length > 0 || hasOutput(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name={name} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {keys.length > 0 && (
          <dl className="tool-fields">
            {keys.map((k) => {
              const v = input[k]
              return (
                <Field
                  key={k}
                  name={k}
                  value={typeof v === "string" ? v : JSON.stringify(v, null, 2)}
                />
              )
            })}
          </dl>
        )}
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}
```

- [ ] **Step 3: Remove the private `ToolTitle` and `UnknownTool` from `claude/Tool.tsx` and import the shared versions**

Open `src/transcript/claude/Tool.tsx`.

a) Delete the private `function ToolTitle({...}) { ... }` definition (lines ~41–60 — the helper between the imports and `Bash`).

b) Delete the private `function UnknownTool({...}) { ... }` definition (lines ~580–616 — the section labelled `// MCP / unknown — we don't have a typed shape, so render raw fields.`).

c) Update the imports at the top of the file. Change the import block:

```tsx
import {
  assertExhaustive,
  Header,
  Field,
  Output,
  Extras,
  hasOutput,
  type CardProps,
} from "../shared"
```

to:

```tsx
import {
  assertExhaustive,
  Header,
  Field,
  Output,
  Extras,
  ToolTitle,
  hasOutput,
  type CardProps,
} from "../shared"
import { UnknownTool } from "../UnknownTool"
```

d) Update the dispatcher's call site. Currently:

```tsx
if (!isKnownToolUse(use)) {
  return <UnknownTool use={use} output={output} />
}
```

The shared component takes `{name, input, output}`. Change to:

```tsx
if (!isKnownToolUse(use)) {
  return <UnknownTool name={use.name} input={use.input} output={output} />
}
```

- [ ] **Step 4: Type-check**

Run: `bun run check`

Expected: no errors.

- [ ] **Step 5: Run tests**

Run: `bun test`

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/transcript/shared.tsx src/transcript/UnknownTool.tsx src/transcript/claude/Tool.tsx
git commit -m "refactor: extract ToolTitle and UnknownTool to shared for cross-format reuse"
```

---

## Task 9: Codex Tool dispatcher + shell-family components

Build the Codex tool dispatcher and the three shell-family components (`ShellCommand`, `ExecCommand`, `Shell`). `apply_patch` comes in Task 10.

Codex tool components follow the Claude pattern: `<ToolCard.Root status=...>` → `<ToolCard.Trigger>` with `<Header><ToolTitle name=... detail=... /></Header>` → `<ToolCard.Content>` with the command in `<pre>`, other args as `<Field>`, then `<Output>`.

**Files:**

- Create: `src/transcript/codex/Tool.tsx`

- [ ] **Step 1: Implement (dispatcher + shell-family + helpers)**

Create `src/transcript/codex/Tool.tsx`:

```tsx
import type { ReactNode } from "react"
import type { ToolResult } from "../../types"
import { ToolCard } from "../ToolCard"
import { Header, Field, Output, ToolTitle, hasOutput } from "../shared"
import { UnknownTool } from "../UnknownTool"

// Helper: extract exit code from a Codex shell-tool output. Used to derive
// `isError` for the tool result and (optionally) for header decoration.
export function extractExitCode(raw: string): number | null {
  const m = /^Exit code: (\d+)/m.exec(raw)
  return m ? Number(m[1]) : null
}

// ---------------------------------------------------------------------------
// Shell-family components
// ---------------------------------------------------------------------------

type ShellCommandInput = {
  command?: string
  workdir?: string
  timeout_ms?: number
  login?: boolean
  sandbox_permissions?: unknown
  justification?: string
}

function ShellCommand({ input, output }: { input: ShellCommandInput; output: ToolResult }) {
  const { command, workdir, timeout_ms, login, sandbox_permissions, justification } = input
  const fields: Array<[string, ReactNode]> = []
  if (workdir) fields.push(["workdir", workdir])
  if (timeout_ms != null) fields.push(["timeout_ms", `${timeout_ms}`])
  if (login != null) fields.push(["login", String(login)])
  if (sandbox_permissions) fields.push(["sandbox_permissions", JSON.stringify(sandbox_permissions)])
  if (justification) fields.push(["justification", justification])
  const hasContent = !!command || fields.length > 0 || hasOutput(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="shell_command" detail={command} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {command && <pre className="output cmd">{command}</pre>}
        {fields.length > 0 && (
          <dl className="tool-fields">
            {fields.map(([k, v]) => (
              <Field key={k} name={k} value={v} />
            ))}
          </dl>
        )}
        <Output output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

type ExecCommandInput = {
  cmd?: string
  workdir?: string
  tty?: boolean
  yield_time_ms?: number
  max_output_tokens?: number
  prefix_rule?: unknown
  sandbox_permissions?: unknown
  justification?: string
}

function ExecCommand({ input, output }: { input: ExecCommandInput; output: ToolResult }) {
  const {
    cmd,
    workdir,
    tty,
    yield_time_ms,
    max_output_tokens,
    prefix_rule,
    sandbox_permissions,
    justification,
  } = input
  const fields: Array<[string, ReactNode]> = []
  if (workdir) fields.push(["workdir", workdir])
  if (tty != null) fields.push(["tty", String(tty)])
  if (yield_time_ms != null) fields.push(["yield_time_ms", `${yield_time_ms}`])
  if (max_output_tokens != null) fields.push(["max_output_tokens", `${max_output_tokens}`])
  if (prefix_rule) fields.push(["prefix_rule", JSON.stringify(prefix_rule)])
  if (sandbox_permissions) fields.push(["sandbox_permissions", JSON.stringify(sandbox_permissions)])
  if (justification) fields.push(["justification", justification])
  const hasContent = !!cmd || fields.length > 0 || hasOutput(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="exec_command" detail={cmd} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {cmd && <pre className="output cmd">{cmd}</pre>}
        {fields.length > 0 && (
          <dl className="tool-fields">
            {fields.map(([k, v]) => (
              <Field key={k} name={k} value={v} />
            ))}
          </dl>
        )}
        <Output output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

type ShellInput = {
  command?: string[]
  workdir?: string
  timeout_ms?: number
  with_escalated_permissions?: boolean
  justification?: string
}

function Shell({ input, output }: { input: ShellInput; output: ToolResult }) {
  const { command, workdir, timeout_ms, with_escalated_permissions, justification } = input
  const joined = Array.isArray(command) ? command.join(" ") : ""
  const fields: Array<[string, ReactNode]> = []
  if (workdir) fields.push(["workdir", workdir])
  if (timeout_ms != null) fields.push(["timeout_ms", `${timeout_ms}`])
  if (with_escalated_permissions) fields.push(["with_escalated_permissions", "true"])
  if (justification) fields.push(["justification", justification])
  const hasContent = !!joined || fields.length > 0 || hasOutput(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="shell" detail={joined} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {joined && <pre className="output cmd">{joined}</pre>}
        {fields.length > 0 && (
          <dl className="tool-fields">
            {fields.map(([k, v]) => (
              <Field key={k} name={k} value={v} />
            ))}
          </dl>
        )}
        <Output output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

// ---------------------------------------------------------------------------
// Dispatchers — Tasks 10–12 will add more cases.
// ---------------------------------------------------------------------------

export function CodexFunctionCall({
  name,
  argumentsJson,
  output,
}: {
  name: string
  argumentsJson: string
  output: ToolResult
}) {
  let parsed: Record<string, unknown> = {}
  try {
    const v = JSON.parse(argumentsJson)
    if (v && typeof v === "object") parsed = v as Record<string, unknown>
  } catch {
    parsed = { _raw: argumentsJson }
  }

  switch (name) {
    case "shell_command":
      return <ShellCommand input={parsed as ShellCommandInput} output={output} />
    case "exec_command":
      return <ExecCommand input={parsed as ExecCommandInput} output={output} />
    case "shell":
      return <Shell input={parsed as ShellInput} output={output} />
    default:
      return <UnknownTool name={name} input={parsed} output={output} />
  }
}

export function CodexCustomToolCall({
  name,
  input,
  output,
}: {
  name: string
  input: string
  output: ToolResult
}) {
  // Task 10 will add ApplyPatch handling. For now, fall through.
  return <UnknownTool name={name} input={{ _raw: input }} output={output} />
}
```

- [ ] **Step 2: Type-check**

Run: `bun run check`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/transcript/codex/Tool.tsx
git commit -m "feat: Codex Tool dispatcher with shell-family components"
```

---

## Task 10: ApplyPatch component

Wire V4A parser to `<PatchDiff>`. Replace the placeholder `CodexCustomToolCall` body in `Tool.tsx`.

**Files:**

- Create: `src/transcript/codex/ApplyPatch.tsx`
- Modify: `src/transcript/codex/Tool.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Create the component**

Create `src/transcript/codex/ApplyPatch.tsx`:

```tsx
import { PatchDiff } from "@pierre/diffs/react"
import type { ToolResult } from "../../types"
import { ToolCard } from "../ToolCard"
import { Header, Field, ToolTitle } from "../shared"
import { parseV4A } from "./v4a"

export function ApplyPatch({ patch, output }: { patch: string; output: ToolResult }) {
  const parsed = parseV4A(patch)
  const fileCount = "files" in parsed ? parsed.files.length : 0
  const detail =
    fileCount === 0
      ? undefined
      : fileCount === 1
        ? shortFile(parsed.files[0].path)
        : `${fileCount} files`

  // Output may be JSON-wrapped: {"output":"...","metadata":{"exit_code", "duration_seconds"}}.
  const meta = tryParsePatchOutput(output.text)

  return (
    <ToolCard.Root hasContent={true} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="apply_patch" detail={detail} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {"error" in parsed ? (
          <pre className="output">{patch}</pre>
        ) : (
          <div className="apply-patch-files">
            {parsed.files.map((f, i) => {
              if (f.op === "delete") {
                return (
                  <div key={i} className="apply-patch-deleted">
                    Deleted: <code>{f.path}</code>
                  </div>
                )
              }
              return (
                <div key={i} className="apply-patch-file">
                  {f.op === "update" && f.movedTo && (
                    <div className="apply-patch-rename">
                      Renamed: <code>{f.path}</code> → <code>{f.movedTo}</code>
                    </div>
                  )}
                  <PatchDiff
                    patch={f.unifiedDiff}
                    options={{
                      diffStyle: "unified",
                      diffIndicators: "classic",
                    }}
                    disableWorkerPool
                  />
                </div>
              )
            })}
          </div>
        )}
        {(meta.exitCode != null || meta.duration != null) && (
          <dl className="tool-fields">
            {meta.exitCode != null && <Field name="exit_code" value={`${meta.exitCode}`} />}
            {meta.duration != null && <Field name="duration_seconds" value={`${meta.duration}`} />}
          </dl>
        )}
        {meta.text && <pre className="output">{meta.text}</pre>}
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function shortFile(path: string): string {
  const parts = path.split("/")
  return parts.length > 2 ? `.../${parts.slice(-2).join("/")}` : path
}

function tryParsePatchOutput(raw: string): {
  text: string
  exitCode: number | null
  duration: number | null
} {
  if (!raw) return { text: "", exitCode: null, duration: null }
  try {
    const v = JSON.parse(raw) as { output?: unknown; metadata?: unknown }
    if (v && typeof v === "object") {
      const text = typeof v.output === "string" ? v.output : raw
      const meta =
        v.metadata && typeof v.metadata === "object" ? (v.metadata as Record<string, unknown>) : {}
      const exitCode = typeof meta.exit_code === "number" ? meta.exit_code : null
      const duration = typeof meta.duration_seconds === "number" ? meta.duration_seconds : null
      return { text, exitCode, duration }
    }
  } catch {
    // not JSON — fall through
  }
  return { text: raw, exitCode: null, duration: null }
}
```

- [ ] **Step 2: Wire ApplyPatch into the dispatcher**

Open `src/transcript/codex/Tool.tsx`. Add the import near the top:

```tsx
import { ApplyPatch } from "./ApplyPatch"
```

Replace the `CodexCustomToolCall` body:

```tsx
export function CodexCustomToolCall({
  name,
  input,
  output,
}: {
  name: string
  input: string
  output: ToolResult
}) {
  switch (name) {
    case "apply_patch":
      return <ApplyPatch patch={input} output={output} />
    default:
      return <UnknownTool name={name} input={{ _raw: input }} output={output} />
  }
}
```

- [ ] **Step 3: Add CSS**

Append to `src/styles.css`:

```css
.apply-patch-files {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.apply-patch-deleted,
.apply-patch-rename {
  font-size: var(--fs-sm);
  color: var(--muted);
}
.apply-patch-rename code,
.apply-patch-deleted code {
  font-family: inherit;
}
```

- [ ] **Step 4: Type-check**

Run: `bun run check`

Expected: no errors. If `PatchDiff`'s `options` type complains about a field, drop the offending field — the renderer's defaults are fine.

- [ ] **Step 5: Commit**

```bash
git add src/transcript/codex/ApplyPatch.tsx src/transcript/codex/Tool.tsx src/styles.css
git commit -m "feat: ApplyPatch component (V4A → PatchDiff per file)"
```

---

## Task 11: UpdatePlan, ViewImage, WebSearchCall components

`UpdatePlan` and `ViewImage` are dispatched through `CodexFunctionCall`. `WebSearchCall` is dispatched at the `response_item.payload.type` level (Task 13's EntryView), not the function-call dispatcher — but defining it here keeps all Codex tool-component code in one file.

**Files:**

- Modify: `src/transcript/codex/Tool.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add the components**

Open `src/transcript/codex/Tool.tsx`. Add the import for `ImageBlock`:

```tsx
import { ImageBlock } from "../ImageBlock"
```

Add these components after the shell-family ones (before the dispatchers):

```tsx
type UpdatePlanInput = {
  explanation?: string
  plan?: { step: string; status: "pending" | "in_progress" | "completed" }[]
}

function UpdatePlan({ input, output }: { input: UpdatePlanInput; output: ToolResult }) {
  const { explanation, plan } = input
  const hasContent = !!explanation || (plan && plan.length > 0) || hasOutput(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="update_plan" detail={explanation} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {plan && plan.length > 0 && (
          <ul className="todo-list">
            {plan.map((p, i) => (
              <li key={i} className={`todo todo-${p.status}`}>
                <span className="todo-status">{p.status}</span>
                <span>{p.step}</span>
              </li>
            ))}
          </ul>
        )}
        <Output output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

type ViewImageInput = { path?: string }

function ViewImage({ input, output }: { input: ViewImageInput; output: ToolResult }) {
  const { path } = input
  const basename = path ? path.split("/").pop() : ""
  // Output may contain [{"type":"input_image","image_url":"data:..."}].
  // If so, render the image inline. Otherwise render the raw output.
  const embeddedImage = tryParseEmbeddedImage(output.text)
  return (
    <ToolCard.Root hasContent={true} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="view_image" detail={basename} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {path && (
          <dl className="tool-fields">
            <Field name="path" value={path} />
          </dl>
        )}
        {embeddedImage ? <ImageBlock source={embeddedImage} /> : <Output output={output} />}
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function tryParseEmbeddedImage(raw: string): { type: "url"; url: string } | null {
  if (!raw || !raw.startsWith("[")) return null
  try {
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return null
    for (const item of arr) {
      if (
        item &&
        typeof item === "object" &&
        (item as { type?: unknown }).type === "input_image" &&
        typeof (item as { image_url?: unknown }).image_url === "string"
      ) {
        return { type: "url", url: (item as { image_url: string }).image_url }
      }
    }
  } catch {
    /* not json — fall through */
  }
  return null
}

type WebSearchCallProps = {
  query?: string
  queries?: string[]
  status?: string
}

export function WebSearchCall({ query, queries, status }: WebSearchCallProps) {
  const extra = queries && queries.length > 1 ? queries.filter((q) => q !== query) : []
  const hasContent = extra.length > 0 || !!status
  return (
    <ToolCard.Root hasContent={hasContent} status="success">
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="web_search" detail={query} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {extra.length > 0 && (
          <dl className="tool-fields">
            {extra.map((q, i) => (
              <Field key={i} name={`query ${i + 1}`} value={q} />
            ))}
          </dl>
        )}
        {status && (
          <dl className="tool-fields">
            <Field name="status" value={status} />
          </dl>
        )}
      </ToolCard.Content>
    </ToolCard.Root>
  )
}
```

- [ ] **Step 2: Update the `CodexFunctionCall` switch**

```tsx
case "shell_command":
  return <ShellCommand input={parsed as ShellCommandInput} output={output} />
case "exec_command":
  return <ExecCommand input={parsed as ExecCommandInput} output={output} />
case "shell":
  return <Shell input={parsed as ShellInput} output={output} />
case "update_plan":
  return <UpdatePlan input={parsed as UpdatePlanInput} output={output} />
case "view_image":
  return <ViewImage input={parsed as ViewImageInput} output={output} />
default:
  return <UnknownTool name={name} input={parsed} output={output} />
```

- [ ] **Step 3: Type-check**

Run: `bun run check`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/transcript/codex/Tool.tsx
git commit -m "feat: UpdatePlan, ViewImage, WebSearchCall components"
```

---

## Task 12: SpawnAgent, WaitAgent components

**Files:**

- Modify: `src/transcript/codex/Tool.tsx`

- [ ] **Step 1: Add components**

Open `src/transcript/codex/Tool.tsx`. Add these components alongside the others:

```tsx
type SpawnAgentInput = {
  agent_type?: string
  fork_context?: boolean
  model?: string
  reasoning_effort?: string
  message?: string
}

function SpawnAgent({ input, output }: { input: SpawnAgentInput; output: ToolResult }) {
  const { agent_type, fork_context, model, reasoning_effort, message } = input
  const fields: Array<[string, ReactNode]> = []
  if (agent_type) fields.push(["agent_type", agent_type])
  if (model) fields.push(["model", model])
  if (reasoning_effort) fields.push(["reasoning_effort", reasoning_effort])
  if (fork_context != null) fields.push(["fork_context", String(fork_context)])
  // Output is JSON: {"agent_id":"...","nickname":"..."}; surface those fields.
  const meta = tryParseAgentSpawnOutput(output.text)
  if (meta.nickname) fields.push(["nickname", meta.nickname])
  if (meta.agentId) fields.push(["agent_id", meta.agentId])
  return (
    <ToolCard.Root hasContent={true} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="spawn_agent" detail={agent_type} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {message && <pre className="output">{message}</pre>}
        {fields.length > 0 && (
          <dl className="tool-fields">
            {fields.map(([k, v]) => (
              <Field key={k} name={k} value={v} />
            ))}
          </dl>
        )}
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function tryParseAgentSpawnOutput(raw: string): { nickname?: string; agentId?: string } {
  if (!raw || !raw.startsWith("{")) return {}
  try {
    const v = JSON.parse(raw) as { agent_id?: unknown; nickname?: unknown }
    return {
      nickname: typeof v.nickname === "string" ? v.nickname : undefined,
      agentId: typeof v.agent_id === "string" ? v.agent_id : undefined,
    }
  } catch {
    return {}
  }
}

type WaitAgentInput = { targets?: string[]; timeout_ms?: number }

function WaitAgent({ input, output }: { input: WaitAgentInput; output: ToolResult }) {
  const { targets, timeout_ms } = input
  const fields: Array<[string, ReactNode]> = []
  if (targets && targets.length > 0) fields.push(["targets", targets.join(", ")])
  if (timeout_ms != null) fields.push(["timeout_ms", `${timeout_ms}`])
  return (
    <ToolCard.Root hasContent={true} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="wait_agent" />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {fields.length > 0 && (
          <dl className="tool-fields">
            {fields.map(([k, v]) => (
              <Field key={k} name={k} value={v} />
            ))}
          </dl>
        )}
        <Output output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}
```

- [ ] **Step 2: Update the `CodexFunctionCall` switch**

```tsx
case "spawn_agent":
  return <SpawnAgent input={parsed as SpawnAgentInput} output={output} />
case "wait_agent":
  return <WaitAgent input={parsed as WaitAgentInput} output={output} />
```

- [ ] **Step 3: Type-check**

Run: `bun run check`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/transcript/codex/Tool.tsx
git commit -m "feat: SpawnAgent, WaitAgent components"
```

---

## Task 13: Codex EntryView + SessionHeader + CompactedMarker

**Files:**

- Create: `src/transcript/codex/EntryView.tsx`
- Create: `src/transcript/codex/SessionHeader.tsx`
- Create: `src/transcript/codex/CompactedMarker.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Create `SessionHeader`**

Create `src/transcript/codex/SessionHeader.tsx`:

```tsx
import type { CodexSessionMeta } from "./types"

export function SessionHeader({ meta }: { meta: CodexSessionMeta }) {
  const m = meta.payload
  const branch = m.git?.branch
  const sha = m.git?.commit_hash?.slice(0, 7)
  const repo = m.git?.repository_url
  const cwd = m.cwd ? shortPath(m.cwd) : null
  const cli = m.cli_version ? `${m.originator ?? "codex"} ${m.cli_version}` : m.originator

  return (
    <div className="session-header">
      <div className="session-header-row">
        {branch && <span className="session-branch">{branch}</span>}
        {sha && <span className="session-sha">{sha}</span>}
        {cli && <span className="session-cli">{cli}</span>}
      </div>
      {repo && <div className="session-repo">{repo}</div>}
      {cwd && <div className="session-cwd">{cwd}</div>}
    </div>
  )
}

function shortPath(p: string): string {
  const parts = p.split("/")
  return parts.length > 4 ? `.../${parts.slice(-3).join("/")}` : p
}
```

- [ ] **Step 2: Create `CompactedMarker`**

Create `src/transcript/codex/CompactedMarker.tsx`:

```tsx
export function CompactedMarker() {
  return (
    <div className="compacted-marker" aria-label="Conversation compacted">
      Conversation compacted
    </div>
  )
}
```

- [ ] **Step 3: Create `EntryView`**

Create `src/transcript/codex/EntryView.tsx`:

```tsx
import type { ReactNode } from "react"
import type { CodexResponseItem } from "./types"
import { ThinkingBlock } from "../ThinkingBlock"
import { ImageBlock } from "../ImageBlock"
import { CodexFunctionCall, CodexCustomToolCall, WebSearchCall } from "./Tool"
import type { ToolResult } from "../../types"

const EMPTY_RESULT: ToolResult = { text: "", images: [], toolRefs: [], isError: false }

type Props = {
  entry: CodexResponseItem
  results: Map<string, ToolResult>
}

export function EntryView({ entry, results }: Props) {
  const p = entry.payload

  switch (p.type) {
    case "message": {
      // Hide harness-injected environment_context blocks.
      const isEnvContext =
        p.role === "user" &&
        p.content[0]?.type === "input_text" &&
        p.content[0].text.startsWith("<environment_context>")
      if (isEnvContext) return null
      const role = p.role
      const nodes: ReactNode[] = []
      p.content.forEach((c, i) => {
        if (c.type === "input_text" || c.type === "output_text") {
          nodes.push(<MessageText key={i} role={role} text={c.text} />)
        } else if (c.type === "input_image") {
          nodes.push(<ImageBlock key={i} source={{ type: "url", url: c.image_url }} role={role} />)
        }
      })
      return <>{nodes}</>
    }

    case "reasoning": {
      const text = p.summary.map((s) => s.text).join("\n\n")
      return text ? <ThinkingBlock text={text} /> : null
    }

    case "function_call": {
      const out = results.get(p.call_id) ?? EMPTY_RESULT
      return <CodexFunctionCall name={p.name} argumentsJson={p.arguments} output={out} />
    }

    case "custom_tool_call": {
      const out = results.get(p.call_id) ?? EMPTY_RESULT
      return <CodexCustomToolCall name={p.name} input={p.input} output={out} />
    }

    case "function_call_output":
    case "custom_tool_call_output":
      // Already attached to its call via the results map. Skip.
      return null

    case "web_search_call":
      return <WebSearchCall status={p.status} query={p.action?.query} queries={p.action?.queries} />

    case "ghost_snapshot":
      // Not rendered in v1 — see spec §13.
      return null

    default: {
      // Forward-compat: unknown response_item subtypes are silently dropped.
      const _exhaustive: never = p
      void _exhaustive
      return null
    }
  }
}

function MessageText({ role, text }: { role: "user" | "assistant"; text: string }) {
  return (
    <div className={`message message-${role}`}>
      <pre className="message-text">{text}</pre>
    </div>
  )
}
```

- [ ] **Step 4: Add CSS**

Append to `src/styles.css`:

```css
.session-header {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
  margin: 12px 0 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--fs-sm);
  color: var(--muted);
}
.session-header-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.session-branch {
  font-weight: 600;
  color: var(--text);
}
.session-sha {
  font-family: var(--font-mono, monospace);
  background: var(--code-bg, rgba(127, 127, 127, 0.1));
  padding: 1px 6px;
  border-radius: 4px;
}
.session-cli {
  margin-left: auto;
}
.session-repo,
.session-cwd {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  word-break: break-all;
}

.compacted-marker {
  text-align: center;
  font-size: 11px;
  color: var(--muted);
  padding: 12px 0;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.message {
  margin: 8px 0;
}
.message-text {
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}
```

- [ ] **Step 5: Type-check**

Run: `bun run check`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/transcript/codex/EntryView.tsx src/transcript/codex/SessionHeader.tsx src/transcript/codex/CompactedMarker.tsx src/styles.css
git commit -m "feat: Codex EntryView, SessionHeader, CompactedMarker"
```

---

## Task 14: `CodexTranscript` top-level + App routing

Tie it together. The pre-pass derives `isError` from output text — it's true when:

- `function_call_output.output` matches `/^Exit code: ([1-9]\d*)/m`, OR
- `custom_tool_call_output.output` is JSON-wrapped with `metadata.exit_code != 0`

**Files:**

- Create: `src/transcript/codex/CodexTranscript.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `CodexTranscript`**

Create `src/transcript/codex/CodexTranscript.tsx`:

```tsx
import type { CodexEntry } from "./types"
import type { ToolResult } from "../../types"
import { EntryView } from "./EntryView"
import { SessionHeader } from "./SessionHeader"
import { CompactedMarker } from "./CompactedMarker"

function deriveIsError(output: string, kind: "function" | "custom"): boolean {
  if (!output) return false
  if (kind === "function") {
    const m = /^Exit code: (\d+)/m.exec(output)
    if (m && Number(m[1]) !== 0) return true
    return false
  }
  // custom_tool_call_output: try to parse JSON-wrapped metadata.
  if (output.startsWith("{")) {
    try {
      const v = JSON.parse(output) as { metadata?: unknown }
      const meta =
        v.metadata && typeof v.metadata === "object"
          ? (v.metadata as Record<string, unknown>)
          : null
      if (meta && typeof meta.exit_code === "number" && meta.exit_code !== 0) return true
    } catch {
      /* not json — fall through */
    }
  }
  return false
}

export function CodexTranscript({ entries }: { entries: CodexEntry[] }) {
  // Pre-pass: index tool outputs by call_id with derived isError.
  const results = new Map<string, ToolResult>()
  for (const entry of entries) {
    if (entry.type !== "response_item") continue
    const p = entry.payload
    if (p.type === "function_call_output") {
      results.set(p.call_id, {
        text: p.output,
        images: [],
        toolRefs: [],
        isError: deriveIsError(p.output, "function"),
      })
    } else if (p.type === "custom_tool_call_output") {
      results.set(p.call_id, {
        text: p.output,
        images: [],
        toolRefs: [],
        isError: deriveIsError(p.output, "custom"),
      })
    }
  }

  // Find session_meta (typically the first line).
  const meta = entries.find((e) => e.type === "session_meta")

  return (
    <div className="transcript">
      {meta && meta.type === "session_meta" && <SessionHeader meta={meta} />}
      {entries.map((entry, i) => {
        if (entry.type === "session_meta") return null
        if (entry.type === "turn_context") return null
        if (entry.type === "compacted") return <CompactedMarker key={`comp-${i}`} />
        // entry.type === "response_item"
        return <EntryView key={i} entry={entry} results={results} />
      })}
    </div>
  )
}
```

- [ ] **Step 2: Wire routing into `App.tsx`**

Open `src/App.tsx`. Replace the parse/transcript imports near the top:

```tsx
import { parseJsonl } from "./transcript/claude/parse"
import { ClaudeCodeTranscript } from "./transcript/claude/ClaudeCodeTranscript"
```

with:

```tsx
import { iterJsonlLines } from "./parse/iter"
import { classifyJsonl } from "./parse/classify"
import { parseJsonl } from "./transcript/claude/parse"
import { parseCodexEntries } from "./transcript/codex/parse"
import { ClaudeCodeTranscript } from "./transcript/claude/ClaudeCodeTranscript"
import { CodexTranscript } from "./transcript/codex/CodexTranscript"
import type { CodexEntry } from "./transcript/codex/types"
```

Replace the `entries` state with a discriminated session:

```tsx
type LoadedSession =
  | { format: "claude"; entries: Entry[] }
  | { format: "codex"; entries: CodexEntry[] }
const [session, setSession] = useState<LoadedSession | null>(null)
```

Replace the body of `loadText` with:

```tsx
function loadText(text: string, name: string, persist = true) {
  const allLines: unknown[] = []
  const it = iterJsonlLines(text)
  let result = it.next()
  while (!result.done) {
    allLines.push(result.value)
    result = it.next()
  }
  const skippedCount = result.value.skipped

  const format = classifyJsonl(allLines.slice(0, 10))
  if (format === "codex") {
    setSession({ format: "codex", entries: parseCodexEntries(allLines) })
  } else if (format === "claude") {
    // parseJsonl re-parses the text; small overhead, fine for now.
    const r = parseJsonl(text)
    setSession({ format: "claude", entries: r.entries })
  } else {
    setSession(null)
  }
  setFileName(name)
  setSkipped(skippedCount)
  if (persist) {
    try {
      if (text.length < STORAGE_LIMIT_BYTES) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ name, text }))
      } else {
        sessionStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      // sessionStorage may throw (quota, disabled). Non-fatal.
    }
  }
}
```

Update remaining `entries` references in the file:

- `setEntries(null)` (in `reset`) → `setSession(null)`
- `{entries ? (` (around line 115) → `{session ? (`
- `{!entries && (` (around line 143) → `{!session && (`
- `{entries && <Transcript entries={entries} />}` (around line 182) → see below

Replace the render call:

```tsx
{
  session && session.format === "codex" && <CodexTranscript entries={session.entries} />
}
{
  session && session.format === "claude" && <ClaudeCodeTranscript entries={session.entries} />
}
```

Update the drop-zone copy:

```tsx
Drop a Claude Code or OpenAI Codex <code>.jsonl</code> here
```

Add a paragraph below the existing path-hint paragraph:

```tsx
<p className="drop-zone-hint">
  Codex stores sessions at{" "}
  <code>~/.codex/sessions/&lt;YYYY&gt;/&lt;MM&gt;/&lt;DD&gt;/rollout-*.jsonl</code>
</p>
```

- [ ] **Step 3: Type-check**

Run: `bun run check`

Expected: no errors. Fix any leftover `entries` references that still refer to the deleted state.

- [ ] **Step 4: Run tests**

Run: `bun test`

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/transcript/codex/CodexTranscript.tsx src/App.tsx
git commit -m "feat: CodexTranscript + App.tsx classification routing"
```

---

## Task 15: Manual browser verification

**Files:** none (verify-only, with potential follow-up commits if issues found)

- [ ] **Step 1: Confirm dev server**

`curl -sI http://localhost:3000/` should return 200. If not, ask the user to start `bun index.html`. Do NOT start a second instance.

- [ ] **Step 2: Drop a real Codex log**

Pick a recent file:

```bash
ls -1t ~/.codex/sessions/2026/04/*/rollout-*.jsonl | head -3
```

In the browser, click the drop zone and select one (or drag it in).

Verify:

- Session header appears at the top: branch, short sha, cwd, codex version
- User and assistant messages render
- Reasoning blocks render as collapsible thinking blocks
- `apply_patch` calls show inline file diffs (not raw text)
- `shell_command` / `exec_command` calls show command in trigger and full output when expanded
- Failed shell commands (Exit code != 0) render with the error status styling
- `update_plan` calls render as a TODO-style list
- `view_image` calls show the basename and path; if the harness embedded an image, it renders inline
- No console errors

- [ ] **Step 3: Drop a Claude Code log**

Drop any file from `~/.claude/projects/**/*.jsonl`. Verify the existing Claude rendering still works — no regressions from the rename.

- [ ] **Step 4: Drop a corrupted/unknown file**

Drag in any random text file. Confirm graceful handling — no crash.

- [ ] **Step 5: Run full check + tests one more time**

```bash
bun run check
bun test
bun scripts/validate-classifier.ts
```

Expected: all green.

- [ ] **Step 6: Final commit if any tweaks were needed**

If verification surfaced issues, fix and commit as normal small commits.

---

## Done

When all tasks land:

- jsonl.fyi auto-detects Codex vs Claude Code on file drop
- Codex transcripts render with rich tool components
- Apply-patch shows inline per-file diffs via `<PatchDiff>`
- Session header surfaces branch / cwd / version
- Compacted-event markers render inline
- Existing Claude rendering is unchanged (now reachable via `<ClaudeCodeTranscript>`)
- Validation script confirms classification across all local logs
- Corpus stats doc captures the format conventions for future work

Future follow-ups (out of scope per spec):

- Per-format model display (TODO filed; treatment undecided)
- Token usage display (separate cross-format spec)
- Markdown rendering for assistant text
- Sub-agent transcript linking across files
- Compaction history surfacing
