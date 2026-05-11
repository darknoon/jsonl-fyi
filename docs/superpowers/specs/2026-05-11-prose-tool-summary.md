# Prose tool-group summary

Replace the chip-style summary (`**Read** ×2 · **Edit** ×1 · *Thinking* ×3`)
with a muted prose sentence:

> Ran 3 commands, edited 3 files, created 1 file and thought 3 times

When expanded, the same row stays put but the text color goes from muted to
normal; the existing per-item content renders below. Click again to collapse.

## Tool descriptions

See per-format living docs for descriptions of what each tool does and any
non-obvious wire behavior:

- `docs/reference/claude/tools.md`
- `docs/reference/codex/tools.md`
- `docs/reference/pi/tools.md`

## Categories (fixed order in the prose)

| # | Category | Phrase template | Pluralized |
|---|---|---|---|
| 1 | command | "Ran N command" | commands |
| 2 | edit | "edited N file" | files |
| 3 | create | "created N file" | files |
| 4 | delete | "deleted N file" | files |
| 5 | read | "read N file" | files |
| 6 | search | "searched N time" | times |
| 7 | web fetch | "fetched N URL" | URLs |
| 8 | web search | "searched the web N time" | times |
| 9 | subagent | "started N subagent" | subagents |
| 10 | subagent_comm | "messaged N subagent" | subagents |
| 11 | todo | "updated N todo item" | items |
| 12 | skill | "loaded N skill" | skills |
| — | thinking | " and thought N time" / "Thought N time" | times (N=1 → omit count: "Thought" / "and thought") |

- Zero counts → omitted.
- All-zero (no tools, no thinking) → no row.
- Thinking-only → "Thought N times" / "Thought once".
- Capitalization: first non-thinking category is sentence-cased, rest lowercase.
- Joins: commas between, " and " before final item.
- Default fallback for unknown tool names: **command**.

## Failures

Per-row failures are surfaced as a suffix in the same prose line:

> Ran 3 commands, edited 3 files and read 5 files (1 failure)
> Ran 2 commands (3 failures)

- Suffix only renders when ≥1 tool item has `status === "error"`.
- "1 failure" / "N failures" (plural-aware).
- Thinking items don't count toward failures.

## No status dot

The colored success/error/mixed status dot on the group row is removed.
Failure information lives in the prose suffix above. Individual tool failures
remain visible inside the expanded view via their per-tool rendering.

## Classification tables

### Claude Code

| Tool | Category |
|---|---|
| `Bash` | command |
| `Edit` | edit |
| `MultiEdit` | edit |
| `NotebookEdit` | edit |
| `Write` | create |
| `Read` | read |
| `Grep` | search |
| `Glob` | search |
| `WebFetch` | web_fetch |
| `WebSearch` | web_search |
| `Task` / `Agent` | subagent |
| `SendMessage` | subagent_comm |
| `TeamCreate` / `TeamDelete` | command |
| `TodoWrite` | todo |
| `TaskCreate` / `TaskUpdate` / `TaskList` / `TaskGet` / `TaskStop` / `TaskOutput` | todo |
| `Skill` | skill |
| `EnterPlanMode` / `ExitPlanMode` | command |
| `EnterWorktree` / `ExitWorktree` | command |
| `AskUserQuestion` | command |
| `Mcp` / `ListMcpResources` / `ReadMcpResource` | command |
| `ToolSearch` | command |
| `mcp__*` (any namespaced) | command (default) |
| anything else | command (default) |

### Codex

| Tool | Sub-case | Category |
|---|---|---|
| `shell` / `shell_command` / `exec_command` / `local_shell` | — | command |
| `write_stdin` | — | command |
| `apply_patch` | per file, op=`add` | create |
| `apply_patch` | per file, op=`update` | edit |
| `apply_patch` | per file, op=`delete` | delete |
| `view_image` | — | read |
| `update_plan` | — | todo |
| `spawn_agent` | — | subagent |
| `followup_task` / `resume_agent` / `send_input` / `send_message` / `close_agent` | — | subagent_comm |
| `wait_agent` / `list_agents` | — | command |
| `web_search` | — | web_search |
| `list_mcp_resources` / `list_mcp_resource_templates` / `read_mcp_resource` | — | command |
| `request_permissions` / `request_user_input` / `request_plugin_install` | — | command |
| `mcp__*` (any namespaced) | — | command (default) |
| anything else | — | command (default) |

### Pi

| Tool | Category |
|---|---|
| `bash` | command |
| `edit` | edit |
| `write` | create |
| `read` | read |
| `grep` | search |
| `find` | search |
| `ls` | command |
| `subagent` (extension) | subagent |
| `plan_tracker` (skill pack) | todo |
| anything else | command (default) |

## Subagent routing

- **subagent** (started): `Task`, `Agent` (Claude); `spawn_agent` (codex);
  `subagent` (Pi extension).
- **subagent_comm** (messaged): codex `followup_task`, `resume_agent`,
  `send_input`, `send_message`, `close_agent`; Claude `SendMessage`.
- **command**: codex `wait_agent`, `list_agents` — counted but not as
  subagent activity.

The two subagent buckets count distinct subagents touched, deduped where
possible by `agent_id` in payloads (if not available, fall back to call count).

## Singular phrasing for thinking

| N | Standalone | Appended |
|---|---|---|
| 1 | "Thought" | " and thought" |
| >1 | "Thought N times" | " and thought N times" |

## Implementation notes

- One `categorize(name, payload) → Category` per format, with a `command`
  fallback for unknown names.
- One pure builder `renderProseSummary(counts: SummaryCounts, thinking: number) → string`
  shared across formats.
- `apply_patch` is routed per file based on V4A op:
  - `op=add` → create
  - `op=update` → edit
  - `op=delete` → delete
- Unit tests:
  - Per-format `categorize` tests covering every row in the reference docs.
  - `renderProseSummary` tests for: each category alone, pairs, full, zero-skip,
    thinking-only, singular vs plural, capitalization, "once" handling.
