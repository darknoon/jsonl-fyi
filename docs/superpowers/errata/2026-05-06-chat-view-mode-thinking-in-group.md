# Chat view mode: collapse thinking into the tool group

**Date:** 2026-05-06
**Re:** `docs/superpowers/specs/2026-05-04-chat-view-mode-design.md`
**Status:** errata / mini-plan

## Background

The shipped chat-view-mode treats `thinking` blocks as run-extending (they don't flush a tool run) but **renders them outside** the group as ordinary `●` bullets in the transcript. Andrew's intent: thinking should also collapse into the same group as the surrounding tool calls — visible alongside the tool cards when expanded, hidden in the collapsed peek.

The shipped behavior:

```
● 5 tool calls — Read · Edit · Bash · Read · Edit
  .../src/foo.ts  [diff peek]
● Thinking: "Let me check the imports..."     ← currently leaks out
● 3 tool calls — Read · Bash · Read
```

The intended behavior:

```
● 5 tool calls — Read · Edit · Bash · Read · Edit
  .../src/foo.ts  [diff peek]
  (thinking hidden in collapsed state; appears inline among the cards on expand)
```

## Boundary semantics — unchanged

- Real user message → flush.
- Assistant text or image → flush.
- Synthesized tool_result-only user entry → does not flush.
- **Thinking → does not flush, AND is now absorbed into the group.**
- End of stream → flush.

## Data model change

Each tool group's `tools` list is currently an array of `{ name, status, diffs, data }`. Thinking blocks need a place to live. Two options:

**A. Heterogeneous group items** — let the group carry an ordered list of tool-or-thinking entries:

```ts
type ClaudeGroupItem =
  | { kind: "tool"; name; status; diffs; block: ToolUseBlock }
  | { kind: "thinking"; entry: MessageEntry; blockIndex: number }

type ClaudeToolGroup = {
  kind: "tool_group"
  items: ClaudeGroupItem[]   // was `tools`
}
```

The summary line still shows `N tool call(s) — name · name · ...` (counts only tools, not thinking). Expanded view renders items in order, dispatching on `kind`.

**B. Parallel arrays** — keep `tools[]`, add `thinkings[]` with their position offsets so the renderer can interleave.

A is cleaner — the order is already encoded in the array. Use A.

## Implementation tasks

### 1. Update shared types

`src/transcript/ToolGroupRow.tsx` — generalize `Props<T>` to take heterogeneous items + a render callback that knows how to dispatch:

```ts
type GroupItem<T> =
  | { kind: "tool"; name: string; status: "success" | "error"; diffs: ToolDiff[]; data: T }
  | { kind: "thinking"; data: T }

type Props<T> = {
  items: GroupItem<T>[]
  renderToolCard: (data: T) => ReactNode
  renderThinking: (data: T) => ReactNode
}
```

Summary label/list derived only from items where `kind === "tool"`. Aggregate status likewise.

Inline diff peek and expanded view: walk `items[]`. For tools, render diff (peek) or `renderToolCard(data)` (expanded). For thinking, render nothing in peek, `renderThinking(data)` in expanded.

The `data` type may need to be a union per format if `T` differs between tool and thinking — likely cleanest: a discriminated union per format with shared `T = ClaudeGroupItemData = ToolUseBlock | { entry, blockIndex }`. Or split into two generic params `<TTool, TThinking>`. Pick whichever pattern reads cleanly when implementing.

### 2. Claude preprocessor (`src/transcript/timing.ts`)

In the existing chat-mode walk:

- Maintain a `currentRun` of group items (tools + thinkings) instead of just tools.
- For each `tool_use` block: push `{ kind: "tool", ... }`.
- For each `thinking` block: push `{ kind: "thinking", entry, blockIndex }`. Add `${entry.uuid}:${blockIndex}` to `skipKeys` so EntryView skips it.
- Boundary semantics unchanged: text/image/real-user flushes.
- `flushRun()` emits a `tool_group` only if **at least 2 tool items** are in the run. Solo-thinking runs are not groups; if a run has 1 tool + N thinking, it's still a single tool message — render normally (which means: don't add anything to skipKeys, the entry renders the thinking + tool inline as before). Decision below clarifies.

**Sub-decision: when run has only 1 tool but 1+ thinking, do we group?**

The user's intent is that thinking should be visually attached to the tool cluster. If we have `[think, tool]` (one tool, one thinking) in a single message, the tool is alone — no group emitted under the existing 2+ rule. Two ways to handle:

- (i) Keep 2+ rule; thinking renders normally next to its solo tool. Inconsistent with the intent for runs with multiple thinkings.
- (ii) Trigger group emission when `tools >= 2 OR (tools >= 1 AND thinkings >= 1)`. This keeps thinking absorbed even in single-tool messages.
- (iii) Trigger group on `tools + thinkings >= 2`. But pure-thinking runs (no tools) shouldn't make a group either.

(ii) matches the intent best. Implement (ii).

### 3. Pi preprocessor (`src/transcript/pi/buildPiItems.ts`)

Same change. Pi `PiContent` already has a `thinking` block type (`PiThinkingContent`). The preprocessor walks `PiAssistantMessage.content` and currently handles `toolCall` → run, `text`/`image` → flush, `thinking` → noop. Change `thinking` to push a `{ kind: "thinking", entry, blockIndex }` item AND add `entry.id`/`blockIndex` to `skipBlocks` so `PiEntryView` skips it.

### 4. Codex preprocessor (`src/transcript/codex/buildCodexItems.ts`)

Codex's "thinking" lives in `response_item` payloads of type `reasoning` (verify against `src/transcript/codex/types.ts`). They're top-level entries between `function_call`/`custom_tool_call` items, not nested in messages.

Currently, a `reasoning` entry between two function_calls would not break the run (since `isToolPayload` only matches function_call/custom_tool_call — but the cross-entry walk logic checks for tool entries to extend the run; a non-tool entry between them would END the run prematurely).

**Audit step:** check `buildCodexItems.ts` to see what happens when a `reasoning` entry sits between two function_calls. If the run currently ends, fix it: extend the run-detection to also include reasoning entries, but mark them as `kind: "thinking"`. The `isToolPayload` predicate becomes `isToolOrReasoningPayload`, and the items pushed into the group differentiate.

If reasoning entries don't currently appear inside Codex tool runs in real fixtures, we may defer Codex's thinking-absorption — but it's worth implementing for symmetry and future-proofing.

### 5. Format-specific wrappers

`ClaudeToolGroupRow`, `CodexToolGroupRow`, `PiToolGroupRow` each adapt their items array into the new heterogeneous shape and pass `renderToolCard` + `renderThinking` callbacks:

```tsx
renderThinking={(data) => <ThinkingBlock text={data.text} />}
```

For Claude/Pi, `renderThinking` reads the `thinking` text from the entry's blocks at `blockIndex`. For Codex, the reasoning payload is the source.

### 6. Tests

Update + add:

- `src/transcript/timing.test.ts`: a thinking block within a Claude tool run is absorbed (skipKeys contains it; the resulting `tool_group.items` includes a `kind: "thinking"` entry; group emits even with 1 tool + 1 thinking).
- `src/transcript/pi/buildPiItems.test.ts`: same for pi.
- `src/transcript/codex/buildCodexItems.test.ts`: reasoning between two function_calls extends the run.
- `src/transcript/ToolGroupRow.test.tsx`: heterogeneous items render — tools in summary count, thinkings only on expand, peek skips thinkings.

### 7. Manual verification (agent-browser)

- Claude fixture with `[thinking, tool, tool, thinking, tool]` in successive assistant messages → one group, summary "3 tool calls — ...", thinkings absent in collapsed peek, present (in order) in expanded view among the tool cards.
- Pi fixture similar.
- Codex: confirm reasoning entries no longer break runs.
- Single-tool-with-thinking message in chat mode → one group emitted (per decision (ii)), thinking absorbed.

## Out of scope

- Thinking inside the **inline peek** (collapsed state). Thinking is long-form; keep it expanded-only.
- Codex `reasoning` summaries vs full reasoning — render whatever Codex's existing `EntryView` renders for the reasoning payload; no new formatting.

## File touch list (estimate)

- `src/transcript/grouping.ts` — possibly extend types if `GroupItem` lives here.
- `src/transcript/ToolGroupRow.tsx` — generalize Props.
- `src/transcript/timing.ts` — Claude preprocessor.
- `src/transcript/claude/ClaudeToolGroupRow.tsx` — wrapper update.
- `src/transcript/pi/buildPiItems.ts` — Pi preprocessor.
- `src/transcript/pi/PiToolGroupRow.tsx` — wrapper update.
- `src/transcript/codex/buildCodexItems.ts` — Codex preprocessor.
- `src/transcript/codex/CodexToolGroupRow.tsx` — wrapper update.
- Tests in each `.test.ts(x)` mentioned above.

Roughly one focused subagent task; ~150-300 LOC of changes.
