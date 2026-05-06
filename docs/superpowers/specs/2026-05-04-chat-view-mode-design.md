# Chat view mode — per-message tool call grouping

Status: spec / pre-implementation
Scope: introduce a "Chat" view-mode that collapses consecutive tool calls
in an assistant message into a single summary row, with Edit/Write diffs
showing inline.

## Setting

Extend `ViewMode` in `src/settings.tsx`:

```ts
export type ViewMode = "compact" | "normal" | "chat"
```

- Default remains `"normal"`. User opts into Chat via the settings popover.
- Persisted under the existing `jsonl-fyi:settings` key — no migration.

UI: `SettingsPopover.tsx` adds a third `<option>` below the existing two:
"Chat". Order: Normal, Compact, Chat.

## Layout

Chat mode reuses the existing transcript layout and styling exactly —
it is **not** a chat-bubble or messaging-style layout. Specifically:

- **User messages**: right-aligned `--color-user-bubble` bubble (unchanged
from Normal/Compact).
- **Assistant text**: `●` bullet + text (unchanged from Normal/Compact).
- **Turn separators**: unchanged position (bottom of each turn) and style.
- **Individual tool cards**: unchanged rendering when visible.

The **only** layout change: consecutive `tool_use` / `function_call` /
`custom_tool_call` entries between user-visible content collapse into
one summary row instead of rendering as separate bullet rows.

### Grouping boundaries

A "tool run" is the contiguous sequence of tool calls between two
user-visible content boundaries. The boundaries are:

- A real user message (user-typed input — NOT a synthesized
  tool_result-only entry that the harness emits to pair with a tool
  call).
- An assistant **text** or **image** block (the user-visible response
  content).
- The end of the transcript.

Notably:

- **Thinking blocks do not flush** — thinking is internal scaffolding,
  conceptually part of the tool run, not a response.
- **tool_result-paired user entries do not flush** — Claude emits
  synthesized "user" messages whose only content is `tool_result` blocks
  to satisfy the API's strict alternation; these are part of the run
  bookkeeping, not the user's input.
- This means a run can span multiple assistant messages. For Claude and
  Pi (where the harness emits one tool call per assistant message), this
  is the only way grouping triggers in practice. For Codex (where
  multiple `function_call` entries appear consecutively at the top
  level), the within-turn grouping is the same shape under this rule.

## Collapsed tool group

When two or more tool calls appear consecutively in a single assistant
message, they merge into one row:

```
● 3 tool calls — Read · Edit · Bash
  src/App.tsx
  ┌─────────────────────┐
  │ - const old = "x"  │   ← Edit diff inline (if present)
  │ + const fixed = "y" │
  └─────────────────────┘
```

### Summary line format

- **Collapsed label**: `<N> tool call(s)` (pluralized: "1 tool call",
"3 tool calls").
- **Tool name list**: `name · name · name` — the names in order they were  
called, separated by middle dots. Tool names are the canonical short names  
(Bash, Read, Edit, Write, etc.) in normal text style.
- **Toggle affordance**: None yet, same as other collapsables.
- **Bullet color**: inherited from the aggregate status of the tools in the  
group (success → green, error → red, mixed → split green|red).

### Inline diffs

If any tool in the collapsed group produced a structured diff, that diff
renders inline below the summary line — **even when the group is
collapsed**. This is the key feature: diffs are the content users need to
review, so they peek out.

The set of tools that emit inline diffs:

- **Claude**: `Edit`, `MultiEdit` → `EditDiff`. `Write` keeps its existing
rendering (no inline diff in v1; future work).
- **Codex**: `apply_patch` → `PatchDiff` per file in the patch.
- **Pi**: `edit` → `EditDiff` per `arguments.edits[]` entry. (Pi `edit` is
also upgraded in Normal mode to use `EditDiff` instead of the current
generic-file fallback — a small Normal-mode improvement bundled with this
work.) Pi `write` keeps its existing rendering.

Rules:

- **Filename badge**: file path in normal text, placed above the diff. No
"Edit" / "Write" / "apply_patch" label — just the path.
- If multiple diff-producing tools appear in the same group, each renders
its filename + diff below the summary, in order.
- Non-diff tools (Bash, Read, etc.) remain hidden behind the collapse.

### Expand behavior

Clicking the summary line expands the group, revealing **all**
tool cards with their full content. When expanded:

- Every tool in the group renders as a full card (same as Normal mode).
- Edit/Write diffs that were already visible inline remain visible as part
of the expanded card (not duplicated).

## Single-tool messages

If an assistant message has only one tool call, it renders as a normal
tool card (same as Normal mode) — no grouping row. The grouping only
applies to runs of 2+ consecutive tools.

## Non-consecutive tools

If assistant text appears between tool calls (e.g., text → tool → text →
tool), only the consecutive runs within each block are grouped. Example
sequence:

```
[Assistant text 1]
[Tool A]         ─┐
[Tool B]          ├─ collapses to "2 tool calls — A · B"
[Tool C]         ─┘
[Assistant text 2]
[Tool D]         → renders as single tool card (1 tool, no collapse)
```

## Implementation

### What changes

1. `**src/settings.tsx**` — add `"chat"` to `ViewMode`.
2. `**src/SettingsPopover.tsx**` — add "Chat" option to the `<select>`.
3. `**src/transcript/ToolCard.tsx**` — treat `"chat"` like `"normal"` in the
   collapsed-body branch so single tool cards show their preview.
4. `**src/transcript/grouping.ts**` (new) — defines the format-agnostic
   `ToolDiff` data type used to describe inline diffs (no JSX).
5. `**src/transcript/ToolGroupRow.tsx**` (new) — presentational component
   that takes plain data + render callbacks; turns `ToolDiff` values into
   `EditDiff` / `PatchDiff` elements and renders the expanded cards via a
   format-supplied callback.
6. `**src/transcript/pi/PiEditTool.tsx**` (new) — promotes pi `edit` to
   structured `EditDiff` rendering. Used in both Normal and Chat modes.
7. Pure preprocessor functions per format (`timing.ts` for Claude;
   `buildCodexItems.ts` and `buildPiItems.ts` new) — produce a `RenderItem[]`
   that includes `tool_group` items containing **plain data** (no
   `ReactNode`). This is the main work.

### Architecture

Grouping happens in **pure preprocessor functions** called by each
transcript component, following the same pattern as the existing
`buildTranscriptItems` in `timing.ts`. The preprocessor returns plain data —
**no React or JSX** — so it is trivially testable, comparable, and
serializable. UI assembly happens at the render layer.

#### Shared `ToolDiff` data type

Format-agnostic vocabulary for inline diffs, defined once in
`src/transcript/grouping.ts`. Each `ToolDiff` represents exactly one
file-level diff; tools that produce multiple file-level diffs (a
`MultiEdit` with 3 edits, an `apply_patch` touching 4 files) carry an
array of them.

```ts
export type ToolDiff =
  | { kind: "edit"; filePath: string; oldString: string; newString: string }
  | {
      kind: "patch"
      filePath: string
      patch: string                  // unified-diff text for this single file
      op: "add" | "update" | "delete"
    }
```

Each `ToolDiff` is one file-level diff. The renderer reads `filePath`
directly off the variant for the badge.

- Claude `Edit` → 1 `ToolDiff` (`kind: "edit"`).
- Claude `MultiEdit` with N edits → N `ToolDiff`s, all sharing the same
  `filePath`.
- Codex `apply_patch` touching N files → N `ToolDiff`s, each its own
  `filePath`, each `kind: "patch"` with `op` matching V4A
  (`"add" | "update" | "delete"`). **`delete` files are filtered from the
  inline peek in v1** — they have no diff body. Tracked in future work.
- Pi `edit` with N edits → N `ToolDiff`s.

#### Per-format `RenderItem.tool_group`

Each format owns its own `RenderItem` union with structurally identical
`tool_group` items. Each tool in the group carries its own list of
`FileDiff`s (0..N) so the per-tool association survives expansion — when
expanded, each tool's card knows exactly which diffs it produced.

The collapsed inline peek is computed by flattening `tools[].diffs`
across the group at render time; this is a one-liner in `ToolGroupRow`
and not part of the data model.

```ts
// Claude
type ClaudeToolGroup = {
  kind: "tool_group"
  tools: Array<{
    name: string                     // "Read", "Edit", "Bash", …
    status: "success" | "error"      // from ToolResult.isError
    diffs: ToolDiff[]                // 0..N file-level diffs produced by this tool
    block: ToolUseBlock              // source tool_use block; renderer turns into a card
  }>
}

// Codex
type CodexToolGroup = {
  kind: "tool_group"
  tools: Array<{
    name: string                     // payload.name (e.g. "shell", "apply_patch")
    status: "success" | "error"
    diffs: ToolDiff[]
    entry: CodexResponseItem
  }>
}

// Pi
type PiToolGroup = {
  kind: "tool_group"
  tools: Array<{
    name: string                     // "edit", "bash", …
    status: "success" | "error"
    diffs: ToolDiff[]
    call: PiToolCallContent
  }>
}
```

Notably absent: `ReactNode` fields. Tests can assert against `tools[].diffs`
directly without rendering.

Why per-tool: if two tools in the same group touch the same file (e.g. an
`Edit` followed by another `Edit` un-doing it), keeping `diffs` per-tool
preserves the ordering and lets the expanded view show each card with its
own diff via the existing `<Tool>` rendering. A flat group-level diff list
would lose that association.

- `ClaudeCodeTranscript` pre-pass: iterates `MessageEntry` blocks, detects
  consecutive `tool_use` runs, resolves each against the `results` map,
  emits `tool_group` items interleaved with `"entry"` items for non-tool
  content.
- `CodexTranscript` pre-pass: iterates `CodexEntry[]`, detects consecutive
  `function_call` / `custom_tool_call` entries, resolves each against the
  `results` map, emits `tool_group` items interleaved with `"entry"`
  items for non-tool entries.
- `PiTranscript` pre-pass: iterates `session.activeEntries`, detects
  consecutive `toolCall` content blocks within an assistant message, emits
  `tool_group` items + a `skipBlocks` map so the entry render skips the
  grouped blocks.

The render loop in each transcript component maps over items:
`"header"` → `TranscriptHeader`, `"entry"` → `EntryView`,
`"tool_group"` → format-specific `ToolGroupRow` wrapper,
`"separator"` → `TurnSeparator`.

### Existing pre-passes

The Claude transcript component currently runs two pre-passes inline
(results map, skill body absorption). The Codex transcript component runs
five inline pre-passes (results, agentNicknames, durations, usages,
modelLabels). The Pi transcript component runs one (results). All of these
move into the new pure preprocessor functions so each transcript component
is a thin caller + renderer — matching the intent of `buildTranscriptItems`.

### ToolGroupRow component

Presentational. Takes plain data + render callbacks.

```tsx
type Props<T> = {
  tools: Array<{
    name: string
    status: "success" | "error"
    diffs: ToolDiff[]
    data: T
  }>
  renderDiff: (diff: ToolDiff) => ReactNode
  renderCard: (data: T) => ReactNode
}
```

Each format provides a thin wrapper that closes over its renderers (e.g.
`ClaudeToolGroupRow`, `CodexToolGroupRow`, `PiToolGroupRow`). `renderDiff`
is shared logic — `kind: "edit"` → `EditDiff`; `kind: "patch"` →
`PatchDiff` — and lives as a shared helper in `grouping.ts` or a sibling
`renderToolDiff.tsx`.

Behavior:

1. The summary line: `N tool call(s) — name · name · name`, where N is
   `tools.length` (no ▸ toggle indicator — same clickable affordance as
   existing collapsibles).
2. Aggregate status from `tools[].status` (success/error/mixed) drives the
   bullet color.
3. **Collapsed inline peek**: flatten `tools.flatMap(t => t.diffs)` and
   render each `ToolDiff` as filename badge (from `diff.filePath`) +
   `renderDiff(diff)`.
4. **Expanded**: hide the inline peek; render `renderCard(data)` for each
   entry in `tools`. Each card shows its own diffs via the existing tool
   components, so per-tool association is preserved on expand.

### State

- `expanded: boolean` per ToolGroupRow (same `useState` pattern as
  ToolCard).
- Toggling expands all tools in the group.
- ViewMode switching does NOT reset expanded state.

## Out of scope

- Chat-bubble / assistant layout changes.
- Synthesizing natural-language summaries from tool results.
- Per-tool-card selective collapse in Chat mode (the group collapses as a
  unit).
- Inline diff for `Write` (Claude) and `write` (pi) — these keep their
  existing rendering. Tracked as future work; the `ToolDiff` type is
  forward-compatible (a future `kind: "create"` or similar could carry the
  full file body once we decide how to render it).

## Verification

**Regression gate:** Normal and Compact modes must render byte-identically
to `main` for **Claude and Codex**. The preprocessor refactor and
`ToolCard` change must be invisible outside Chat mode. Verify by capturing
`document.querySelector('.transcript').outerHTML` on `main` and on the
feature branch and diffing.

**Pi exception:** Pi `edit` rendering changes in Normal mode (now uses
`EditDiff`); document the change in the PR. Everything else in pi Normal /
Compact must remain identical.

**Preprocessor tests:** because the preprocessor returns plain data,
grouping correctness is asserted directly against `RenderItem[]` values —
no rendering required. Example:

```ts
const { items } = buildTranscriptItems(entries, { viewMode: "chat" })
const group = items.find(i => i.kind === "tool_group")!
expect(group.tools.map(t => t.name)).toEqual(["Read", "Edit", "Bash"])
expect(group.tools[1].diffs).toEqual([
  { kind: "edit", filePath: "src/foo.ts", oldString: "x", newString: "y" },
])
```

### Automated

- Unit tests on the pure preprocessors per format (Claude, Codex, Pi):
  consecutive-run detection, `ToolDiff` extraction (Edit/MultiEdit,
  apply_patch, pi edit), aggregate status, viewMode gating.
- `ToolGroupRow` rendering tests over plain data fixtures (no transcript
  parsing required).
- `bun run tsc --noEmit` clean.
- Existing test suite passes with no changes to snapshots or assertions.

### Manual (agent-browser, DOM inspection)

1. **Normal/Compact regression — Claude & Codex:** Load a fixture in each
   mode. Capture `.transcript` outerHTML on `main`, then on the feature
   branch. Diff must be empty.
2. **Normal/Compact regression — Pi:** Diff allowed only inside elements
   rendering pi `edit` calls (now `PiEditTool`/`EditDiff`). Document the
   change.
3. **Chat mode — Claude:**
   - 2+ consecutive tools → one collapsed row in a `.tool-group`.
   - Single tool → normal card (same as Normal mode).
   - Edit/MultiEdit in a group → filename + `EditDiff` inline in
     `.tool-group-diffs`.
   - Clicking the row expands to full individual tool cards.
   - Turn separator between assistant text and tools is preserved.
4. **Chat mode — Codex:**
   - 2+ consecutive function/custom tool calls → one `.tool-group`.
   - `apply_patch` in a group → `PatchDiff` per file inline in
     `.tool-group-diffs`.
   - Click expand → individual entry cards appear.
5. **Chat mode — Pi:**
   - 2+ consecutive `toolCall` blocks → one `.tool-group`.
   - `edit` in a group → `EditDiff` per edit inline in
     `.tool-group-diffs`.
   - Click expand → individual `PiTool` cards (incl. `PiEditTool`) appear.
6. **Mixed-status bullet:** when a group contains both a successful and a
   failing tool, the bullet renders the gradient (`.tool-card-mixed`).
7. **Console:** No errors or warnings loading any fixture in any mode.

