# Chat View Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Chat" view mode that collapses consecutive tool calls in an assistant message into a single summary row, with Edit/Write diffs shown inline.

**Architecture:** A `ToolGroupRow` component renders the collapsed summary ("3 tool calls — Read · Edit · Bash") and inline diffs. For Claude, `EntryView` groups consecutive `tool_use` blocks within one message. For Codex, `CodexTranscript` groups consecutive `function_call`/`custom_tool_call` entries within a turn. Individual tool cards render in expanded state with their existing `ToolCard` chrome. One small change to `ToolCard.tsx` makes chat mode previews behave like normal mode (so single-tool cards still show their preview).

**Tech Stack:** React + TypeScript + CSS (existing stack; no new dependencies)

**Spec:** `docs/superpowers/specs/2026-05-04-chat-view-mode-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/settings.tsx` | Modify | Add `"chat"` to `ViewMode` |
| `src/SettingsPopover.tsx` | Modify | Add "Chat" option to select |
| `src/transcript/ToolGroupRow.tsx` | **Create** | Renders collapsed summary row + inline diffs + expand toggle |
| `src/transcript/claude/EntryView.tsx` | Modify | Group consecutive `tool_use` blocks in chat mode |
| `src/transcript/codex/CodexTranscript.tsx` | Modify | Group consecutive tool entries in chat mode |
| `src/transcript/ToolCard.tsx` | Modify | Treat `"chat"` like `"normal"` for body rendering |
| `src/styles.css` | Modify | Add `.tool-group` and `.tool-group-diffs` styles |

---

### Task 1: Settings — Add "chat" to ViewMode

**Files:**
- Modify: `src/settings.tsx:3`
- Modify: `src/SettingsPopover.tsx`

- [ ] **Step 1: Add "chat" to the type**

In `src/settings.tsx`, line 3:

```ts
export type ViewMode = "compact" | "normal" | "chat"
```

- [ ] **Step 2: Add "Chat" option to SettingsPopover**

In `src/SettingsPopover.tsx`, inside the `<select>`, add between "Compact" and the closing `</select>`:

```tsx
<option value="chat">Chat</option>
```

Final select:
```tsx
<select value={viewMode} onChange={(e) => setViewMode(e.currentTarget.value as ViewMode)}>
  <option value="normal">Normal</option>
  <option value="compact">Compact</option>
  <option value="chat">Chat</option>
</select>
```

- [ ] **Step 3: Verify type-check**

```bash
cd /Users/andrew/Developer/Prefix/jsonl-fyi && bun run tsc --noEmit
```

Expected: clean. The ToolCard.tsx viewMode branch uses `if/else` not `switch`, so adding a third value doesn't trigger exhaustiveness checks — but a later task fixes the branch.

- [ ] **Step 4: Commit**

```bash
git add src/settings.tsx src/SettingsPopover.tsx
git commit -m "feat: add chat view mode to settings"
```

---

### Task 2: Create ToolGroupRow component

**Files:**
- Create: `src/transcript/ToolGroupRow.tsx`
- Modify: `src/styles.css` (append styles)

The component renders the collapsed group row with a shared bullet, tool name list, inline diffs, and expand toggle. It reuses the existing `.tool-row`, `.tool-title`, `.tool-title-name`, `.tool-title-paren`, `.tool-title-detail` CSS classes so the summary line looks native.

- [ ] **Step 1: Create the component**

```tsx
// src/transcript/ToolGroupRow.tsx
import { useState, type ReactNode } from "react"

type Props = {
  toolNames: string[]         // e.g. ["Read", "Edit", "Bash"]
  status: "success" | "error" // aggregate: error if any tool errored
  inlineDiffs?: ReactNode[]   // EditDiff / PatchDiff elements for inline rendering
  children: ReactNode         // full Tool cards for expanded view
}

export function ToolGroupRow({ toolNames, status, inlineDiffs, children }: Props) {
  const [expanded, setExpanded] = useState(false)
  const count = toolNames.length
  const label = `${count} ${count === 1 ? "tool call" : "tool calls"}`
  const list = toolNames.join(" · ")
  const statusClass = status === "error" ? "tool-card-error" : "tool-card-success"

  return (
    <div className={`tool-group ${statusClass}`}>
      <button
        className="tool-row clickable"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="tool-title">
          <strong className="tool-title-name">{label}</strong>
          <span className="tool-title-paren">(</span>
          <span className="tool-title-detail">{list}</span>
          <span className="tool-title-paren">)</span>
        </span>
      </button>

      {inlineDiffs && inlineDiffs.length > 0 && (
        <div className="tool-group-diffs">
          {inlineDiffs}
        </div>
      )}

      {expanded && <div className="tool-group-expanded">{children}</div>}
    </div>
  )
}
```

The `toolNames` prop contains display names like `"Read"`, `"Edit"`, `"Bash"` — the same names used in the existing ToolCard triggers.

- [ ] **Step 2: Add CSS**

Append to `src/styles.css`:

```css
/* ── Chat mode tool group ── */

.tool-group {
  display: flex;
  flex-direction: column;
}

.tool-group > .tool-row.clickable {
  cursor: pointer;
}
.tool-group > .tool-row.clickable:hover {
  background: var(--color-card);
}

.tool-group-diffs {
  margin: 0 0 4px 24px;
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
  margin-left: 0;
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd /Users/andrew/Developer/Prefix/jsonl-fyi && bun run tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/transcript/ToolGroupRow.tsx src/styles.css
git commit -m "feat: add ToolGroupRow component for chat view mode"
```

---

### Task 3: ToolCard — treat "chat" like "normal" for body rendering

**Files:**
- Modify: `src/transcript/ToolCard.tsx:56`

When a single tool card renders in chat mode (either standalone or inside an expanded ToolGroupRow), it should behave like Normal mode: show preview when collapsed, content when expanded. Currently chat falls through to `body = null` (compact behavior).

- [ ] **Step 1: Update the viewMode branch**

In `src/transcript/ToolCard.tsx`, line 56, change:

```ts
else if (viewMode === "normal") body = preview
```

to:

```ts
else if (viewMode === "normal" || viewMode === "chat") body = preview
```

The full block after the change:

```ts
let body: ReactNode = null
if (expanded) body = content ?? preview
else if (viewMode === "normal" || viewMode === "chat") body = preview
else body = null
```

- [ ] **Step 2: Verify type-check**

```bash
cd /Users/andrew/Developer/Prefix/jsonl-fyi && bun run tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/transcript/ToolCard.tsx
git commit -m "fix: treat chat view mode like normal in ToolCard body rendering"
```

---

### Task 4: Grouping logic — Claude Code EntryView

**Files:**
- Modify: `src/transcript/claude/EntryView.tsx`

Consecutive `tool_use` blocks within one assistant message get merged into a `ToolGroupRow` when viewMode is `"chat"` and there are 2+ tool calls in the run. Edit/MultiEdit diffs are extracted and shown inline.

- [ ] **Step 1: Add imports**

Replace the existing imports in `src/transcript/claude/EntryView.tsx`:

```tsx
import type { ReactNode } from "react"
import type { MessageEntry, ToolResult } from "../../types"
import { useSettings } from "../../settings"
import { getBlocks } from "./extractResult"
import { TextBlock } from "./TextBlock"
import { ThinkingBlock } from "../ThinkingBlock"
import { ImageBlock } from "../ImageBlock"
import { Tool } from "./Tool"
import { narrowToolUse } from "./toolTypes"
import { ToolGroupRow } from "../ToolGroupRow"
import { EditDiff } from "../EditDiff"
```

New imports added: `useSettings`, `ToolGroupRow`, `EditDiff`. Removed unused `type` import of `ReactNode` (but keep it since the function uses it).

- [ ] **Step 2: Rewrite the component with grouping logic**

Replace the `EntryView` function body in `src/transcript/claude/EntryView.tsx`:

```tsx
const EMPTY_RESULT: ToolResult = { content: [], isError: false }

export type ToolRefsById = Map<string, string[]>

type Props = {
  entry: MessageEntry
  results: Map<string, ToolResult>
  toolRefsById?: ToolRefsById
  skipKeys: Set<string>
}

export function EntryView({ entry, results, toolRefsById, skipKeys }: Props) {
  const { viewMode } = useSettings()
  const role = entry.message?.role ?? entry.type
  const blocks = getBlocks(entry)
  if (blocks.length === 0) return null

  const nodes: ReactNode[] = []
  for (let j = 0; j < blocks.length; j++) {
    const block = blocks[j]
    if (skipKeys.has(`${entry.uuid}:${j}`)) continue

    if (block.type === "text") {
      nodes.push(<TextBlock key={j} text={block.text} role={role} />)
    } else if (block.type === "thinking") {
      nodes.push(<ThinkingBlock key={j} text={block.thinking} />)
    } else if (block.type === "image") {
      nodes.push(<ImageBlock key={j} source={block.source} role={role} />)
    } else if (block.type === "tool_use") {
      // Collect consecutive tool_use blocks
      const run: typeof block[] = []
      let k = j
      while (k < blocks.length && blocks[k].type === "tool_use") {
        run.push(blocks[k])
        k++
      }

      if (viewMode === "chat" && run.length >= 2) {
        // --- Chat mode: grouped row ---
        const toolNames: string[] = []
        const diffs: ReactNode[] = []
        let anyError = false

        for (const tb of run) {
          const use = narrowToolUse(tb)
          toolNames.push(use.name)
          const output = results.get(tb.id) ?? EMPTY_RESULT
          if (output.isError) anyError = true

          // Extract inline diffs for Edit / MultiEdit
          if (use.name === "Edit") {
            const input = use.input
            if (input.old_string || input.new_string) {
              diffs.push(
                <div key={tb.id}>
                  <div className="tool-group-diff-file">{input.file_path}</div>
                  <EditDiff
                    filePath={input.file_path}
                    oldString={input.old_string || ""}
                    newString={input.new_string || ""}
                  />
                </div>,
              )
            }
          } else if (use.name === "MultiEdit") {
            const input = use.input
            for (const [ei, ed] of input.edits.entries()) {
              if (ed.old_string || ed.new_string) {
                diffs.push(
                  <div key={`${tb.id}-${ei}`}>
                    <div className="tool-group-diff-file">{input.file_path}</div>
                    <EditDiff
                      filePath={input.file_path}
                      oldString={ed.old_string || ""}
                      newString={ed.new_string || ""}
                    />
                  </div>,
                )
              }
            }
          }
          // Write tool: spec mentions it but Write doesn't produce a diff
          // in the same way Edit does (Write has full content, not old/new).
          // Skip Write for inline diffs — show only Edit/MultiEdit.
        }

        nodes.push(
          <ToolGroupRow
            key={`group-${j}`}
            toolNames={toolNames}
            status={anyError ? "error" : "success"}
            inlineDiffs={diffs.length > 0 ? diffs : undefined}
          >
            {run.map((tb) => {
              const use = narrowToolUse(tb)
              const output = results.get(tb.id) ?? EMPTY_RESULT
              return (
                <Tool
                  key={tb.id}
                  use={use}
                  output={output}
                  toolRefs={toolRefsById?.get(tb.id)}
                />
              )
            })}
          </ToolGroupRow>,
        )
      } else {
        // Non-chat mode, or single tool in chat mode: render normally
        for (const tb of run) {
          const use = narrowToolUse(tb)
          const output = results.get(tb.id) ?? EMPTY_RESULT
          nodes.push(
            <Tool
              key={tb.id}
              use={use}
              output={output}
              toolRefs={toolRefsById?.get(tb.id)}
            />,
          )
        }
      }

      j = k - 1 // skip past the run we just processed
    }
  }
  return <>{nodes}</>
}
```

Key points:
- The discriminated union (`use.name === "Edit"`) narrows `use.input` to `EditInput` / `MultiEditInput`, so TypeScript knows the exact fields available.
- `diffs` accumulates `ReactNode` elements — each is a `div` with a filename label and `EditDiff`.
- Non-Edit/MultiEdit tools (Bash, Read, etc.) contribute no inline diff — their content stays behind the collapse.
- `j = k - 1` advances the outer loop past the grouped run.

- [ ] **Step 3: Verify type-check**

```bash
cd /Users/andrew/Developer/Prefix/jsonl-fyi && bun run tsc --noEmit
```

Expected: clean. The discriminated union narrowing on `use.name` is the key TypeScript check — if any `EditInput` / `MultiEditInput` field access is wrong, it'll fail here.

- [ ] **Step 4: Run existing tests**

```bash
cd /Users/andrew/Developer/Prefix/jsonl-fyi && bun test
```

Expected: all existing tests pass. The viewMode default is still `"normal"`, so the grouping path is not exercised by existing tests — but existing rendering must not break.

- [ ] **Step 5: Commit**

```bash
git add src/transcript/claude/EntryView.tsx
git commit -m "feat: group consecutive tool calls in Claude chat view mode"
```

---

### Task 5: Grouping logic — Codex CodexTranscript

**Files:**
- Modify: `src/transcript/codex/CodexTranscript.tsx`

For Codex, consecutive `function_call` or `custom_tool_call` entries in the same turn get grouped. The current `.map` loop over entries becomes a `for` loop with lookahead. For `apply_patch` in a group, the patch diff is extracted and shown inline.

- [ ] **Step 1: Add imports**

In `src/transcript/codex/CodexTranscript.tsx`, add two imports at the top:

```tsx
import { useSettings } from "../../settings"
import { ToolGroupRow } from "../ToolGroupRow"
```

Add them after the existing React import line:

```tsx
import React from "react"
import { useSettings } from "../../settings"
import type { CodexEntry, CodexResponseItem } from "./types"
import type { ToolResult } from "../../types"
import { EntryView } from "./EntryView"
import { CompactedMarker } from "./CompactedMarker"
import { TurnSeparator } from "../TurnSeparator"
import { TranscriptHeader } from "../TranscriptHeader"
import { extractCodexTurnUsage } from "../usage"
import type { TurnUsage } from "../usage"
import { buildCodexModelLabels } from "./modelLabeling"
import { tryParseAgentSpawnOutput } from "./Tool"
import { ToolGroupRow } from "../ToolGroupRow"
```

Also add imports needed for apply_patch inline diffs:

```tsx
import { parseV4A } from "./v4a"
import { PatchDiff } from "@pierre/diffs/react"
```

- [ ] **Step 2: Add helper to check if an entry is a tool call**

Add this helper function before the `CodexTranscript` component:

```tsx
function isToolEntry(entry: CodexEntry): entry is CodexResponseItem & {
  payload: { type: "function_call" } | { type: "custom_tool_call" }
} {
  if (entry.type !== "response_item") return false
  const p = entry.payload
  return p.type === "function_call" || p.type === "custom_tool_call"
}
```

This type guard narrows entries so TypeScript knows they're `CodexResponseItem` with a tool payload.

- [ ] **Step 3: Rewrite the entries rendering loop**

Replace the existing render block (lines 150-179 in the current file — the `return` statement and its `.map` call) with a `for` loop that groups consecutive tool entries:

```tsx
const { viewMode } = useSettings()

// Build rendering nodes with grouping for chat mode
const renderingNodes: React.ReactNode[] = []

for (let i = 0; i < entries.length; i++) {
  const entry = entries[i]

  if (isToolEntry(entry) && viewMode === "chat") {
    // Collect consecutive tool entries
    const run: CodexResponseItem[] = []
    let k = i
    while (k < entries.length && isToolEntry(entries[k])) {
      run.push(entries[k] as CodexResponseItem)
      k++
    }

    if (run.length >= 2) {
      // --- Chat mode: grouped row ---
      const toolNames = run.map((e) => e.payload.name)
      const anyError = run.some((e) => {
        const r = results.get(e.payload.call_id)
        return r?.isError === true
      })

      // Inline diffs for apply_patch
      const diffs: React.ReactNode[] = []
      for (const re of run) {
        const p = re.payload
        if (p.type === "custom_tool_call" && p.name === "apply_patch") {
          const parsed = parseV4A(p.input)
          if (!("error" in parsed)) {
            for (const [fi, f] of parsed.files.entries()) {
              if (f.op === "delete") continue // no diff to show
              diffs.push(
                <div key={`${p.call_id}-${fi}`}>
                  <div className="tool-group-diff-file">{f.path}</div>
                  <PatchDiff
                    patch={f.unifiedDiff}
                    options={{
                      diffStyle: "unified",
                      diffIndicators: "classic",
                      disableFileHeader: true,
                      disableLineNumbers: true,
                    }}
                    disableWorkerPool
                  />
                </div>,
              )
            }
          }
        }
      }

      renderingNodes.push(
        <React.Fragment key={`row-${i}`}>
          <ToolGroupRow
            toolNames={toolNames}
            status={anyError ? "error" : "success"}
            inlineDiffs={diffs.length > 0 ? diffs : undefined}
          >
            {run.map((re, ri) => (
              <EntryView
                key={ri}
                entry={re}
                results={results}
                agentNicknames={agentNicknames}
              />
            ))}
          </ToolGroupRow>
          {/* Turn separator if this group's last entry ends a turn */}
          {durations.get(i + run.length - 1) != null && (
            <TurnSeparator
              durationMs={durations.get(i + run.length - 1)!}
              usage={usages.get(i + run.length - 1) ?? null}
              model={modelLabels.byIndex.get(i + run.length - 1) ?? null}
            />
          )}
        </React.Fragment>,
      )

      i = k - 1
      continue
    }
    // Fall through: single tool gets rendered normally below
  }

  // Normal rendering (unchanged logic)
  let node: React.ReactNode = null
  if (entry.type === "session_meta") node = null
  else if (entry.type === "turn_context") node = null
  else if (entry.type === "compacted")
    node = <CompactedMarker key={`comp-${i}`} />
  else if (entry.type === "event_msg") node = null
  else
    node = (
      <EntryView
        key={i}
        entry={entry}
        results={results}
        agentNicknames={agentNicknames}
      />
    )

  const ms = durations.get(i)
  renderingNodes.push(
    <React.Fragment key={`row-${i}`}>
      {node}
      {ms != null && (
        <TurnSeparator
          durationMs={ms}
          usage={usages.get(i) ?? null}
          model={modelLabels.byIndex.get(i) ?? null}
        />
      )}
    </React.Fragment>,
  )
}

return (
  <div className="transcript">
    {startTimestamp && (
      <TranscriptHeader startTimestamp={startTimestamp} models={modelLabels.models} />
    )}
    {renderingNodes}
  </div>
)
```

Key points:
- The `isToolEntry` type guard ensures entries in the run are `CodexResponseItem` (so they can be passed to `EntryView`).
- `i = k - 1` advances past the grouped run.
- Turn separators use `i + run.length - 1` (the last entry in the group) to check the durations map.
- For apply_patch inline diffs, `parseV4A` extracts per-file unified diffs, and `PatchDiff` renders them — same rendering as ApplyPatch's preview.
- Single tool calls in chat mode fall through to normal rendering (no grouping).

- [ ] **Step 4: Verify type-check**

```bash
cd /Users/andrew/Developer/Prefix/jsonl-fyi && bun run tsc --noEmit
```

Expected: clean. The `PatchDiff` import from `@pierre/diffs/react` and `parseV4A` from `./v4a` should resolve correctly (both are already used in `ApplyPatch.tsx`).

- [ ] **Step 5: Run existing tests**

```bash
cd /Users/andrew/Developer/Prefix/jsonl-fyi && bun test
```

- [ ] **Step 6: Commit**

```bash
git add src/transcript/codex/CodexTranscript.tsx
git commit -m "feat: group consecutive tool calls in Codex chat view mode"
```

---

### Task 6: Write tests

**Files:**
- Create: `src/transcript/ToolGroupRow.test.tsx`

- [ ] **Step 1: Write ToolGroupRow tests**

```tsx
// src/transcript/ToolGroupRow.test.tsx
import { describe, it, expect } from "bun:test"
import { renderToString } from "react-dom/server"
import { ToolGroupRow } from "./ToolGroupRow"

describe("ToolGroupRow", () => {
  it("renders the summary line with tool names", () => {
    const html = renderToString(
      <ToolGroupRow toolNames={["Read", "Edit", "Bash"]} status="success">
        <div>expanded content</div>
      </ToolGroupRow>,
    )
    expect(html).toContain("3 tool calls")
    expect(html).toContain("Read · Edit · Bash")
  })

  it("renders singular label for one tool", () => {
    const html = renderToString(
      <ToolGroupRow toolNames={["Edit"]} status="success">
        <div>expanded content</div>
      </ToolGroupRow>,
    )
    expect(html).toContain("1 tool call")
    expect(html).toContain("Edit")
    expect(html).not.toContain("·")
  })

  it("renders inline diffs when provided", () => {
    const diffs = [<div key="1" className="test-diff">diff content</div>]
    const html = renderToString(
      <ToolGroupRow
        toolNames={["Edit"]}
        status="success"
        inlineDiffs={diffs}
      >
        <div>expanded content</div>
      </ToolGroupRow>,
    )
    expect(html).toContain("diff content")
    expect(html).toContain("tool-group-diffs")
  })

  it("does not render expanded content when collapsed", () => {
    const html = renderToString(
      <ToolGroupRow toolNames={["Read", "Bash"]} status="success">
        <div className="expanded-content">expanded stuff</div>
      </ToolGroupRow>,
    )
    // SSR always renders collapsed state (useState(false))
    expect(html).not.toContain("expanded stuff")
  })

  it("applies error status class", () => {
    const html = renderToString(
      <ToolGroupRow toolNames={["Bash"]} status="error">
        <div>content</div>
      </ToolGroupRow>,
    )
    expect(html).toContain("tool-card-error")
  })

  it("applies success status class", () => {
    const html = renderToString(
      <ToolGroupRow toolNames={["Bash"]} status="success">
        <div>content</div>
      </ToolGroupRow>,
    )
    expect(html).toContain("tool-card-success")
  })

  it("renders correct label with different counts", () => {
    const two = renderToString(
      <ToolGroupRow toolNames={["A", "B"]} status="success">
        <div>x</div>
      </ToolGroupRow>,
    )
    expect(two).toContain("2 tool calls")

    const five = renderToString(
      <ToolGroupRow toolNames={["A", "B", "C", "D", "E"]} status="success">
        <div>x</div>
      </ToolGroupRow>,
    )
    expect(five).toContain("5 tool calls")
  })
})
```

- [ ] **Step 2: Run the new tests**

```bash
cd /Users/andrew/Developer/Prefix/jsonl-fyi && bun test src/transcript/ToolGroupRow.test.tsx
```

Expected: all 7 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/transcript/ToolGroupRow.test.tsx
git commit -m "test: add ToolGroupRow unit tests"
```

---

### Task 7: Verification — type-check, tests, agent-browser

**Files:** none (verification only)

- [ ] **Step 1: Full type-check**

```bash
cd /Users/andrew/Developer/Prefix/jsonl-fyi && bun run tsc --noEmit
```

Expected: clean, zero errors.

- [ ] **Step 2: Full test suite**

```bash
cd /Users/andrew/Developer/Prefix/jsonl-fyi && bun test
```

Expected: all existing tests + new ToolGroupRow tests pass.

- [ ] **Step 3: Start dev server and verify with agent-browser**

```bash
cd /Users/andrew/Developer/Prefix/jsonl-fyi && bun dev &
```

Wait for the server to start, then use the `agent-browser` skill to verify:

1. **Load a Claude fixture with multiple consecutive tools** — drag in a `.jsonl` file that has an assistant message with 2+ `tool_use` blocks in a row. Switch to Chat mode. Verify the DOM shows:
   - A `.tool-group` element containing a `.tool-row.clickable` button
   - Summary text: `"N tool calls — name · name · name"`
   - The individual tool cards are NOT rendered (collapsed state)
   - If an Edit is in the group, `.tool-group-diffs` contains the filename and diff content

2. **Click the group row** — verify the DOM now shows individual tool cards inside `.tool-group-expanded`.

3. **Load a Codex fixture with consecutive function_call entries** — verify the same grouped behavior.

4. **Toggle between Normal/Compact/Chat** — verify Normal and Compact modes are unchanged.

5. **Check console** — no errors or warnings.

Fixture files to use:
- Claude: `src/__fixtures__/` or `~/.claude/projects/<project>/*.jsonl`
- Codex: `src/transcript/__fixtures__/` or `~/.codex/sessions/**/rollout-*.jsonl`

If no fixture has 2+ consecutive tool calls, create a temporary one by concatenating tool_use lines from an existing fixture.

- [ ] **Step 4: Commit any fixture or test adjustments**

Only if tests or verification reveal issues that need fixing.

---

### Task 8: Final cleanup

**Files:** none (verification only)

- [ ] **Step 1: Run full test suite one final time**

```bash
cd /Users/andrew/Developer/Prefix/jsonl-fyi && bun test
```

- [ ] **Step 2: Confirm no uncommitted changes remain**

```bash
cd /Users/andrew/Developer/Prefix/jsonl-fyi && git status
```

Expected: clean working tree, all changes committed.

- [ ] **Step 3: Verify dev server is running**

Confirm `bun dev` is still running on the appropriate port so Andrew can do final manual spot-check.

---

## Out of scope (from spec)

- Chat-bubble / assistant layout changes — not implementing
- Synthesizing natural-language summaries from tool results
- Per-tool-card selective collapse in Chat mode (the group collapses as a unit)
- Write tool inline diff (Write has full content, not old/new — Edit/MultiEdit handle diffs)
