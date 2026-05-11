# Claude Code tools

Living doc — what each tool does, what it emits in transcripts, and anything
non-obvious from the SDK types.

## Primary sources

- `sdk-tools.d.ts` (in this dir) — `@anthropic-ai/claude-agent-sdk` v0.2.138.
  JSON-Schema-derived TS types for SDK-exposed tools. Uses internal type names
  (`FileEdit`, `FileRead`, `FileWrite`) — the on-wire `tool_use.name` strings
  are the short forms (`Edit`, `Read`, `Write`).
- Claude Code CLI emits additional tools not in the SDK schema (Skill,
  EnterPlanMode, MultiEdit, TaskCreate family, ToolSearch). Observed-only.

## Wire-name → SDK type aliases

```ts
const SDK_ALIASES = {
  Read: "FileRead",
  Edit: "FileEdit",
  Write: "FileWrite",
  Task: "Agent",
} as const
```

## Tool catalog

### File I/O

- **`Read`** — reads a file. Single-shot, content goes into the tool_result.
- **`Edit`** — exact-string replacement in an existing file. Errors if file
  not previously read.
- **`MultiEdit`** *(CLI-only)* — N sequential exact-string replacements in one
  call. Treat as one logical edit on one file.
- **`Write`** — writes a file. Doesn't distinguish create vs overwrite on the
  wire; the same call shape is used for both.
- **`NotebookEdit`** — exact-string replacement scoped to a single Jupyter cell.

### Shell / search

- **`Bash`** — runs a shell command. Output is the captured stdout/stderr.
- **`Grep`** — ripgrep-backed content search. Returns matching lines or file
  list depending on mode.
- **`Glob`** — filename pattern search.

### Web

- **`WebFetch`** — fetches a URL and returns the content.
- **`WebSearch`** — web search query → list of results.

### Subagents / tasks

- **`Task` / `Agent`** — dispatch a subagent. Same input shape; `Task` is the
  CLI/older alias. Returns the subagent's final summary message.
- **`SendMessage`** — sends a follow-up message to a previously-spawned
  subagent (by agent id or name). The Claude analog of codex `send_message` /
  `followup_task`. Resumes the target agent with full context.
- **`TeamCreate`** / **`TeamDelete`** — manage agent "teams" used to group
  subagents for SendMessage routing.
- **`TodoWrite`** — replaces the entire todo list in one batch. (Older
  CLI API; newer Claude Code uses the per-item `TaskCreate` family below.)
- **`TaskCreate`** — add one todo item. Input: `{subject, description, activeForm}`.
- **`TaskUpdate`** — change one todo's status. Input: `{taskId, status}`.
- **`TaskList`**, **`TaskGet`** — read-side todo queries.
- **`TaskStop`**, **`TaskOutput`** — start/stop and read output of a *running*
  task (when the todo system is executing tasks rather than just listing).
  Despite the names, these belong to the same todo-list family — not to the
  `Task`/`Agent` subagent dispatcher.

### Skills / plan mode

- **`Skill`** *(CLI-only)* — load a skill (a markdown instruction file) into
  context. Input is the skill name.
- **`EnterPlanMode`** / **`ExitPlanMode`** — toggle the CLI's plan-only mode.

### Interactive / worktrees

- **`AskUserQuestion`** — prompts the user with a multi-choice question.
- **`EnterWorktree`** / **`ExitWorktree`** — manage git worktrees for the
  current branch.

### MCP

- **`Mcp`** — generic wrapper for MCP tool invocation.
- **`ListMcpResources`**, **`ReadMcpResource`** — discover and read MCP
  resources (vs invoking tools).
- MCP-namespaced tools come through as `mcp__<server>__<tool>` (e.g.
  `mcp__playwright__browser_navigate`).

### Internal / agent infrastructure

- **`ToolSearch`** *(CLI-only)* — looks up tool schemas for deferred tools.
  Rare in user-facing transcripts.

## Non-obvious shapes

- **`Write` create-vs-overwrite** is not distinguishable from the call alone.
  You'd need a transcript-wide path set to tell.
- **`MultiEdit`** counts as one logical "edit" on one file regardless of the
  number of internal replacements.
- **`Task`/`Agent`** can be nested — a subagent's transcript is reachable via
  the agent's sidechain entries.
