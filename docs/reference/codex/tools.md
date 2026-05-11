# Codex tools

Living doc — what each tool does, what it emits in transcripts, and
non-obvious wire behavior.

## Primary sources

- Per-tool Rust specs (handlers directory):
  https://github.com/openai/codex/tree/main/codex-rs/core/src/tools/handlers
- `web_search` lives in `hosted_spec.rs` (model-side hosted tool, not a local
  handler).
- No consolidated `.d.ts` or JSON schema — tool names are declared as Rust
  string literals inside each `*_spec.rs`.

## Wire facts

- Tool calls arrive as `response_item` entries with payload type:
  - `function_call` — most tools
  - `custom_tool_call` — `apply_patch` only (input is a raw V4A patch string)
  - `web_search_call` — `web_search` only (hosted, not a `function_call`)
- Tool outputs are `function_call_output` / `custom_tool_call_output` paired
  via `call_id`.
- MCP tools use the namespaced form `mcp__<server>__<tool>` (e.g.
  `mcp__playwright__browser_navigate`).

## Tool catalog

### Shell family

- **`shell`**, **`shell_command`**, **`exec_command`** — variants of "run a
  shell command." Differ in input field names (`cmd` vs `command`) and
  available options (`timeout_ms`, `tty`, `yield_time_ms`). Same semantics.
- **`local_shell`** — runs on the local machine (vs sandboxed).
- **`write_stdin`** — sends keystrokes (or empty string to poll) to an
  *interactive* session identified by `session_id`. Used for REPLs, Ctrl+C
  (`\u0003`), etc. Output captures pending session stdout.

### Patches

- **`apply_patch`** *(custom_tool_call)* — applies a V4A-format patch. Input
  is a raw patch string with `*** Begin Patch` / `*** End Patch` markers and
  per-file blocks (`*** Add File:`, `*** Update File:`, `*** Delete File:`).
  A single call may touch multiple files with mixed ops.

### Reading / viewing

- **`view_image`** — load an image from disk into the conversation.

### Planning

- **`update_plan`** — replaces the codex plan (analog of Claude's TodoWrite).

### Multi-agent

All from `multi_agents_spec.rs`:

- **`spawn_agent`** — start a new subagent. Returns an `agentId` plus a
  nickname (parseable from the call's output for header rendering).
- **`wait_agent`** — blocks until a subagent completes. Often polled
  repeatedly within a turn.
- **`followup_task`** — sends a follow-up instruction to an existing subagent.
- **`resume_agent`** — resumes a paused subagent.
- **`send_input`**, **`send_message`** — send data to a running subagent
  (different envelope shapes).
- **`close_agent`** — terminates a subagent.
- **`list_agents`** — read-side: list known agents.

### Hosted

- **`web_search`** — model-side web search. Arrives as `web_search_call`,
  not `function_call`.

### MCP

- **`list_mcp_resources`**, **`list_mcp_resource_templates`** — discovery.
- **`read_mcp_resource`** — fetch a specific resource.

### Interactive / approval

- **`request_permissions`** — escalate sandbox permissions interactively.
- **`request_user_input`** — pause for user input.
- **`request_plugin_install`** — ask the user to install a plugin.

## Non-obvious shapes

- **`apply_patch` op variants** — a single call can mix `add` / `update` /
  `delete` across files. Diffs (and any per-file derived data) need to be
  computed per file from the parsed V4A.
- **`wait_agent` polling** — codex emits many `wait_agent` calls between a
  `spawn_agent` and the subagent's completion. Treat as ambient infrastructure.
- **Interleaved `event_msg` entries** — codex sprinkles `event_msg` entries
  (e.g. `token_count`, `exec_command_begin`, `exec_command_end`) between
  response_items. They have no `payload.name`; renderers should generally skip
  them.
