# Plan: prose tool-group summary

Spec: `docs/superpowers/specs/2026-05-11-prose-tool-summary.md`

## Goal

Replace the chip-style `**Read** ×2 · **Edit** ×1 · *Thinking* ×3` summary in
chat-view tool groups with a single muted prose sentence (e.g. *"Ran 3
commands, edited 3 files, created 1 file and thought 3 times"*). Expanding the
group flips the text color from muted to normal and shows the per-item content
below, same as today.

## Architecture

Per-format build step computes `SummaryCounts` and attaches it to the
`tool_group` RenderItem. The shared `ToolGroupRow` renders the prose from
precomputed counts — no categorizer prop-drilled into the component.

```
buildClaudeItems / buildCodexItems / buildPiItems
  └─ categorizeGroupItems(items) → SummaryCounts
        attaches to tool_group RenderItem
ToolGroupRow
  └─ renderProseSummary(counts, thinkingCount) → string
```

## Shared types (new file `src/transcript/groupSummary.ts`)

```ts
export type Category =
  | "command" | "edit" | "create" | "delete" | "read" | "search"
  | "web_fetch" | "web_search" | "subagent" | "subagent_comm"
  | "todo" | "skill"

export type SummaryCounts = Partial<Record<Category, number>>

// Builds the prose string. Pure, format-agnostic.
export function renderProseSummary(
  counts: SummaryCounts,
  thinkingCount: number,
): string | null  // null when all-zero
```

## Tasks (ordered)

### 1. Shared renderer + tests
- Add `src/transcript/groupSummary.ts` with `Category`, `SummaryCounts`, and
  `renderProseSummary`.
- Tests at `src/transcript/groupSummary.test.ts`:
  - each category alone, singular ("Ran 1 command") and plural ("Ran 3 commands")
  - pairs ("Ran 3 commands and edited 1 file")
  - 3+ items joined with commas + final " and "
  - capitalization: first non-thinking item sentence-cased
  - thinking standalone: "Thought once" / "Thought N times"
  - thinking appended: " and thought once" / " and thought N times"
  - all-zero (no tools, no thinking) → `null`
  - zero-count buckets skipped
  - fixed ordering per the spec table

### 2. Claude categorizer + tests
- Add `src/transcript/claude/categorize.ts` exporting
  `categorizeClaudeGroupItem(item) → Category` and
  `summarizeClaudeGroup(items) → SummaryCounts`.
- Table-driven `Record<string, Category>` per the Claude classification table
  in the spec, default `command`.
- Tests at `src/transcript/claude/categorize.test.ts`:
  - one row per spec table entry
  - unknown name → command

### 3. Codex categorizer + tests
- Add `src/transcript/codex/categorize.ts` with
  `summarizeCodexGroup(items) → SummaryCounts`.
- `apply_patch` is routed per file: parse via existing `parseV4A`, then for
  each non-skipped file route `op=add → create`, `op=update → edit`,
  `op=delete → delete`. One call may contribute to multiple categories.
- `mcp__*` namespaced → command.
- Tests at `src/transcript/codex/categorize.test.ts`:
  - one row per spec table entry
  - apply_patch with mixed ops produces split counts
  - mcp namespaced → command
  - unknown → command

### 4. Pi categorizer + tests
- Add `src/transcript/pi/categorize.ts` with
  `summarizePiGroup(items) → SummaryCounts`.
- Tests at `src/transcript/pi/categorize.test.ts`:
  - one row per spec table entry
  - unknown → command

### 5. Attach counts to tool_group RenderItems
- In `buildCodexItems`, when emitting a `tool_group`, also compute
  `summary = summarizeCodexGroup(run)` and include it on the item.
  Equivalent change in `buildClaudeItems` and `buildPiItems`.
- Extend the `RenderItem` type in each format (or a shared one) so the
  `tool_group` variant carries `summary: SummaryCounts` and
  `thinkingCount: number`.
- Update per-format build tests to assert summary counts on a representative
  group.

### 6. Render prose in ToolGroupRow
- In `src/transcript/ToolGroupRow.tsx`:
  - Replace the chip rendering of `summarizeItems(items)` with
    `renderProseSummary(summary, thinkingCount)`.
  - Count tool items with `status === "error"` and append
    ` (N failure[s])` to the prose when > 0.
  - Drop the status-class wrapper (`tool-card-success/error/mixed`) — no
    colored status dot on the row anymore.
  - The collapsed row text is muted; expanded row uses normal color (CSS).
  - Keep the click-to-expand behavior.
- Drop `summarizeItems` and `SummaryEntry` (no longer used) — verify with grep.
- Update `ToolGroupRow.test.tsx`: prose rendering, failure suffix, no status
  classes.

### 7. CSS tweak
- Replace existing `.tool-title-name` / `.tool-title-thinking` / `.tool-title-detail`
  rules with a `.tool-title-prose` rule:
  - muted color by default
  - normal color when the parent `.tool-group-row[aria-expanded="true"]`
- Verify in the worktree dev server against fixtures for all three formats.

### 8. Verification
- Visual pass on /examples for each format (Claude, codex, pi):
  - thinking-only group → "Thought once" / "Thought N times"
  - mixed group → prose reads correctly
  - all-edits group, all-commands group, mixed-op apply_patch
- All tests pass: `bun test` + `bun run tsc --noEmit`.

## Acceptance criteria

- Every tool-group row in chat mode shows a single muted prose sentence.
- Expanding the row reveals per-item content and changes the prose color.
- Zero counts never appear; all-zero groups have no summary text.
- All three formats produce the spec-defined phrasing.
- Unit tests cover all spec rows, edge cases (singular/plural/once/all-zero),
  and the apply_patch per-file routing.

## Out of scope

- Detecting Claude `Write` overwrites vs creates (deferred per spec).
- Distinguishing MCP tools beyond bucketing as command.
- Counting subagent activity by unique `agent_id` (start with call-count; can
  refine later if it shows up in real transcripts as duplication).
