# View modes — Normal preview design

Status: spec / pre-implementation
Scope: introduce a global view-mode setting and a "Normal" rendering for
tool calls that mimics Claude Code's terminal UI. Defers Expanded and Raw
modes to a follow-up.

References:

- [`docs/research/transcript-viewer-normal-tool-ui-spec.md`](../../research/transcript-viewer-normal-tool-ui-spec.md) — Claude Code TUI behavior.
- [`docs/research/tui-inline-tool-call-rendering.md`](../../research/tui-inline-tool-call-rendering.md) — Codex TUI behavior.

## Goal

Today every tool call renders header-only with click-to-expand. That's
"Compact" — useful for skimming long transcripts, but hides too much
content at a glance. Normal mode keeps the page short while showing each
tool's most informative slice inline (a 3-line stdout tail, a full diff, a
checklist count) so a reader can scan the transcript without clicking on
every row.

## Out of scope

- **Expanded mode**: every body always rendered, no click-to-toggle.
- **Raw mode**: pretty-printed JSON per entry.

Both will land later. The setting is designed to extend to four values;
this PR only ships two of them.

## Setting

Extend `Settings` in `src/settings.tsx`:

```ts
export type ViewMode = "compact" | "normal"
export type Settings = {
  renderMarkdown: boolean
  viewMode: ViewMode
}
```

- Default: `"normal"` for new users. The `load()` helper already merges
  with `DEFAULTS`, so existing localStorage payloads without the field
  inherit the new default on next load.
- Persisted under the existing `jsonl-fyi:settings` key — no migration.
- A setter `setViewMode(v: ViewMode)` joins the context.

UI: `SettingsPopover.tsx` adds a dropdown (native `<select>` matches the
existing controls' visual weight). Label: "View mode". Options:
"Compact", "Normal". Sit it above the existing Markdown toggle.

## ToolCard API change

One new slot. No new flags.

```tsx
// New: ToolCard.Preview slot
<ToolCard.Root hasContent={...} status={...}>
  <ToolCard.Trigger>...</ToolCard.Trigger>
  <ToolCard.Preview>...short body...</ToolCard.Preview>     {/* NEW */}
  <ToolCard.Content>...full body...</ToolCard.Content>
</ToolCard.Root>
```

`ToolCard.Root` reads `viewMode` via `useSettings()`. Render rules below
the trigger:

| `viewMode` | `expanded` | Renders                              |
| ---------- | ---------- | ------------------------------------ |
| `compact`  | false      | nothing                              |
| `compact`  | true       | `Content` if present, else `Preview` |
| `normal`   | false      | `Preview` if present, else nothing   |
| `normal`   | true       | `Content` if present, else `Preview` |

The three meaningful tool configurations:

1. **Both slots** — small preview + larger expanded body (Bash, Read, Write, etc.).
2. **Preview only, no Content** — preview already shows the whole body
   (Edit, MultiEdit, NotebookEdit, ExitPlanMode, `apply_patch`, `view_image`).
3. **Neither** — no inline body in any mode (EnterPlanMode).

### Trigger clickability

The trigger is clickable iff toggling `expanded` would change the
rendering. Concretely: clickable iff `Content` is present, OR (`Preview`
is present AND `viewMode === "compact"`). When a tool declares only
`Preview` and the user is in Normal mode, the trigger is non-clickable
(no caret, no hover affordance) — there is nothing more to reveal.

The existing `hasContent` prop continues to suppress clickability when
the tool has no inline body at all (configuration 3).

### Per-card state model

`expanded: boolean` continues to live in `ToolCard.Root` (existing
behavior). It persists across global mode toggles — switching between
Compact and Normal does not reset expanded cards.

To get a card down to header-only, the user switches to Compact. There is
no per-card "fully collapse" affordance in Normal.

## Per-tool Normal previews

Header rendering (the `(detail)` parens) is unchanged from today unless
called out. The "Body" column is what goes in `<ToolCard.Preview>`.

### Claude Code tools

| Tool          | Header detail                                  | Preview body                                                                                    |
| ------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Bash          | command (capped via existing CSS)              | last 3 logical lines of `output.text`; on error, last 10; if more remain, append `<MoreHint/>`  |
| Read          | short path                                     | one line: `Read N lines`; `(no output)` if empty                                                |
| Edit          | short path                                     | full `EditDiff` (no `Content`)                                                                  |
| MultiEdit     | short path                                     | all diffs (no `Content`)                                                                        |
| Write         | short path                                     | first 10 logical lines of `input.content` + `<MoreHint/>` if longer                             |
| Glob          | pattern                                        | one line: `Found N file(s)`                                                                     |
| Grep          | pattern                                        | one line: `Found N match(es)`; for `output_mode === "files_with_matches"` use `Found N file(s)` |
| WebFetch      | url                                            | one line: first non-empty line of `output.text`; fallback `Fetched`                             |
| WebSearch     | query                                          | one line: link count from `output.text`; fallback first line                                    |
| Task / Agent  | description                                    | first 3 logical lines of `output.text` + `<MoreHint/>`                                          |
| NotebookEdit  | path@cell                                      | full new cell source (no `Content`)                                                             |
| EnterPlanMode | —                                              | no preview, no content                                                                          |
| ExitPlanMode  | —                                              | full plan markdown (no `Content`)                                                               |
| TodoWrite     | `activeForm` of in-progress todo, or no parens | one line: `M / N complete`                                                                      |
| Skill         | skill name                                     | first line of skill `description:` from `output.injectedText` (line-clamp 1)                    |
| ToolSearch    | query                                          | one line: `Loaded N tool(s)` from `output.toolRefs.length`; `No tools loaded` if zero           |
| Unknown / MCP | name                                           | first 3 logical lines of `output.text` + `<MoreHint/>`                                          |

### Codex tools

| Tool                                       | Header detail                                                         | Preview body                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `shell_command` / `exec_command` / `shell` | command (joined for `shell`)                                          | last 3 logical lines of `output.text`; on error, last 10; `<MoreHint/>` if more |
| `apply_patch`                              | path                                                                  | full patch via existing `ApplyPatch` (no `Content`)                             |
| `update_plan`                              | `input.explanation` if present                                        | one line: `M / N complete`                                                      |
| `view_image`                               | basename                                                              | image inline (existing) (no `Content`)                                          |
| `spawn_agent`                              | `agent_type`                                                          | one line: `<nickname> · <message>` (line-clamp 1); fallback `<nickname>`        |
| `wait_agent`                               | nicknames resolved via earlier `spawn_agent` outputs, else target IDs | see "wait_agent output handling" below                                          |
| `web_search` (custom)                      | query                                                                 | no preview, no content                                                          |

### Truncation rules

JS slices logical lines (newline-delimited). CSS bounds visual height.

**Single-line summaries** (Skill description, WebFetch first line,
spawn_agent message, wait_agent agent message, etc.) use:

```css
.tool-preview-line {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

**Multi-line snippets** (Bash tail, Write head, Agent head, MCP head) use
`-webkit-line-clamp` to bound visual lines regardless of wrapping. JS
hands the snippet at most N logical lines; CSS caps the rendered box at
`L` visual lines:

| Snippet                    | Logical-line slice | Visual-line cap (CSS) |
| -------------------------- | ------------------ | --------------------- |
| Bash tail                  | 3 (10 on error)    | 6 (12 on error)       |
| Write head                 | 10                 | 10                    |
| Agent / MCP / Unknown head | 3                  | 6                     |

`<MoreHint count={n}/>` renders the `… +N lines` row underneath any
clipped snippet.

```css
.tool-preview-snippet {
  display: -webkit-box;
  -webkit-line-clamp: 6; /* per-tool override */
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
}
```

### `wait_agent` output handling

Real Codex sessions show the output is sometimes JSON, sometimes a plain
string. The component tries `JSON.parse(output.text)`:

- **Parse failure** (string output, e.g. `"aborted by user after 274.4s"`)
  → render the string as a single line-clamp-1 preview.
- **JSON, populated `status` map** → render one line per agent:
  `<nickname-or-id>: <status-name>` with optional message preview after a
  middle dot (line-clamp 1 each). Status variants: `Completed { message }`,
  `Errored { error }`, `InProgress`, `NotFound`.
- **JSON, empty `status` and `timed_out: true`** → render
  `Timed out after Ns` (using `input.timeout_ms`).
- **JSON, empty `status` and `timed_out: false`** (unobserved) →
  `(no agent results)`.

### Nickname resolution pre-pass

`CodexTranscript.tsx` already pre-passes entries to index outputs by
`call_id`. Add a sibling pass: walk `function_call` entries with
`name === "spawn_agent"`, parse each output as JSON, and build
`agentNicknames: Map<agent_id, nickname>`. The `WaitAgent` and any future
collab components take this map as a prop and use it to display friendly
names instead of UUIDs.

## Helpers

```ts
// src/transcript/preview.ts (new)
export function tailLines(text: string, n: number): { text: string; remaining: number }
export function headLines(text: string, n: number): { text: string; remaining: number }
export function parseFrontmatter(text: string): Record<string, string> | undefined
```

`tailLines` and `headLines` are O(N) splits; they return the joined slice
plus the count of unrendered lines for `<MoreHint/>`. Pure functions,
unit-tested.

`parseFrontmatter` parses the YAML block between leading `---` fences into
a flat `key → string-value` map. Folded multi-line values (continuation
lines indented further than the key) are joined into the value until a
blank line or another key is hit. Returns `undefined` if no frontmatter
block is present. The Skill preview reads `description`; the dispatcher
may also read `name` to override the input's `skill` field if more
accurate.

## Common components

- `<MoreHint count={n}/>` — dim row reading `… +N line(s)`. Reuses the
  dim text style used by `Field`.

## Read-line-count gotcha

`Read` outputs include line-number prefixes (`1\tfoo\n…`). The
`Read N lines` count uses the line count of `output.text` as returned —
not subtracting one for a trailing newline. Tests cover:

- Empty output → `(no output)`
- Single-line, no trailing `\n` → `Read 1 line`
- Many lines → `Read N lines`
- Trailing newline does not inflate (`"a\nb\n"` → `Read 2 lines`)

## Conscious non-decisions

- **Not adopting Codex's head+tail truncation** (5 head + 5 tail +
  `+N middle lines` ellipsis). For transcript review, tail-only matches
  reader intent better — readers usually care about how a command ended.
- **Not adopting Codex's 5-line cap.** Use Claude Code's 3-line tail
  across Bash and MCP/Unknown for parity with the primary inspiration.
- **Codex's "Exploring" grouping** (collapses sequential read/list/search
  into one cell) is out of scope — that's a transcript-level transform,
  not a per-tool rendering choice.
- **Char-based truncation is dropped everywhere.** Variable-width web
  viewport means CSS line-clamp matches reader intent better than fixed
  char caps; visual height is bounded predictably regardless of content.

## Verification

### Unit tests

- `src/transcript/preview.test.ts` — pure helpers:
  - `tailLines("a\nb\nc\nd", 2)` → `{ text: "c\nd", remaining: 2 }`
  - `tailLines("", 3)` → `{ text: "", remaining: 0 }`
  - `headLines` symmetrical cases
  - `parseFrontmatter` with: standard frontmatter, folded multi-line
    description, no frontmatter (returns `undefined`), only opening
    fence (returns `undefined`), unknown keys preserved.
- `src/transcript/claude/Tool.test.tsx` — happy + empty/error per row in
  the Claude table. Specifically:
  - Bash success with 1, 3, 4, 100 logical lines of output (verify
    `<MoreHint/>` appears only when remaining > 0).
  - Bash with `output.isError === true` switches the slice to 10.
  - Read line counts: empty, 1 line no `\n`, `"a\nb\n"` → 2.
  - Edit / MultiEdit / NotebookEdit / ExitPlanMode: render full content
    inside `<ToolCard.Preview>`, and the trigger has no `clickable` class
    in Normal mode when `output` adds nothing.
  - TodoWrite preview shows `M / N complete` and detail = `activeForm`
    of the in-progress todo (or no parens when none in progress).
  - Skill preview reads `description` from `parseFrontmatter`.
  - ToolSearch shows `Loaded N tool(s)` from `output.toolRefs.length`.
- `src/transcript/codex/Tool.test.tsx` — same pattern for Codex tools.
  Specifically `wait_agent` covers all four output shapes:
  - Plain string `"aborted by user after 274.4s"` → single line.
  - `{"status":{},"timed_out":true}` → `Timed out after Ns` using
    `input.timeout_ms`.
  - `{"status":{},"timed_out":false}` → `(no agent results)`.
  - `{"status":{"<id>": {"Completed":{"message":"..."}}}}` → one row,
    nickname resolved from a sibling `spawn_agent` output.
- `src/transcript/codex/CodexTranscript.test.tsx` — nickname resolution
  pre-pass: a transcript with `spawn_agent` then `wait_agent` renders
  the nickname in `WaitAgent`'s header detail.
- `src/settings.test.tsx` — round-trip `viewMode` via localStorage; new
  default `"normal"` for fresh users; old payloads without the field
  upgrade cleanly.

### Browser checks via agent-browser (golden path)

Drive the running dev server (`bun dev`) through the `agent-browser`
skill — drag in fixture files, take screenshots, verify rendering. No
human-in-the-loop manual testing. Exercise:

1. **Settings popover**: dropdown shows "Compact" and "Normal", default
   is "Normal" (fresh user / cleared localStorage). Switching persists
   across reload.
2. **Drag in a Claude Code session** (`~/.claude/projects/.../*.jsonl`)
   in **Normal**:
   - Bash row: header + 3-line tail. Click → full output. Click again →
     back to tail. Long-line output: visually clamped (no overflow).
   - Read row: `Read N lines`. Click reveals file content.
   - Edit row: full diff inline; header has no caret/hover affordance;
     click does nothing (assuming no extra Output/Extras text).
   - TodoWrite row: header `(activeForm of in-progress)`, body
     `M / N complete`. Click reveals checklist.
   - Skill row: skill name + first line of description, ellipsis-cut
     if it doesn't fit.
3. **Drag in a Codex rollout** (`~/.codex/sessions/.../rollout-*.jsonl`)
   in **Normal**:
   - `shell_command` / `exec_command`: 3-line tail like Bash.
   - `apply_patch` row: full patch inline; non-clickable.
   - `spawn_agent` row: `<nickname> · <message>`, line-clamp 1.
   - `wait_agent` row with abort/timeout: single line preview.
   - `update_plan` row: `M / N complete`.
4. **Switch to Compact** while some cards are expanded:
   - Cards previously expanded stay expanded. Collapsed cards become
     header-only.
5. **Switch back to Normal**:
   - Previously expanded cards still expanded. Previously collapsed
     cards now show their preview.

### Fixtures

Add minimum-viable fixtures so the unit tests don't depend on the user's
private session corpus:

- A small Claude fixture with one Bash, one Edit, one TodoWrite, one
  Skill — covers the table.
- A small Codex fixture with `shell_command`, `apply_patch`, and a
  `spawn_agent` + `wait_agent` pair (the `wait_agent` output uses the
  string-abort form to lock in that branch).
- Existing `src/__fixtures__/sample.jsonl` and `codex-sample.jsonl`
  continue to render without errors after the change (regression
  check — render via the existing snapshot tests if any, or via
  `bun test` watching for thrown errors).

### Type safety

- `bun run tsc --noEmit` clean.
- `assertExhaustive` continues to fail compile if a tool input field is
  added but not destructured in its component.

### Definition of done

- All unit tests pass (`bun test`).
- Browser checks above pass via `agent-browser` against a fresh-state
  session, with screenshots captured for each step.
- No console errors when loading any of the three fixtures or a real
  session of either format.
- `tsc` clean.

## Migration / rollout

- No data migration. localStorage payloads without `viewMode` get
  `"normal"` after the merge with `DEFAULTS`.
- Existing Compact behavior is preserved bit-for-bit when the user picks
  Compact, so anyone relying on today's UI can opt back in via the
  popover.
