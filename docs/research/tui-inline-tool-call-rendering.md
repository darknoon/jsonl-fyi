# Codex TUI: inline (“normal”) rendering of tool calls

This note summarizes how the Ratatui chat history renders **each tool-like row before any transcript overlay expansion** (`HistoryCell::display_lines`, main viewport). Full-detail views use `transcript_lines` (e.g. `ExecCell` differs there).

Constants referenced below live in:

- `codex-rs/tui/src/exec_cell/render.rs` — `TOOL_CALL_MAX_LINES` (= **5**), `USER_SHELL_TOOL_CALL_MAX_LINES` (= **50**), `EXEC_DISPLAY_LAYOUT`, `TRANSCRIPT_HINT`
- `codex-rs/tui/src/text_formatting.rs` — `format_and_truncate_tool_result` (grapheme budget)

---

## Shared: command execution (`ExecCell`)

**Wire mapping:** Responses tools named like `shell`, `shell_command`, `exec_command`, etc. are not distinguished in the UI by name. They converge on `ThreadItem::CommandExecution` and render through `ExecCell` (`codex-rs/tui/src/chatwidget.rs` `handle_command_execution_started_now` / `handle_command_execution_completed_now`, `codex-rs/tui/src/exec_cell/`).

**Command text:** The header shows `strip_bash_lc_and_escape(&command)` — for typical `bash -lc` / `zsh -lc` wrappers the inner script is shown; otherwise argv are shell-escaped (`codex-rs/tui/src/exec_command.rs`).

### 1. Header line

**Non-exploring “single command” layout** (`ExecCell::command_display_lines` in `exec_cell/render.rs`):

| State | Glyph | Prefix title | Rest of line |
|--------|--------|----------------|---------------|
| Running | Animated spinner (`•` shimmer / blink) or static `•` if animations off | **`Running`** | Bash-highlighted command (wrapped) |
| Finished, success | **`•`** green bold | **`Ran`** (agent) or **`You ran`** (`CommandExecutionSource::UserShell`) | Same command |
| Finished, failure | **`•`** red bold | Same titles | Same command |

**Unified exec interaction** (`ExecCommandSource::UnifiedExecInteraction`): header is **`•`** + single line from `format_unified_exec_interaction` — **no** `Running`/`Ran`/`You ran` prefix (`exec_cell/render.rs`).

**“Exploring” grouped reads** (`ExecCell::exploring_display_lines` when every parsed action is Read/List/Search and source is not user shell): first line is **`•`** (spinner while active, dim bullet when done) + **`Exploring`** / **`Explored`** bold; indented subtree uses cyan labels **`Read`**, **`List`**, **`Search`**, **`Run`** with paths/queries (`exec_cell/render.rs`).

First-line continuation uses prefixes **`  │ `** (dim); max **2** extra wrapped continuation lines before `… +N lines` ellipsis (`EXEC_DISPLAY_LAYOUT.command_continuation_max_lines`).

### 2. Default body (stdout/stderr)

- **While running:** No output block until `CommandExecution.output` is populated; streaming deltas append into `aggregated_output` (`exec_cell/model.rs` `append_output`, `chatwidget.rs` `on_exec_command_output_delta`).
- **After finish:** Output is **`aggregated_output`** (stderr + stdout interleaved in one string). There is **no** stderr-only preview for failed commands in this cell (`only_err` is **false** in `command_display_lines`).
- **Logical lines:** `output_lines()` keeps up to **`line_limit`** lines from the **head** and **`line_limit`** from the **tail**. If `total > 2 * line_limit`, inserts **`… +{total - 2*line_limit} lines (ctrl + t to view transcript)`** (`exec_cell/render.rs`).  
  - Agent / default commands: **`line_limit = TOOL_CALL_MAX_LINES` (5)**.  
  - User shell: **`line_limit = USER_SHELL_TOOL_CALL_MAX_LINES` (50)**.
- **Viewport rows:** After wrapping, output is capped to **`output_max_lines`** rows (**5** agent, **50** user shell) via `truncate_lines_middle` (splits head/tail row budgets around an ellipsis line). Ellipsis counts **logical** lines, not wrapped rows.
- **Empty output:** Indented **`(no output)`** dim — skipped for unified-exec interaction rows (`exec_cell/render.rs`).
- **Prefixes:** Output uses **`  └ `** first line, **`    `** continuation (dim gutter).

**Unified exec interaction:** Completed rows intentionally use **empty** aggregated output for the exec cell; interaction content is rendered separately (`UnifiedExecInteractionCell`, `history_cell.rs`).

### 3. Errors

Non-zero exit: **red** bullet; output body still follows the rules above (combined stream, not stderr-filtered).

### 4. Streaming vs complete

Streaming only grows `aggregated_output`; layout/truncation applies to whatever is present each frame. Completed state adds duration only in **`transcript_lines`**, not in inline `display_lines`.

---

## `apply_patch` → patch summary (`PatchHistoryCell`)

**Sources:** `history_cell.rs` (`PatchHistoryCell`, `new_patch_event`), `diff_render.rs` `create_diff_summary`.

### 1. Header line

- **`• `** dim + **`Added`** / **`Deleted`** / **`Edited`** bold + relative path (+ **`→`** for renames) + **`(+added -removed)`** counts (`diff_render.rs` `render_changes_block`).
- Multiple files: **`Edited N files`** + aggregate **`(+ -)`**.

### 2. Default body

Full per-file diff rendering (syntax-highlighted add/delete/update hunks), wrapped at **`wrap_cols - 4`** with **`    `** gutter. **No** `TOOL_CALL_MAX_LINES`-style truncation in this path — the inline cell can occupy many rows.

Per-file subtree: **`  └ `** dim + path + counts when **multi-file** (skipped when **single-file** header already names the path).

### 3. Errors

Patch apply failure uses a separate cell **`new_patch_apply_failure`** (`history_cell.rs`): title **`✘ Failed to apply patch`** magenta bold; stderr preview via `output_lines` with **`line_limit = TOOL_CALL_MAX_LINES` (5)**, **`only_err: true`**, gutter **`  └ `** / **`    `**.

### 4. Streaming vs complete

Patch preview is emitted as a completed history insert (`chatwidget.rs` `on_patch_apply_begin`); no incremental streaming in `PatchHistoryCell`.

---

## `update_plan` → checklist (`PlanUpdateCell`)

**Sources:** `history_cell.rs` `PlanUpdateCell`, `chatwidget.rs` `on_plan_update`, notification `TurnPlanUpdated`.

### 1. Header line

**`• `** dim + **`Updated Plan`** bold.

### 2. Default body

- Optional **`explanation`**: italic dim, wrapped at **`width - 4`** (`render_note`).
- Steps: checkbox **`✔ `** (completed, crossed-out dim), **`□ `** cyan bold (in progress), **`□ `** dim (pending) + step text (`render_step`).
- Empty plan: **`(no steps provided)`** dim italic.
- Block indented with **`  └ `** / **`    `**.

### 3. Errors

No dedicated error styling in `PlanUpdateCell` (protocol carries normal step statuses only).

### 4. Streaming vs complete

**`update_plan`** is logged as discrete updates; each emits a full `PlanUpdateCell` snapshot (not a streaming markdown controller).

*(Related but distinct: proposed-plan **markdown** streaming uses `PlanStreamController` in `codex-rs/tui/src/streaming/controller.rs` — header **`• Proposed Plan`**, body streamed as markdown lines with **`  `** indent. That is not the same widget as `PlanUpdateCell`.)*

---

## `view_image`

**Source:** `history_cell.rs` `new_view_image_tool_call`.

### 1. Header

**`• `** dim + **`Viewed Image`** bold.

### 2. Body

One line: **`  └ `** dim + session-relative path (**dim**).

### 3. Errors / streaming

No spinner; no streaming — single completed insert (`chatwidget.rs` `on_view_image_tool_call`).

---

## `web_search`

**Sources:** `history_cell.rs` `WebSearchCell`, `web_search_*` helpers; `chatwidget.rs` `on_web_search_begin` / `on_web_search_end`.

### 1. Header

Prefixed wrapped line:

- Bullet: spinner while in-flight; **`•`** dim when **completed** (not green/red).
- Title: **`Searching the web`** bold (active) or **`Searched`** bold (done).
- Detail string from `web_search_detail`: prefers structured `WebSearchAction` (`Search`/`OpenPage`/`FindInPage`); falls back to raw `query`. Multi-query **`Search`** uses first query + **` ...`** when `queries.len() > 1`.

Prefix: **`bullet + space`** first line, **`  `** continuation (`PrefixedWrappedHistoryCell`).

### 2. Default body

**None** — header only.

### 3. Errors

No distinct failure styling on `WebSearchCell` (completed state always dim bullet).

### 4. Streaming vs complete

Begin/end swap spinner vs dim bullet + title text change; still one composed header line.

---

## `spawn_agent` (multi-agent collab)

**Wire type:** `ThreadItem::CollabAgentToolCall` with `CollabAgentTool::SpawnAgent` (`codex-rs/app-server-protocol/.../v2.rs`). JSONL may say **`spawn_agent`**; the TUI maps to this enum.

**Source:** `multi_agents.rs` `tool_call_history_cell` → `spawn_end`, `history_cell.rs` `collab_event`.

### 1. Header / body

- **`InProgress`:** **`None`** — **no history row** while spawn is running (`multi_agents.rs`).
- **Completed:** **`• `** dim + bold title  
  - Success: **`Spawned `** + agent label (nickname cyan bold, else thread id cyan, optional **`[role]`**) + optional **` (model reasoning_effort)`** magenta (`spawn_request_spans`).  
  - Failure (no receiver thread id): **`Agent spawn failed`** (`title_text`).
- **Detail:** Optional prompt line under **`  └ `** / **`    `**, grapheme-truncated to **160** (`COLLAB_PROMPT_PREVIEW_GRAPHEMES`, `truncate_text`).

### 2. Errors

Folded into **`Agent spawn failed`** header path; no stderr-style body.

### 3. Streaming vs complete

Binary visibility: nothing until completion event produces a cell.

---

## `wait_agent` → collab **`Wait`**

**Wire type:** `CollabAgentTool::Wait` (same JSONL name discrepancy note as above).

**Source:** `multi_agents.rs` `waiting_begin` / `waiting_end`.

### 1. Header

- **In progress:** **`• `** dim + **`Waiting for `** bold + agent label, or **`Waiting for N agents`** when multiple receivers; multi-agent lists each agent on **`  └ `** indented lines.
- **Completed:** **`• `** dim + **`Finished waiting`** bold (`title_text`).

### 2. Body

**Completed:** One line per agent: agent label + **`:`** + status (`status_summary_spans`) — **`Completed`** green with optional message preview (**240** graphemes, whitespace-normalized), **`Errored`** red **`Error`** + preview (**160** graphemes), **`Interrupted`** yellow, etc. (`multi_agents.rs`). If no agent entries: **`No agents completed yet`**.

### 3. Errors

Rendered as **`Error`** red span plus truncated message for `CollabAgentStatus::Errored`.

### 4. Streaming vs complete

In-progress row shows waiting header; completion replaces semantic content via separate thread items (history appends another cell from `tool_call_history_cell`).

---

## MCP / “custom” tools (`McpToolCallCell`)

**Source:** `history_cell.rs` `McpToolCallCell`, `format_mcp_invocation`; completion `chatwidget.rs` `handle_mcp_tool_call_completed_now`.

### 1. Header line

**`• `** bullet:

- Running: spinner  
- Success: **`•`** green bold  
- Failure: **`•`** red bold  

Prefix word: **`Calling`** while running, **`Called`** when finished.

Invocation text: **`server`** cyan **`.`** **`tool`** cyan **`(`** `serde_json::to_string(arguments)` dim **`)`** — if wider than remaining columns, invocation wraps under a **`  └ `** tree (`history_cell.rs`).

### 2. Default body

After completion, text blocks render per MCP content:

- Text: `format_and_truncate_tool_result(text, TOOL_CALL_MAX_LINES, detail_wrap_width)` → grapheme budget **`max_lines * line_width - max_lines`** (`text_formatting.rs`), JSON pretty-compacted when parseable.
- Non-text placeholders: **`<image content>`**, **`<audio content>`**, **`embedded resource: {uri}`**, **`link: {uri}`**.
- Multiple blocks: concatenated as separate wrapped segments.

Indent: **`  └ `** when invocation fit on header line, else **`    `** for details (`history_cell.rs`).

### 3. Errors

Transport/protocol error string: **`Error: …`** through the same truncation helper (**5** logical lines budget).

`CallToolResult.is_error`: treated as failure (**red** bullet) even when `Ok(...)`.

### 4. Streaming vs complete

No partial results in the cell body until completion; spinner header while active.

**Bonus image row:** First decodable image in a successful result may emit an extra **`CompletedMcpToolCallWithImageOutput`** line **`tool result (image output)`** (`history_cell.rs`).

---

## Generic fallback: unknown / dynamic tools

**`ThreadItem::DynamicToolCall`** is intentionally **ignored** in the chat replay path (**empty match arm**) — **`codex-rs/tui/src/chatwidget.rs`** around the `ThreadItem::DynamicToolCall { .. } => {}` handler. Those tools **do not appear** in the normal TUI transcript today even if persisted on the thread.

There is **no** separate “unknown function name” renderer beyond:

- **`ExecCell`** for shell executions  
- **`McpToolCallCell`** for MCP  
- Collab variants above  
- **`DynamicToolCall`** (currently no UI)

If your JSONL uses other labels, map them to these wire items when mirroring Codex.

---

## Quick constant lookup

| Concept | Value | File |
|---------|-------|------|
| Agent command output logical window | 5 lines head/tail | `exec_cell/render.rs` `TOOL_CALL_MAX_LINES` |
| Agent command output viewport row cap | 5 | `EXEC_DISPLAY_LAYOUT.output_max_lines` |
| User shell logical window | 50 | `USER_SHELL_TOOL_CALL_MAX_LINES` |
| User shell viewport row cap | 50 | same constant in `command_display_lines` |
| MCP / patch-failure text truncate lines | 5 | `TOOL_CALL_MAX_LINES` passed into `format_and_truncate_tool_result` |
| Unified exec stdin preview chars | 80 | `exec_cell/render.rs` `MAX_INTERACTION_PREVIEW_CHARS` |
| Collab prompt preview | 160 graphemes | `multi_agents.rs` `COLLAB_PROMPT_PREVIEW_GRAPHEMES` |
| Collab agent message preview | 240 graphemes | `COLLAB_AGENT_RESPONSE_PREVIEW_GRAPHEMES` |
| Collab error preview | 160 graphemes | `COLLAB_AGENT_ERROR_PREVIEW_GRAPHEMES` |
