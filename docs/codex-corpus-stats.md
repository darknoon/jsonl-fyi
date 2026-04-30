# Codex Rollout Corpus Stats

One-shot snapshot of `~/.codex/sessions/**/rollout-*.jsonl` taken on 2026-04-29 to ground the design of jsonl-fyi's Codex support. Numbers reflect a single user's local history; relative shapes (which event types exist, which tool names appear) are what to read here, not absolute volume.

## Corpus shape

- **468 session files**, dated 2025-09-15 through 2026-04-29
- One `session_meta` line per file (467 occurrences observed; 1 outlier likely truncated)
- Top-level `type` counts across all files:

| Type            | Count  |
| --------------- | ------ |
| `response_item` | 48,370 |
| `event_msg`     | 47,882 |
| `turn_context`  | 14,405 |
| `session_meta`  | 466    |
| `compacted`     | 22     |

`response_item` is the source-of-truth stream. `event_msg` carries the same content (assistant messages, reasoning, user messages, token counts) — verified byte-identical for assistant text and reasoning, and a strict subset for user text (event_msg drops auto-injected `<environment_context>` blocks). jsonl-fyi consumes `response_item` only; see the design doc for justification.

## response_item subtypes

| `payload.type`            | Count  |
| ------------------------- | ------ |
| `function_call`           | 13,060 |
| `function_call_output`    | 13,051 |
| `reasoning`               | 12,400 |
| `message`                 | 4,628  |
| `custom_tool_call_output` | 2,047  |
| `custom_tool_call`        | 2,047  |
| `ghost_snapshot`          | 909    |
| `web_search_call`         | 228    |

`custom_tool_call` is exclusively `apply_patch` (2,047 / 2,047). The 9-call gap between `function_call` and `function_call_output` is real — likely interrupted/cancelled calls.

## Function-call tool names

| Name                          | Count                 | Notes                                               |
| ----------------------------- | --------------------- | --------------------------------------------------- |
| `shell_command`               | 8,297                 | current default shell tool; `command: string`       |
| `exec_command`                | 2,724                 | newer streaming variant; **field renamed to `cmd`** |
| `shell`                       | 1,187                 | older variant; `command: string[]`                  |
| `write_stdin`                 | 513                   | pairs with `exec_command` `tty=true`                |
| `update_plan`                 | 230                   | TODO list update, ≈ Claude `TodoWrite`              |
| `view_image`                  | 32                    | adds local image to context                         |
| `mcp__playwright__*`          | 47 across 9 sub-tools | MCP server: browser automation                      |
| `mcp__linear__*`              | 5 across 2 sub-tools  | MCP server: issue tracking                          |
| `wait_agent`                  | 3                     | sub-agent harness                                   |
| `spawn_agent`                 | 2                     | sub-agent harness                                   |
| `request_user_input`          | 2                     |                                                     |
| `list_mcp_resources`          | 1                     |                                                     |
| `list_mcp_resource_templates` | 1                     |                                                     |

Three eras of shell tool coexist in the corpus. They have different argument keys; jsonl-fyi renders each with its own component (no normalization layer) — see the design doc.

## `apply_patch` (custom_tool_call)

2,047 occurrences. Argument is a single V4A patch string, e.g.:

```
*** Begin Patch
*** Update File: /abs/path/to/file
@@
- old line
+ new line
*** End Patch
```

Operations seen: `Update File`, `Add File`, `Delete File`, `Move to:`. Anchors on `@@` lines (`@@ class Foo`) appear in some patches.

## `view_image` output formats

32 calls total, three output shapes:

| Output                                                                              | Count | Behavior                                                  |
| ----------------------------------------------------------------------------------- | ----- | --------------------------------------------------------- |
| Literal string `"attached local image path"`                                        | ~23   | Just a confirmation; no useful payload — render path only |
| JSON array containing `[{type:"input_image", image_url:"data:image/png;base64,…"}]` | ~8    | **Image bytes are in the log** — render inline            |
| Error string (`"unable to locate image at …"`)                                      | 1     | Render as text                                            |

So jsonl-fyi can render the actual image roughly a quarter of the time. The rest is path-only.

## `spawn_agent` / `wait_agent`

Input to `spawn_agent`: `{agent_type, fork_context, model?, reasoning_effort?, message}`. Output: `{agent_id, nickname}` (the harness assigns a randomly-generated nickname like "Bacon" or "Faraday").

`wait_agent` input: `{targets: string[], timeout_ms}`; output is the spawned agent's final message. The full sub-agent transcript lives in a separate session file, not inline.

## `compacted` events

22 occurrences. Mark the boundary where Codex compacts long-running sessions. Payload has `message` and `replacement_history` keys. v1 renders these as a thin "Conversation compacted" inline marker; we don't surface the replacement summary.

## Observed quirks worth knowing

- `workdir` is **optional** in every shell tool variant — model only specifies it when it wants to override the session cwd from `turn_context.cwd`.
- `exec_command` uses `cmd` where `shell_command` and `shell` use `command`. Same semantic role, different key.
- `shell` emits `command: string[]` (argv-style). The other two emit `command: string` / `cmd: string` (already shell-quoted by the model).
- Some `response_item.reasoning` lines bundle multiple `summary[]` items together; the corresponding `event_msg.agent_reasoning` stream emits one event per item, losing the grouping.
- `event_msg.token_count.info` was null in every observed line — the SDK didn't populate it. Token usage rendering deferred until we see real data.
- `session_meta` files dated before 2025-10 use UUID v4 ids; later files use UUIDv7 (timestamps embedded in id).
