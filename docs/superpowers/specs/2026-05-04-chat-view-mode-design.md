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
`custom_tool_call` entries in the same assistant message collapse into
one summary row instead of rendering as separate bullet rows.

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

### Edit/Write diff inline

If any tool in the collapsed group is an **Edit** or **Write** that produced
a diff, the diff renders inline below the summary line — **even when the
group is collapsed**. This is the key feature: diffs are the content users
need to review, so they peek out.

- **Filename badge**: file path in normal text, placed  
above the diff. No "Edit" or "Write" label — just the path.
- **Diff rendering**: the existing `EditDiff` component, same as in
Normal/Compact modes.
- If multiple Edit/Write tools are in the same group, each renders its
filename + diff below the summary, in order.
- Non-Edit/Write tools (Bash, Read, etc.) remain hidden behind the collapse.

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
3. `**src/transcript/ToolCard.tsx**` — add a `"chat"` viewMode branch for
  the collapsed-state rendering. The group row is a distinct rendering
   mode triggered by a new prop or a wrapper component.
4. New component or logic in the Claude/Codex tool rendering to detect
  consecutive tool runs and group them. This is the main work.

### Architecture sketch

The grouping happens at the transcript level (where the full list of
entries/blocks is visible), not inside ToolCard. Options:

- **Option A (recommended):** Add a pre-pass in `ClaudeCodeTranscript.tsx`
and `CodexTranscript.tsx` that groups consecutive tool entries within
each assistant message into segments. Pass segments to EntryView instead
of individual blocks.
- **Option B:** A new `ToolGroup` wrapper component that receives an array
of tool entries and handles collapse/expand + inline diffs.

Option A is cleaner — it keeps the grouping logic at the transcript level
and lets EntryView/ToolCard remain mostly unchanged.

### Grouping pre-pass

For Claude Code (blocks within a message):

```ts
type ToolGroup = {
  kind: "tool-group"
  tools: ToolUseBlock[]   // consecutive tool_use blocks
}
// A message's blocks become: (TextBlock | ThinkingBlock | ImageBlock | ToolGroup)[]
// Consecutive tool_use blocks → one ToolGroup
```

For Codex (entries within a turn):

```ts
// Consecutive function_call / custom_tool_call entries → one ToolGroup
```

### ToolCard changes

Add a `"chat"` branch to the existing viewMode switch:

```tsx
// ToolCard.Root already reads viewMode. For "chat":
// - If the card is part of a group (new `inGroup` prop), render as summary
// - Single tool cards render same as normal mode
```

### Edit diff inline

A new `ToolGroupRow` component renders:

1. The summary line: `N tool call(s) — name · name · name ▸`
2. Below it: for each Edit/Write in the group that has output, render
  filename badge + `EditDiff`.

### State

- `expanded: boolean` per ToolGroup (same pattern as ToolCard's existing
per-card state).
- Toggling expands all tools in the group.
- ViewMode switching does NOT reset expanded state.

## Out of scope

- Chat-bubble / assistant layout changes
- Synthesizing natural-language summaries from tool results.
- Per-tool-card selective collapse in Chat mode (the group collapses as
a unit).

## Verification

- Unit tests: grouping logic (consecutive tool runs split correctly),
ToolGroupRow rendering, inline Edit diff appears when collapsed.
- `bun run tsc --noEmit` clean.
- No console errors loading existing Claude and Codex fixtures.
- Manual: toggle between Normal/Compact/Chat modes, verify:
  - 2+ consecutive tools → one collapsed row.
  - Single tool → normal card.
  - Edit in a group → filename + diff visible inline.
  - Clicking the row expands to full tool cards.
  - Turn between assistant text and tools is preserved.

