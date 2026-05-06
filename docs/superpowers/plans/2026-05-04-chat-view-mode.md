# Chat View Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Chat" view mode that collapses consecutive tool calls in a single assistant message/turn into one summary row, with structured diffs peeking out inline.

**Spec:** `docs/superpowers/specs/2026-05-04-chat-view-mode-design.md`

## Architecture (per spec §Architecture)

- **Pure preprocessor functions per format** produce `RenderItem[]`. The `tool_group` variant carries plain data only — no `ReactNode`. UI assembly happens at the render layer.
- **Shared `ToolDiff` data type** (`src/transcript/grouping.ts`) — format-agnostic vocabulary for inline diffs:
  ```ts
  type ToolDiff =
    | { kind: "edit"; filePath: string; oldString: string; newString: string }
    | { kind: "patch"; filePath: string; patch: string; op: "add" | "update" | "delete" }
  ```
  Each `ToolDiff` is one file-level diff. A Claude `MultiEdit` with N edits → N edit ToolDiffs (same `filePath`). A Codex `apply_patch` over N files → N patch ToolDiffs (each its own `filePath`).
- **Per-tool diff ownership.** Each tool in a group carries `diffs: ToolDiff[]` (0..N). The collapsed inline peek is a render-time flatten across `tools[]`; the expanded view renders each tool's card via existing components (which include their own diffs), so per-tool association survives expansion.
- **Existing inline pre-passes fold into the preprocessors**: Claude (`results` + skill body absorption), Codex (`results` + agentNicknames + durations + usages + modelLabels), Pi (`results`).
- **Diff-producing tools by format**:
  - Claude `Edit`/`MultiEdit` → `kind: "edit"`. `Write` keeps existing rendering (no inline diff in v1).
  - Codex `apply_patch` → `kind: "patch"` (parsed via `parseV4A`).
  - Pi `edit` → `kind: "edit"`. **Pi `edit` Normal-mode rendering is also upgraded** from `GenericFileTool` to a new `PiEditTool` using `EditDiff` (small Normal-mode improvement bundled with this work; user-authorized). Pi `write` keeps existing rendering.
- **Aggregate status**: `success | error | mixed`. `mixed` = a new `.tool-card-mixed` CSS class with a 50/50 linear-gradient bullet.

## Cross-format type contract

Each format declares its own `RenderItem` union with structurally-identical `tool_group`:

```ts
// src/transcript/claude (in timing.ts)
type ClaudeToolGroup = {
  kind: "tool_group"
  tools: Array<{
    name: string
    status: "success" | "error"
    diffs: ToolDiff[]
    block: ToolUseBlock
  }>
}

// src/transcript/codex/buildCodexItems.ts
type CodexToolGroup = {
  kind: "tool_group"
  tools: Array<{
    name: string
    status: "success" | "error"
    diffs: ToolDiff[]
    entry: CodexResponseItem
  }>
}

// src/transcript/pi/buildPiItems.ts
type PiToolGroup = {
  kind: "tool_group"
  tools: Array<{
    name: string
    status: "success" | "error"
    diffs: ToolDiff[]
    call: PiToolCallContent
  }>
}
```

`ToolGroupRow` is generic over the per-format source-data type:

```tsx
type Props<T> = {
  tools: Array<{ name: string; status: "success" | "error"; diffs: ToolDiff[]; data: T }>
  renderDiff: (diff: ToolDiff) => ReactNode
  renderCard: (data: T) => ReactNode
}
```

Each format provides a thin wrapper (`ClaudeToolGroupRow`, `CodexToolGroupRow`, `PiToolGroupRow`) that closes over `renderCard`. `renderDiff` is a single shared helper exported from `grouping.tsx` (since it's pure-React rendering and identical across formats).

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/settings.tsx` | Modify | Add `"chat"` to `ViewMode` |
| `src/SettingsPopover.tsx` | Modify | Add "Chat" option |
| `src/transcript/ToolCard.tsx` | Modify | Treat `"chat"` like `"normal"` for collapsed body |
| `src/transcript/grouping.ts` | **Create** | `ToolDiff` data type (no JSX) |
| `src/transcript/grouping.tsx` | **Create** | Shared `renderToolDiff` helper + `ToolGroupRow` |
| `src/styles.css` | Modify | `.tool-group*` classes; `.tool-card-mixed` gradient bullet |
| `src/transcript/timing.ts` | Modify | Extend `RenderItem` with `tool_group`; fold Claude pre-passes; emit groups |
| `src/transcript/claude/ClaudeCodeTranscript.tsx` | Modify | Thin renderer over extended `buildTranscriptItems` |
| `src/transcript/claude/ClaudeToolGroupRow.tsx` | **Create** | Format wrapper that closes over `Tool` for `renderCard` |
| `src/transcript/codex/buildCodexItems.ts` | **Create** | Pure preprocessor: pre-passes + grouping |
| `src/transcript/codex/CodexTranscript.tsx` | Modify | Thin renderer |
| `src/transcript/codex/CodexToolGroupRow.tsx` | **Create** | Format wrapper |
| `src/transcript/pi/PiEditTool.tsx` | **Create** | Pi-specific Edit renderer using `EditDiff` (Normal + Chat) |
| `src/transcript/pi/Tool.tsx` | Modify | Route `name === "edit"` to `PiEditTool` |
| `src/transcript/pi/buildPiItems.ts` | **Create** | Pure preprocessor |
| `src/transcript/pi/PiTranscript.tsx` | Modify | Thin renderer |
| `src/transcript/pi/EntryView.tsx` | Modify | Honor `skipBlocks` to suppress grouped tool calls |
| `src/transcript/pi/PiToolGroupRow.tsx` | **Create** | Format wrapper |
| `src/transcript/grouping.test.ts` | **Create** | `ToolDiff` + `renderToolDiff` tests |
| `src/transcript/timing.test.ts` | Modify | Claude grouping data assertions |
| `src/transcript/codex/buildCodexItems.test.ts` | **Create** | Codex grouping data assertions |
| `src/transcript/pi/buildPiItems.test.ts` | **Create** | Pi grouping data assertions |
| `src/transcript/pi/PiEditTool.test.tsx` | **Create** | Pi edit rendering tests |
| `src/transcript/grouping.test.tsx` | **Create** | `ToolGroupRow` + `renderToolDiff` rendering tests |

---

## Pre-implementation: fixture audit

- [ ] **Step 1: Identify fixtures with consecutive tool calls per format**

```bash
cd /Users/andrew/Developer/Prefix/jsonl-fyi
ls src/__fixtures__ src/transcript/__fixtures__
```

Required:
- Claude: assistant message with 2+ consecutive `tool_use` blocks, including ≥1 `Edit` or `MultiEdit`.
- Codex: 2+ consecutive `function_call`/`custom_tool_call` items in a turn, including ≥1 `apply_patch`.
- Pi: assistant message with 2+ consecutive `toolCall` blocks, including ≥1 `edit`.

Pi `edit` argument shape (confirmed from `src/__fixtures__/019de00a-…jsonl`): `{ path: string, edits: Array<{ oldText: string, newText: string }> }`.

If a fixture lacks a 2+ consecutive run for any format, copy the closest one and edit by hand. Commit the fixture before code work.

Record fixture paths:
- Claude: `___________________________`
- Codex: `___________________________`
- Pi:    `___________________________`

- [ ] **Step 2: Capture Normal/Compact baselines (regression gate)**

Start dev server (port 3000 in main workspace per CLAUDE.md). For each format and each baseline fixture:
1. Drag in fixture, set Normal mode.
2. Save `document.querySelector('.transcript').outerHTML` → `/tmp/baseline-{format}-normal.html`.
3. Save full-page screenshot → `/tmp/baseline-{format}-normal.png`.
4. Repeat for Compact mode.

**Pi caveat:** Pi `edit` Normal-mode rendering changes intentionally in Task 6. Capture pi baselines for documentation but enforce regression only for Claude and Codex. Pi diffs are allowed only inside elements rendering `edit` calls.

---

## Task 1 — Settings: add "chat" to ViewMode

**Files:** `src/settings.tsx`, `src/SettingsPopover.tsx`

- [ ] **Step 1:** In `src/settings.tsx`:
  ```ts
  export type ViewMode = "compact" | "normal" | "chat"
  ```

- [ ] **Step 2:** In `src/SettingsPopover.tsx`, after the "Compact" option:
  ```tsx
  <option value="chat">Chat</option>
  ```
  Final order: Normal, Compact, Chat.

- [ ] **Step 3:** Type-check.
  ```bash
  cd /Users/andrew/Developer/Prefix/jsonl-fyi && bun run tsc --noEmit
  ```

- [ ] **Step 4:** Commit.
  ```bash
  git add src/settings.tsx src/SettingsPopover.tsx
  git commit -m "feat: add chat view mode to settings"
  ```

---

## Task 2 — Shared `ToolDiff` + `renderToolDiff` + `ToolGroupRow` + CSS

**Files:** `src/transcript/grouping.ts` (new, data only), `src/transcript/grouping.tsx` (new, JSX helpers + component), `src/styles.css`

- [ ] **Step 1:** Create `src/transcript/grouping.ts`:

```ts
// src/transcript/grouping.ts — pure data, no React.
export type ToolDiff =
  | { kind: "edit"; filePath: string; oldString: string; newString: string }
  | {
      kind: "patch"
      filePath: string
      patch: string                  // unified-diff text for this single file
      op: "add" | "update" | "delete"
    }
```

- [ ] **Step 2:** Create `src/transcript/grouping.tsx`:

```tsx
// src/transcript/grouping.tsx — JSX helpers + presentational component.
import { useState, type ReactNode } from "react"
import { EditDiff } from "./EditDiff"
import { PatchDiff } from "@pierre/diffs/react"
import type { ToolDiff } from "./grouping"

export function renderToolDiff(diff: ToolDiff): ReactNode {
  if (diff.kind === "edit") {
    return (
      <EditDiff
        filePath={diff.filePath}
        oldString={diff.oldString}
        newString={diff.newString}
      />
    )
  }
  return (
    <PatchDiff
      patch={diff.patch}
      options={{
        diffStyle: "unified",
        diffIndicators: "classic",
        disableFileHeader: true,
        disableLineNumbers: true,
      }}
      disableWorkerPool
    />
  )
}

export function aggregateStatus(
  statuses: Array<"success" | "error">,
): "success" | "error" | "mixed" {
  const hasErr = statuses.includes("error")
  const hasOk = statuses.includes("success")
  return hasErr && hasOk ? "mixed" : hasErr ? "error" : "success"
}

type Props<T> = {
  tools: Array<{
    name: string
    status: "success" | "error"
    diffs: ToolDiff[]
    data: T
  }>
  renderCard: (data: T) => ReactNode
}

export function ToolGroupRow<T>({ tools, renderCard }: Props<T>) {
  const [expanded, setExpanded] = useState(false)
  const count = tools.length
  const label = `${count} ${count === 1 ? "tool call" : "tool calls"}`
  const list = tools.map((t) => t.name).join(" · ")
  const status = aggregateStatus(tools.map((t) => t.status))
  const statusClass =
    status === "mixed"
      ? "tool-card-mixed"
      : status === "error"
        ? "tool-card-error"
        : "tool-card-success"

  const flatDiffs = tools.flatMap((t) => t.diffs)

  return (
    <div className={`tool-group ${statusClass}`}>
      <button
        type="button"
        className="tool-row clickable tool-group-row"
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="tool-title">
          <strong className="tool-title-name">{label}</strong>
          <span className="tool-title-paren"> — </span>
          <span className="tool-title-detail">{list}</span>
        </span>
      </button>

      {!expanded && flatDiffs.length > 0 && (
        <div className="tool-group-diffs">
          {flatDiffs.map((d, i) => (
            <div key={i} className="tool-group-diff">
              <div className="tool-group-diff-file">{d.filePath}</div>
              {renderToolDiff(d)}
            </div>
          ))}
        </div>
      )}

      {expanded && (
        <div className="tool-group-expanded">
          {tools.map((t, i) => (
            <div key={i}>{renderCard(t.data)}</div>
          ))}
        </div>
      )}
    </div>
  )
}
```

Note: when expanded, the inline peek hides because each tool's card already renders its own diff.

- [ ] **Step 3:** Append CSS to `src/styles.css`:

```css
/* ── Chat mode tool group ── */

.tool-group {
  display: flex;
  flex-direction: column;
}

.tool-group-row {
  background: none;
  border: 0;
  padding: 0;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.tool-group-row:hover {
  background: var(--color-card);
}

.tool-group-diffs {
  margin: 0 0 4px calc(var(--bullet-size) + var(--bullet-gap));
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tool-group-diff-file {
  color: var(--color-muted);
  font-size: var(--fs-sm);
  padding: 2px 0 0;
}

.tool-group-expanded {
  display: flex;
  flex-direction: column;
}

/* Mixed-status bullet: half success / half error */
.tool-card-mixed .tool-row::before {
  background: linear-gradient(
    90deg,
    var(--color-success) 0 50%,
    var(--color-error) 50% 100%
  );
}
```

- [ ] **Step 4:** Confirm CSS variables `--bullet-size`, `--bullet-gap`, `--color-success`, `--color-error` exist in `:root` (already present).

- [ ] **Step 5:** Type-check.

```bash
cd /Users/andrew/Developer/Prefix/jsonl-fyi && bun run tsc --noEmit
```

- [ ] **Step 6:** Commit.

```bash
git add src/transcript/grouping.ts src/transcript/grouping.tsx src/styles.css
git commit -m "feat: add ToolDiff data type, ToolGroupRow component, chat-mode styles"
```

---

## Task 3 — ToolCard: treat "chat" like "normal"

**File:** `src/transcript/ToolCard.tsx`

- [ ] **Step 1:** Locate the `body` assignment near line 56. Change:
  ```ts
  else if (viewMode === "normal") body = preview
  ```
  to:
  ```ts
  else if (viewMode === "normal" || viewMode === "chat") body = preview
  ```

- [ ] **Step 2:** Type-check + commit.
  ```bash
  cd /Users/andrew/Developer/Prefix/jsonl-fyi && bun run tsc --noEmit
  git add src/transcript/ToolCard.tsx
  git commit -m "fix: treat chat view mode like normal in ToolCard body rendering"
  ```

---

## Task 4 — Claude: extend `timing.ts` with pre-passes + grouping

**Files:** `src/transcript/timing.ts`, `src/transcript/claude/ClaudeCodeTranscript.tsx`, `src/transcript/claude/ClaudeToolGroupRow.tsx` (new)

- [ ] **Step 1:** Extend `timing.ts` types

Imports (additions): `getBlocks`, `extractResult`, `narrowToolUse`, `detectSkill`, `ToolUseBlock`, `ToolRefsById`, `ToolDiff` (from `../grouping`), `ViewMode`.

Add to `RenderItem`:
```ts
| { kind: "tool_group"; tools: ClaudeToolGroupTool[] }

export type ClaudeToolGroupTool = {
  name: string
  status: "success" | "error"
  diffs: ToolDiff[]
  block: ToolUseBlock
}
```

New return type:
```ts
export type BuildResult = {
  items: RenderItem[]
  models: ModelDisplay[]
  results: Map<string, ToolResult>
  toolRefsById: ToolRefsById
  skipKeys: Set<string>
}
```

New signature:
```ts
export function buildTranscriptItems(
  entries: Entry[],
  opts: { viewMode: ViewMode },
): BuildResult
```

- [ ] **Step 2:** Lift the two pre-passes verbatim from `ClaudeCodeTranscript.tsx` into `buildTranscriptItems` (positioned before the existing emit loop):
  - Pass A: `results` + `toolRefsById` (current lines 30–43).
  - Pass B: skill body absorption, producing `skipKeys` (current lines 50–76).

- [ ] **Step 3:** Add diff-extraction helpers:

```ts
function extractClaudeDiffs(block: ToolUseBlock): ToolDiff[] {
  const use = narrowToolUse(block)
  if (use.name === "Edit") {
    const inp = use.input
    if (!inp.old_string && !inp.new_string) return []
    return [{
      kind: "edit",
      filePath: inp.file_path,
      oldString: inp.old_string ?? "",
      newString: inp.new_string ?? "",
    }]
  }
  if (use.name === "MultiEdit") {
    const inp = use.input
    return inp.edits.map((ed) => ({
      kind: "edit" as const,
      filePath: inp.file_path,
      oldString: ed.old_string ?? "",
      newString: ed.new_string ?? "",
    }))
  }
  return []
}
```

- [ ] **Step 4:** Add chat-mode group emission in the existing emit loop. After pushing `{ kind: "entry", entry }` for an assistant `MessageEntry`:

```ts
if (opts.viewMode === "chat" && entry.type === "assistant") {
  const blocks = getBlocks(entry)
  let j = 0
  while (j < blocks.length) {
    if (skipKeys.has(`${entry.uuid}:${j}`)) { j++; continue }
    if (blocks[j].type !== "tool_use") { j++; continue }
    const run: ToolUseBlock[] = []
    let k = j
    while (
      k < blocks.length &&
      blocks[k].type === "tool_use" &&
      !skipKeys.has(`${entry.uuid}:${k}`)
    ) {
      run.push(blocks[k] as ToolUseBlock)
      k++
    }
    if (run.length >= 2) {
      // hide these blocks from EntryView
      for (let m = j; m < k; m++) skipKeys.add(`${entry.uuid}:${m}`)
      items.push({
        kind: "tool_group",
        tools: run.map((b) => {
          const output = results.get(b.id) ?? EMPTY_RESULT
          return {
            name: narrowToolUse(b).name,
            status: output.isError ? "error" : "success",
            diffs: extractClaudeDiffs(b),
            block: b,
          }
        }),
      })
    }
    j = k
  }
}
```

The `tool_group` is emitted *after* the containing `entry`. `EntryView` honors the augmented `skipKeys` and naturally skips grouped blocks. Single-tool runs (`run.length === 1`) stay in the entry — they render as normal `<Tool>` cards.

- [ ] **Step 5:** Create `src/transcript/claude/ClaudeToolGroupRow.tsx`:

```tsx
import { ToolGroupRow } from "../grouping"
import { Tool } from "./Tool"
import { narrowToolUse } from "./toolTypes"
import type { ClaudeToolGroupTool } from "../timing"
import type { ToolResult } from "../../types"
import type { ToolRefsById } from "./EntryView"

const EMPTY_RESULT: ToolResult = { content: [], isError: false }

type Props = {
  tools: ClaudeToolGroupTool[]
  results: Map<string, ToolResult>
  toolRefsById: ToolRefsById
}

export function ClaudeToolGroupRow({ tools, results, toolRefsById }: Props) {
  return (
    <ToolGroupRow
      tools={tools.map((t) => ({
        name: t.name,
        status: t.status,
        diffs: t.diffs,
        data: t.block,
      }))}
      renderCard={(block) => {
        const use = narrowToolUse(block)
        const output = results.get(block.id) ?? EMPTY_RESULT
        return <Tool use={use} output={output} toolRefs={toolRefsById.get(block.id)} />
      }}
    />
  )
}
```

- [ ] **Step 6:** Slim `ClaudeCodeTranscript.tsx`:

```tsx
import { useSettings } from "../../settings"
import { buildTranscriptItems } from "../timing"
import { ClaudeToolGroupRow } from "./ClaudeToolGroupRow"
// ...

export function ClaudeCodeTranscript({ entries }: { entries: Entry[] }) {
  const { viewMode } = useSettings()
  const { items, models, results, toolRefsById, skipKeys } = buildTranscriptItems(entries, { viewMode })

  return (
    <div className="transcript">
      {items.map((item, idx) => {
        switch (item.kind) {
          case "header":
            return <TranscriptHeader key={`hdr-${idx}`} startTimestamp={item.chatStartIso} models={models} />
          case "separator":
            return (
              <TurnSeparator
                key={`sep-${item.afterUuid}`}
                durationMs={item.durationMs}
                usage={item.usage}
                verb={pickVerb(item.afterUuid)}
                model={item.model}
              />
            )
          case "entry":
            return (
              <EntryView
                key={item.entry.uuid ?? `entry-${idx}`}
                entry={item.entry}
                results={results}
                toolRefsById={toolRefsById}
                skipKeys={skipKeys}
              />
            )
          case "tool_group":
            return (
              <ClaudeToolGroupRow
                key={`grp-${idx}`}
                tools={item.tools}
                results={results}
                toolRefsById={toolRefsById}
              />
            )
        }
      })}
    </div>
  )
}
```

- [ ] **Step 7:** Type-check + tests.
  ```bash
  cd /Users/andrew/Developer/Prefix/jsonl-fyi && bun run tsc --noEmit && bun test
  ```

- [ ] **Step 8:** Commit.
  ```bash
  git add src/transcript/timing.ts src/transcript/claude/ClaudeCodeTranscript.tsx src/transcript/claude/ClaudeToolGroupRow.tsx
  git commit -m "feat(claude): pure preprocessor with chat-mode tool grouping"
  ```

---

## Task 5 — Codex: new `buildCodexItems.ts`

**Files:** `src/transcript/codex/buildCodexItems.ts` (new), `src/transcript/codex/CodexTranscript.tsx`, `src/transcript/codex/CodexToolGroupRow.tsx` (new)

- [ ] **Step 1:** Create `buildCodexItems.ts` with types:

```ts
import type { CodexEntry, CodexResponseItem } from "./types"
import type { ToolResult } from "../../types"
import type { TurnUsage } from "../usage"
import type { ModelDisplay } from "../model"
import type { ViewMode } from "../../settings"
import type { ToolDiff } from "../grouping"

export type CodexToolGroupTool = {
  name: string
  status: "success" | "error"
  diffs: ToolDiff[]
  entry: CodexResponseItem
}

export type RenderItem =
  | { kind: "header"; chatStartIso: string }
  | { kind: "entry"; entry: CodexResponseItem }
  | { kind: "compacted"; index: number }
  | { kind: "tool_group"; tools: CodexToolGroupTool[] }
  | { kind: "separator"; durationMs: number; usage: TurnUsage | null; model: ModelDisplay | null }

export type BuildCodexResult = {
  items: RenderItem[]
  results: Map<string, ToolResult>
  agentNicknames: Map<string, string>
  models: ModelDisplay[]
}

export function buildCodexItems(
  entries: CodexEntry[],
  opts: { viewMode: ViewMode },
): BuildCodexResult { /* ... */ }
```

- [ ] **Step 2:** Lift existing pre-passes verbatim from `CodexTranscript.tsx`:
  - `deriveIsError` helper.
  - `results` map.
  - `agentNicknames` map.
  - `startTimestamp` discovery.
  - `buildCodexTurnDurations` (already a top-level function — keep here, exported for testing).
  - `buildCodexTurnUsage`.
  - `modelLabels` via `buildCodexModelLabels`.

- [ ] **Step 3:** Add the patch diff extractor:

```ts
import { parseV4A } from "./v4a"

function extractCodexDiffs(re: CodexResponseItem): ToolDiff[] {
  const p = re.payload
  if (p.type !== "custom_tool_call" || p.name !== "apply_patch" || !p.input) return []
  const parsed = parseV4A(p.input)
  if ("error" in parsed) return []
  // V4A returns op of "add" | "update" | "delete". Delete files have no
  // unifiedDiff body, so filter them from the inline peek for v1.
  return parsed.files.flatMap((f) => {
    if (f.op === "delete") return []
    return [{
      kind: "patch" as const,
      filePath: f.path,
      patch: f.unifiedDiff,
      op: f.op,
    }]
  })
}
```

Confirmed against `src/transcript/codex/v4a.ts:1-4`: union is
`{ op: "add"; path; unifiedDiff } | { op: "update"; path; movedTo?; unifiedDiff } | { op: "delete"; path }`.
Delete files are filtered for v1 (no diff body to render). The `movedTo`
field on update files is ignored for the inline peek (it would just rename
in the badge — left as future polish).

- [ ] **Step 4:** Emit-loop with grouping:

```ts
const items: RenderItem[] = []
if (startTimestamp) items.push({ kind: "header", chatStartIso: startTimestamp })

const isToolPayload = (e: CodexEntry): boolean =>
  e.type === "response_item" &&
  (e.payload.type === "function_call" || e.payload.type === "custom_tool_call")

let i = 0
while (i < entries.length) {
  const entry = entries[i]

  if (opts.viewMode === "chat" && isToolPayload(entry)) {
    const run: CodexResponseItem[] = []
    let k = i
    while (k < entries.length && isToolPayload(entries[k])) {
      run.push(entries[k] as CodexResponseItem)
      k++
    }
    if (run.length >= 2) {
      items.push({
        kind: "tool_group",
        tools: run.map((re) => {
          const p = re.payload as { name: string; call_id: string }
          const result = results.get(p.call_id)
          return {
            name: p.name,
            status: result?.isError ? "error" : "success",
            diffs: extractCodexDiffs(re),
            entry: re,
          }
        }),
      })
      const lastIdx = i + run.length - 1
      const ms = durations.get(lastIdx)
      if (ms != null) {
        items.push({
          kind: "separator",
          durationMs: ms,
          usage: usages.get(lastIdx) ?? null,
          model: modelLabels.byIndex.get(lastIdx) ?? null,
        })
      }
      i = k
      continue
    }
  }

  // Non-grouped path — preserve existing per-entry behavior.
  if (entry.type === "session_meta" || entry.type === "turn_context" || entry.type === "event_msg") {
    /* skip — these contributed `node = null` in the old loop */
  } else if (entry.type === "compacted") {
    items.push({ kind: "compacted", index: i })
  } else {
    items.push({ kind: "entry", entry: entry as CodexResponseItem })
  }

  const ms = durations.get(i)
  if (ms != null) {
    items.push({
      kind: "separator",
      durationMs: ms,
      usage: usages.get(i) ?? null,
      model: modelLabels.byIndex.get(i) ?? null,
    })
  }
  i++
}
```

- [ ] **Step 5:** Create `CodexToolGroupRow.tsx`:

```tsx
import { ToolGroupRow } from "../grouping"
import { EntryView } from "./EntryView"
import type { CodexToolGroupTool } from "./buildCodexItems"
import type { ToolResult } from "../../types"
import type { CodexResponseItem } from "./types"

type Props = {
  tools: CodexToolGroupTool[]
  results: Map<string, ToolResult>
  agentNicknames: Map<string, string>
}

export function CodexToolGroupRow({ tools, results, agentNicknames }: Props) {
  return (
    <ToolGroupRow
      tools={tools.map((t) => ({
        name: t.name,
        status: t.status,
        diffs: t.diffs,
        data: t.entry,
      }))}
      renderCard={(entry: CodexResponseItem) => (
        <EntryView entry={entry} results={results} agentNicknames={agentNicknames} />
      )}
    />
  )
}
```

- [ ] **Step 6:** Slim `CodexTranscript.tsx`:

```tsx
import { useSettings } from "../../settings"
import { buildCodexItems } from "./buildCodexItems"
import { CodexToolGroupRow } from "./CodexToolGroupRow"

export function CodexTranscript({ entries }: { entries: CodexEntry[] }) {
  const { viewMode } = useSettings()
  const { items, results, agentNicknames, models } = buildCodexItems(entries, { viewMode })

  return (
    <div className="transcript">
      {items.map((it, idx) => {
        switch (it.kind) {
          case "header":
            return <TranscriptHeader key={`hdr-${idx}`} startTimestamp={it.chatStartIso} models={models} />
          case "compacted":
            return <CompactedMarker key={`comp-${it.index}`} />
          case "entry":
            return <EntryView key={`e-${idx}`} entry={it.entry} results={results} agentNicknames={agentNicknames} />
          case "tool_group":
            return <CodexToolGroupRow key={`g-${idx}`} tools={it.tools} results={results} agentNicknames={agentNicknames} />
          case "separator":
            return <TurnSeparator key={`sep-${idx}`} durationMs={it.durationMs} usage={it.usage} model={it.model} />
        }
      })}
    </div>
  )
}
```

- [ ] **Step 7:** Type-check + tests.

- [ ] **Step 8:** Commit.
  ```bash
  git add src/transcript/codex/buildCodexItems.ts src/transcript/codex/CodexTranscript.tsx src/transcript/codex/CodexToolGroupRow.tsx
  git commit -m "feat(codex): pure preprocessor with chat-mode tool grouping"
  ```

---

## Task 6 — Pi: structured `edit` rendering + grouping

**Files:** `src/transcript/pi/PiEditTool.tsx` (new), `src/transcript/pi/Tool.tsx`, `src/transcript/pi/buildPiItems.ts` (new), `src/transcript/pi/PiTranscript.tsx`, `src/transcript/pi/EntryView.tsx`, `src/transcript/pi/PiToolGroupRow.tsx` (new)

User authorized fixing pi's Normal mode for `edit` while we're at it. New `PiEditTool` uses `EditDiff` per `arguments.edits[]` entry; the chat-mode group reuses the same diff data via `extractPiDiffs`. Pi `write` keeps existing `GenericFileTool` rendering.

### 6a — PiEditTool

- [ ] **Step 1:** Create `src/transcript/pi/PiEditTool.tsx`:

```tsx
import type { ToolResult } from "../../types"
import { EditDiff } from "../EditDiff"
import { ToolCard } from "../ToolCard"
import { Header, ToolResultContent, ToolTitle, hasOutput } from "../shared"
import type { PiToolCallContent } from "./types"

type PiEdit = { oldText: string; newText: string }

function shortPath(path: string): string {
  const parts = path.split("/").filter(Boolean)
  return parts.at(-1) ?? path
}

export function parsePiEdits(args: Record<string, unknown>): { path: string; edits: PiEdit[] } | null {
  const path = typeof args.path === "string" ? args.path : null
  const rawEdits = Array.isArray(args.edits) ? args.edits : null
  if (!path || !rawEdits) return null
  const edits: PiEdit[] = []
  for (const e of rawEdits) {
    if (e && typeof e === "object") {
      const o = e as Record<string, unknown>
      const oldText = typeof o.oldText === "string" ? o.oldText : ""
      const newText = typeof o.newText === "string" ? o.newText : ""
      edits.push({ oldText, newText })
    }
  }
  return { path, edits }
}

export function PiEditTool({ call, output }: { call: PiToolCallContent; output: ToolResult }) {
  const parsed = parsePiEdits(call.arguments)
  if (!parsed) {
    return (
      <ToolCard.Root hasContent={hasOutput(output)} status={output.isError ? "error" : "success"}>
        <ToolCard.Trigger>
          <Header>
            <ToolTitle name="edit" />
          </Header>
        </ToolCard.Trigger>
        <ToolCard.Content>
          <ToolResultContent output={output} />
        </ToolCard.Content>
      </ToolCard.Root>
    )
  }

  const { path, edits } = parsed
  return (
    <ToolCard.Root hasContent status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="edit" detail={shortPath(path)} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Preview>
        {edits.map((ed, i) => (
          <EditDiff key={i} filePath={path} oldString={ed.oldText} newString={ed.newText} />
        ))}
      </ToolCard.Preview>
      <ToolCard.Content>
        {edits.map((ed, i) => (
          <EditDiff key={i} filePath={path} oldString={ed.oldText} newString={ed.newText} />
        ))}
        {hasOutput(output) && <ToolResultContent output={output} />}
      </ToolCard.Content>
    </ToolCard.Root>
  )
}
```

- [ ] **Step 2:** Route `edit` in `src/transcript/pi/Tool.tsx` `PiTool` switch (~line 268):

```ts
case "edit":
  return <PiEditTool call={call} output={output} />
case "write":
case "grep":
case "find":
case "ls":
  return <GenericFileTool call={call} output={output} />
```

Add `import { PiEditTool } from "./PiEditTool"`.

- [ ] **Step 3:** Add `src/transcript/pi/PiEditTool.test.tsx`:
  - `parsePiEdits` returns `null` when `path` missing.
  - `parsePiEdits` returns `null` when `edits` missing.
  - `parsePiEdits` returns parsed shape on well-formed input.
  - `PiEditTool` renders the file basename in title.

- [ ] **Step 4:** Type-check + tests.

- [ ] **Step 5:** Commit.
  ```bash
  git add src/transcript/pi/PiEditTool.tsx src/transcript/pi/PiEditTool.test.tsx src/transcript/pi/Tool.tsx
  git commit -m "feat(pi): structured edit rendering with EditDiff"
  ```

### 6b — buildPiItems + grouping

- [ ] **Step 1:** Create `src/transcript/pi/buildPiItems.ts` with types:

```ts
import type { ToolResult } from "../../types"
import type { ModelDisplay } from "../model"
import type { ViewMode } from "../../settings"
import type { ToolDiff } from "../grouping"
import type { PiContent, PiMessageEntry, PiParsedSession, PiToolCallContent, PiTreeEntry } from "./types"

export type PiResultWithDetails = ToolResult & { details?: unknown }

export type PiToolGroupTool = {
  name: string
  status: "success" | "error"
  diffs: ToolDiff[]
  call: PiToolCallContent
}

export type RenderItem =
  | { kind: "header"; chatStartIso: string; models: ModelDisplay[] }
  | { kind: "entry"; entry: PiTreeEntry }
  | { kind: "tool_group"; tools: PiToolGroupTool[] }
  | { kind: "footnote"; hiddenBranchEntryCount: number; orphanedEntryCount: number }

export type BuildPiResult = {
  items: RenderItem[]
  results: Map<string, PiResultWithDetails>
  models: ModelDisplay[]
  skipBlocks: Map<string, Set<number>>
}

export function buildPiItems(session: PiParsedSession, opts: { viewMode: ViewMode }): BuildPiResult { /* ... */ }
```

- [ ] **Step 2:** Lift pre-passes:
  - Results map (current `PiTranscript.tsx` lines 41–47) — note that `extractPiToolResult` populates `isError` correctly.
  - `buildPiHeaderModels` — move whole function from `PiTranscript.tsx` into `buildPiItems.ts`; export for testing.

- [ ] **Step 3:** Add diff extractor:

```ts
import { parsePiEdits } from "./PiEditTool"

function extractPiDiffs(call: PiToolCallContent): ToolDiff[] {
  if (call.name !== "edit") return []
  const parsed = parsePiEdits(call.arguments)
  if (!parsed) return []
  return parsed.edits.map((ed) => ({
    kind: "edit" as const,
    filePath: parsed.path,
    oldString: ed.oldText,
    newString: ed.newText,
  }))
}
```

- [ ] **Step 4:** Emit-loop with grouping:

```ts
const items: RenderItem[] = []
const skipBlocks = new Map<string, Set<number>>()

if (session.header) {
  items.push({ kind: "header", chatStartIso: session.header.timestamp, models })
}

for (const entry of session.activeEntries) {
  if (entry.type !== "message") {
    items.push({ kind: "entry", entry })
    continue
  }
  const msg = entry.message
  items.push({ kind: "entry", entry })

  if (opts.viewMode === "chat" && msg.role === "assistant" && Array.isArray(msg.content)) {
    const blocks = msg.content
    const skip = new Set<number>()
    let j = 0
    while (j < blocks.length) {
      if (blocks[j].type !== "toolCall") { j++; continue }
      const run: PiToolCallContent[] = []
      let k = j
      while (k < blocks.length && blocks[k].type === "toolCall") {
        run.push(blocks[k] as PiToolCallContent)
        k++
      }
      if (run.length >= 2) {
        for (let m = j; m < k; m++) skip.add(m)
        items.push({
          kind: "tool_group",
          tools: run.map((b) => {
            const result = results.get(b.id)
            return {
              name: b.name,
              status: result?.isError ? "error" : "success",
              diffs: extractPiDiffs(b),
              call: b,
            }
          }),
        })
      }
      j = k
    }
    if (skip.size > 0) skipBlocks.set(entry.id, skip)
  }
}

if (session.hiddenBranchEntryCount > 0 || session.orphanedEntryCount > 0) {
  items.push({
    kind: "footnote",
    hiddenBranchEntryCount: session.hiddenBranchEntryCount,
    orphanedEntryCount: session.orphanedEntryCount,
  })
}

return { items, results, models, skipBlocks }
```

- [ ] **Step 5:** Update `PiEntryView` to honor `skipBlocks`:
  - Add `skipBlocks?: Map<string, Set<number>>` prop on `PiEntryView`.
  - Thread `skip = skipBlocks?.get(entry.id)` through `MessageEntryView`.
  - In `renderMessageContent` for assistant content (the `PiContent[]` branch), skip indices in `skip`.

- [ ] **Step 6:** Create `src/transcript/pi/PiToolGroupRow.tsx`:

```tsx
import { ToolGroupRow } from "../grouping"
import { PiTool } from "./Tool"
import type { PiToolGroupTool, PiResultWithDetails } from "./buildPiItems"
import type { PiToolCallContent } from "./types"

type Props = {
  tools: PiToolGroupTool[]
  results: Map<string, PiResultWithDetails>
}

export function PiToolGroupRow({ tools, results }: Props) {
  return (
    <ToolGroupRow
      tools={tools.map((t) => ({
        name: t.name,
        status: t.status,
        diffs: t.diffs,
        data: t.call,
      }))}
      renderCard={(call: PiToolCallContent) => {
        const result = results.get(call.id)
        return <PiTool call={call} output={result ?? { content: [], isError: false }} details={result?.details} />
      }}
    />
  )
}
```

- [ ] **Step 7:** Slim `PiTranscript.tsx`:

```tsx
import { useSettings } from "../../settings"
import { buildPiItems } from "./buildPiItems"
import { PiToolGroupRow } from "./PiToolGroupRow"

export function PiTranscript({ session }: { session: PiParsedSession }) {
  const { viewMode } = useSettings()
  const { items, results, models, skipBlocks } = buildPiItems(session, { viewMode })

  return (
    <div className="transcript">
      {items.map((it, idx) => {
        switch (it.kind) {
          case "header":
            return <TranscriptHeader key={`hdr-${idx}`} startTimestamp={it.chatStartIso} models={models} />
          case "entry":
            return <PiEntryView key={`e-${idx}`} entry={it.entry} results={results} skipBlocks={skipBlocks} />
          case "tool_group":
            return <PiToolGroupRow key={`g-${idx}`} tools={it.tools} results={results} />
          case "footnote":
            return (
              <div key={`fn-${idx}`} className="pi-branch-footnote">
                {it.hiddenBranchEntryCount > 0 && (
                  <span>{it.hiddenBranchEntryCount} entries on other branches are not shown.</span>
                )}
                {it.orphanedEntryCount > 0 && (
                  <span>{it.orphanedEntryCount} missing parent link encountered.</span>
                )}
              </div>
            )
        }
      })}
    </div>
  )
}
```

- [ ] **Step 8:** Type-check + tests.

- [ ] **Step 9:** Commit.
  ```bash
  git add src/transcript/pi/buildPiItems.ts src/transcript/pi/PiTranscript.tsx src/transcript/pi/EntryView.tsx src/transcript/pi/PiToolGroupRow.tsx
  git commit -m "feat(pi): pure preprocessor with chat-mode tool grouping"
  ```

---

## Task 7 — Tests

**Files:** `src/transcript/grouping.test.ts` (new), `src/transcript/grouping.test.tsx` (new), `src/transcript/timing.test.ts` (modify), `src/transcript/codex/buildCodexItems.test.ts` (new), `src/transcript/pi/buildPiItems.test.ts` (new)

- [ ] **Step 1: Shared helper tests** — `src/transcript/grouping.test.tsx`:
  - `aggregateStatus`: pure success / pure error / mixed cases.
  - `renderToolDiff` for `kind: "edit"` produces an `EditDiff`-shaped output (assert characteristic class names in renderToString).
  - `renderToolDiff` for `kind: "patch"` produces a `PatchDiff`-shaped output.
  - `ToolGroupRow`:
    - Renders summary label + pluralization + name list.
    - Renders inline diffs (flatten of `tools[].diffs`) when collapsed.
    - Hides inline diffs and renders `renderCard(data)` per tool when expanded (assert `data` flow via a recognizable `renderCard` output).
    - Aggregate status: success / error / mixed → correct CSS class.

- [ ] **Step 2: Claude grouping tests** in `src/transcript/timing.test.ts`. Build minimal `Entry[]` fixtures inline (one assistant message with N tool_use blocks; lift the existing `EMPTY_RESULT`-style helpers if available). Assertions:
  - 3 consecutive `tool_use` → exactly one `tool_group` item with `tools.length === 3`; `tools[0].block === blocks[0]`.
  - `[text, tool_use, text, tool_use]` → no `tool_group`.
  - `[tool_use, tool_use, text, tool_use, tool_use]` → two `tool_group` items.
  - viewMode `"normal"` on the same input → zero `tool_group` items.
  - Skill body absorption still hides the user-text block: `skipKeys` retains both prior absorptions and the grouped tool-use keys.
  - `Edit` block in a chat-mode group → `tools[i].diffs[0]` matches `{ kind: "edit", filePath, oldString, newString }`.
  - `MultiEdit` with 2 edits → `tools[i].diffs.length === 2`.

- [ ] **Step 3: Codex grouping tests** in `src/transcript/codex/buildCodexItems.test.ts`:
  - Fabricate `CodexEntry[]` with consecutive `function_call`/`custom_tool_call` items → one `tool_group` with correct `tools.length`.
  - `apply_patch` (multi-file) → `tools[i].diffs.length === N` with each `kind: "patch"` and correct `filePath`.
  - Single tool entries in chat mode → render as `entry`, not `tool_group`.
  - Turn separator emitted at the index of the run's last entry when `durations` has it.
  - viewMode `"normal"` → zero `tool_group` items.

- [ ] **Step 4: Pi grouping tests** in `src/transcript/pi/buildPiItems.test.ts`:
  - Fabricate `PiParsedSession` with assistant message containing 2+ `toolCall` blocks (mix of `edit`, `bash`, `read`).
  - `tool_group` tools length matches.
  - `edit` entry has `diffs.length === edits.length` with correct `filePath`/`oldString`/`newString`.
  - `skipBlocks.get(entry.id)` contains exactly the indices the entry must skip.
  - viewMode `"normal"` → zero `tool_group`.

- [ ] **Step 5:** Run all tests.
  ```bash
  cd /Users/andrew/Developer/Prefix/jsonl-fyi && bun test
  ```

- [ ] **Step 6:** Commit.
  ```bash
  git add src/transcript/grouping.test.tsx src/transcript/timing.test.ts src/transcript/codex/buildCodexItems.test.ts src/transcript/pi/buildPiItems.test.ts
  git commit -m "test: cover chat-mode grouping across formats"
  ```

---

## Task 8 — Verification (agent-browser)

- [ ] **Step 1:** Confirm dev server is running on port 3000 (per CLAUDE.md memory: track PID, don't pile up servers).

- [ ] **Step 2: Regression — Claude & Codex Normal/Compact**

For each format and the baseline fixture:
1. Drag in fixture, set Normal mode.
2. Capture `document.querySelector('.transcript').outerHTML`.
3. Diff against `/tmp/baseline-{format}-normal.html`. Must be byte-identical.
4. Repeat for Compact.

If any DOM diff appears, stop and investigate.

- [ ] **Step 3: Regression — Pi Normal/Compact (with documented exception)**

Diff against pi baselines. Differences allowed only inside elements rendering pi `edit` calls (now `PiEditTool`/`EditDiff`). Document the change in PR description.

- [ ] **Step 4: Chat mode — Claude**
  - 2+ consecutive `tool_use` → one `.tool-group`.
  - Summary text matches `N tool calls — name · name · ...`.
  - `.tool-group-diffs` present iff the run contains an Edit/MultiEdit; `.tool-group-diff-file` shows path; `EditDiff` element below.
  - Individual tool cards from the run are NOT in the DOM (collapsed).
  - Click `.tool-group-row` → `.tool-group-expanded` contains individual cards; `.tool-group-diffs` hides.
  - Switch to Normal: group disappears, individual cards reappear.
  - Single-tool message in chat mode → renders as a normal `ToolCard` (no `.tool-group` wrapper).

- [ ] **Step 5: Chat mode — Codex**
  - `.tool-group` exists for runs.
  - `apply_patch` (multi-file) → multiple `EditDiff`/`PatchDiff` rows in `.tool-group-diffs`, each with its own filename badge.
  - Click expand → individual entries appear as cards.
  - Turn separator appears at correct position when last entry of the group ends a turn.

- [ ] **Step 6: Chat mode — Pi**
  - `.tool-group` exists.
  - `edit` row produces N `EditDiff`s in `.tool-group-diffs` (one per edit).
  - Click expand → individual `PiTool` cards render (incl. `PiEditTool` for `edit`).

- [ ] **Step 7: Mixed status visual**

Find or contrive a fixture with a group containing both a successful and a failing tool. Verify `.tool-card-mixed` class is applied and computed style on the bullet `::before` is the linear-gradient.

- [ ] **Step 8:** Console clean — zero errors and warnings on every interaction.

- [ ] **Step 9:** Leave dev server running (per CLAUDE.md).

---

## Task 9 — Final cleanup

- [ ] **Step 1:** Final type-check + tests.
  ```bash
  cd /Users/andrew/Developer/Prefix/jsonl-fyi && bun run tsc --noEmit && bun test
  ```

- [ ] **Step 2:** Working tree status.
  ```bash
  cd /Users/andrew/Developer/Prefix/jsonl-fyi && git status
  ```
  Expected: clean working tree.

- [ ] **Step 3:** Confirm dev server is up on port 3000 (or worktree port if working in `.worktrees/`).

---

## Out of scope (per spec + clarifications)

- Chat-bubble / messaging-style assistant layout.
- Synthesizing natural-language summaries from tool results.
- Per-tool-card selective collapse inside a group (group collapses as a unit).
- Claude `Write` and Pi `write` inline diffs (`ToolDiff` is forward-compatible — a future variant can carry full file content once we decide how to render it).

## Future work

- Promote Claude/Pi `Write` to a structured "new file content as diff" rendering once we settle the variant.
- Render Codex `apply_patch` deletes inline (filename + "(deleted)" badge — currently filtered).
- Surface Codex `apply_patch` `movedTo` (rename) in the inline filename badge — see TODO.md.
- Consider an N-way gradient bullet for groups whose mixed statuses span >2 distinct outcomes (currently 2-color split).
