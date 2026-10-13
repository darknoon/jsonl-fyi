# Grok Build session format — reference

Research snapshot as of 2026-10-12. Grok Build CLI (`grok`) 1.0.50.

Grok Build is xAI's coding agent CLI. It keeps one directory per session.
This snapshot records the directory and format before viewer support was
implemented. The classifier failure described below refers to that baseline.

## Evidence

- One real session: a headless (`--single`) run captured by Harbor 0.23.0,
  one prompt, 40 model calls, 99 tool calls. It is private benchmark data.
  Only structure is recorded here: field names, JSON types, enum-like values,
  harness tool names, harness-generated result templates, counts and sizes.
  Examples are invented.
- Harbor's adapter, `harbor/agents/installed/grok_build.py`, which reads
  `chat_history.jsonl` and documents the session path.

One session is a thin sample. Interactive sessions, multiple prompts,
compaction, subagents, plan mode and other model backends were not seen.
Statements tagged _(source-read)_ come from Harbor's code only.

## Where sessions live

```text
~/.grok/sessions/
  session_search.sqlite                 # search index
  <percent-encoded cwd>/                # e.g. %2Fhome%2Fsam%2Frecipes
    prompt_history.jsonl                # one line per prompt typed in this cwd
    <session-id>/                       # UUID
      chat_history.jsonl
      updates.jsonl
      events.jsonl
      rewind_points.jsonl
      summary.json  usage.json  signals.json
      resources_state.json  prompt_context.json
      system_prompt.txt  tool_definitions.json
      title_refresh_idx
      terminal/call-<uuid>-<n>.log
      *.lock                            # empty
```

Path from the adapter (`grok_build.py:207`, `:520`); layout from the captured
copy. Harbor copies `~/.grok/sessions` into the trial's `agent/sessions/` and
writes two files of its own beside it: `grok-build.txt` (the CLI's stdout) and
`grok-build-cli.log`.

## Files

| File                        | What it is                                                                  | Records     | Bytes     |
| --------------------------- | --------------------------------------------------------------------------- | ----------- | --------- |
| `chat_history.jsonl`        | The conversation as sent to the model                                       | 143 lines   | 1,200,782 |
| `updates.jsonl`             | UI event stream, Agent Client Protocol `session/update` notifications       | 322 lines   | 3,157,624 |
| `events.jsonl`              | Lifecycle telemetry with timestamps                                         | 1,141 lines | 107,336   |
| `rewind_points.jsonl`       | Before/after file snapshots, one line per prompt                            | 1 line      | 65,401    |
| `tool_definitions.json`     | The 25 function schemas offered to the model                                | 1 array     | 54,663    |
| `system_prompt.txt`         | Same text as the `system` line of `chat_history.jsonl`                      | —           | 5,061     |
| `summary.json`              | Session metadata: ids, cwd, git, model, titles, counts                      | 1 object    | 1,061     |
| `usage.json`                | Token totals for the session and per turn                                   | 1 object    | 1,358     |
| `signals.json`              | 64 telemetry counters (tool calls, failures, latency, lines changed)        | 1 object    | 1,650     |
| `resources_state.json`      | Per-tool runtime parameters                                                 | 1 object    | 1,299     |
| `prompt_context.json`       | Inputs used to assemble the system prompt                                   | 1 object    | 433       |
| `terminal/call-….log`       | Raw output of one `run_terminal_command` call; the stem is the tool call id | 12 files    | 5 – 5,401 |
| `title_refresh_idx`         | A counter                                                                   | —           | 1         |
| `grok-build.txt` _(Harbor)_ | `--output-format streaming-json` stdout plus log lines                      | 830 lines   | 3,083,673 |

`summary.json` cross-checks the two streams: `num_chat_messages` (143) is the
line count of `chat_history.jsonl` and `num_messages` (322) that of
`updates.jsonl`. It also carries `chat_format_version: 1`.

## `chat_history.jsonl`

One JSON object per line. No ids, no parent links, no timestamps, no session
metadata.

| `type`                      | Keys                                                                                                             | Lines |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----- |
| `system`                    | `content` (string)                                                                                               | 1     |
| `user`                      | `content` (array of `{type: "text", text}`), optional `prompt_index` (int), optional `synthetic_reason` (string) | 3     |
| `assistant`                 | `content` (string), `model_id`, optional `tool_calls[]` = `{id, name, arguments}`                                | 40    |
| `tool_result`               | `tool_call_id`, `content` (string), optional `images[]` = `{type: "image", url}`                                 | 99    |
| `reasoning` _(source-read)_ | `summary[]` and optional `content[]`, each `{type?, text?}`                                                      | 0     |

```jsonc
// invented example, one object per line in the real file
{"type":"system","content":"You are a coding agent…"}
{"type":"user","content":[{"type":"text","text":"<user_query>\nAdd a servings field to every recipe.\n</user_query>"}],"prompt_index":0}
{"type":"assistant","content":"","model_id":"vendor/model","tool_calls":[
  {"id":"call-<uuid>-0","name":"read_file","arguments":"{\"target_file\":\"recipes/soup.md\"}"},
  {"id":"call-<uuid>-1","name":"grep","arguments":"{\"pattern\":\"servings\",\"glob\":\"*.md\"}"}]}
{"type":"tool_result","tool_call_id":"call-<uuid>-1","content":"<workspace_result …>…</workspace_result>"}
{"type":"tool_result","tool_call_id":"call-<uuid>-0","content":"1→# Soup\n2→\n3→Simmer for an hour."}
{"type":"assistant","content":"Every recipe now has a servings field.","model_id":"vendor/model"}
```

- The file opens with `system`, then the user lines, then alternating
  `assistant` and `tool_result` runs.
- User lines are not all typed by the user. Of the three: one harness
  context block (`<user_info>…`, no marker key), one injected reminder
  (`<system-reminder>…`, `synthetic_reason: "system_reminder"`), and the real
  prompt (`<user_query>…</user_query>`, `prompt_index: 0`). `prompt_index` is
  the only key that marks a typed prompt.
- `assistant.content` is `""` on 20 lines, whitespace-only on 10, text on 10.
  39 of 40 lines carry `tool_calls`; the last one is the final answer.
- `tool_calls[].arguments` is a JSON-encoded string. All 99 decode to an
  object.
- `tool_calls[].id` is `call-<uuid>-<n>`: one UUID per assistant message,
  `n` counting calls across the whole session (0–98).

### Pairing

`tool_result.tool_call_id` → `assistant.tool_calls[].id`. All 99 calls have
exactly one result, and each result follows the assistant line that issued it,
before the next assistant line.

Results arrive in completion order, not call order: 1–8 calls per assistant
line, and in 17 of the 39 lines with calls the results are in a different
order than the calls. Pair by id.

### Result text

`content` is the text the model saw. It is a harness-formatted string, not
structured output:

| Tool                                 | `content` form                                               |
| ------------------------------------ | ------------------------------------------------------------ |
| `read_file`                          | numbered lines, `<n>→<text>`                                 |
| `read_file` on an image              | `Read image file: <path>` plus `images[]`                    |
| `grep`                               | wrapped in `<workspace_result …>…</workspace_result>`        |
| `list_dir`                           | bullet tree, `- <dir>/`                                      |
| `write`                              | `The file <path> has been created.`                          |
| `search_replace`                     | `The file <path> has been updated successfully.`             |
| `run_terminal_command`               | first line `exit: <n>`, then output                          |
| `run_terminal_command`, backgrounded | begins `<task-id>…</task-id>`                                |
| `get_command_or_subagent_output`     | begins `=== Task <id> ===`                                   |
| `search_tool`                        | a JSON object: `{status, results, note, total_hidden_tools}` |

There is no error flag. The only failure signal in this file is a non-zero
`exit: <n>` (2 of 12 terminal calls).

### Reasoning

None of the session's files contains reasoning text: no `reasoning` line in
`chat_history.jsonl`, no `agent_thought_chunk` in `updates.jsonl`, nothing in
`grok-build.txt`. The model did reason — 13 of 40 `usage` records report
`reasoning_tokens > 0` — but only the count was kept.

_(source-read)_ Harbor models a `reasoning` line type whose text is the
`summary` parts followed by the `content` parts, and attaches it to the next
assistant message. Expect it with other model backends.

### Images

- 4 `tool_result` lines, all from `read_file`, carry
  `images: [{type: "image", url: "data:image/png;base64,…"}]` (2 PNG, 2 JPEG;
  161–279 KB each, 947 KB of the file's 1.2 MB).
- The same images appear in `updates.jsonl` as
  `content[].content = {type: "image", mimeType, data}` with bare base64, and
  again inside `rawOutput`.
- No image was attached to a user message, so that shape is unknown.

## `updates.jsonl`

Each line is `{method, params, timestamp}`; `timestamp` is integer seconds.
`params` is `{sessionId, update, _meta}`, and `update.sessionUpdate` names the
kind. The names and fields match the Agent Client Protocol's `session/update`
notification (inferred from the field names; not checked against the ACP
specification).

| `method`               | `update.sessionUpdate` | Lines |
| ---------------------- | ---------------------- | ----- |
| `session/update`       | `user_message_chunk`   | 1     |
| `session/update`       | `agent_message_chunk`  | 20    |
| `session/update`       | `tool_call`            | 99    |
| `session/update`       | `tool_call_update`     | 198   |
| `_x.ai/session/update` | `task_backgrounded`    | 1     |
| `_x.ai/session/update` | `background_tasks`     | 1     |
| `_x.ai/session/update` | `task_completed`       | 1     |
| `_x.ai/session/update` | `turn_completed`       | 1     |

- `_meta` on every line: `eventId`, `agentTimestampMs`, and for model-driven
  updates `promptId`, `turnStartMs`, `streamStartMs`, `totalTokens`,
  `updateType`.
- A tool call is three lines sharing `toolCallId`:
  1. `tool_call` — `title` (the tool name), `rawInput` (decoded arguments),
     `_meta["x.ai/tool"]` = `{name, kind, label, namespace, read_only,
version}`.
  2. `tool_call_update` — a display `title`, ACP `kind`, `locations[]`
     (`{path, line?}`), and a `rawInput` with more keys than the first.
  3. `tool_call_update` — `status: "completed"`, `content[]`, `rawOutput`.
- `kind`: `read` 43, `search` 21, `edit` 19, `execute` 12, `other` 4. The
  xAI kind is finer: `read`, `search`, `edit`, `write`, `execute`, `list`,
  `search_tool`, `background_task_action`.
- `content[]` parts: `{type: "content", content: {type: "text", text}}`,
  `{type: "content", content: {type: "image", mimeType, data}}`, and
  `{type: "diff", path, oldText, newText, _meta}`. The 19 edit calls
  (13 `search_replace`, 6 `write`) each get a `diff` part; its `_meta` holds
  `old_line`, `new_line` and `details[]` with `old_string`, `new_string`,
  `context_before`, `context_after`.
- `status` is `"completed"` for all 99, including the two calls that failed.
  Failure is only in `rawOutput.exit_code`.
- `rawOutput` is a per-tool object. Terminal and grep output are arrays of
  byte values (`output: [int]`, `stdout: [int]`), which together with the
  duplicated `content` is why this file is 2.6× `chat_history.jsonl`
  (`rawOutput` 1.59 MB, `content` 1.20 MB).
- `agent_message_chunk` here holds a whole message per line, not a token
  delta: the 20 chunks equal the 20 non-empty assistant `content` strings.
  `user_message_chunk` holds the typed prompt without the `<user_query>`
  wrapper.
- `turn_completed` carries `stop_reason`, `elapsed_ms` and `usage`
  (`inputTokens`, `outputTokens`, `cachedReadTokens`, `cacheCreationTokens`,
  `reasoningTokens`, `totalTokens`, `modelCalls`, `numTurns`,
  `apiDurationMs`, `modelUsage` keyed by model id).
- Not in this file: the system prompt, the two synthetic user lines, and
  `model_id` per message. Three calls complete without a `content` key
  (`list_dir` ×2, `get_command_or_subagent_output`), so their text is only in
  `rawOutput`.

## `events.jsonl`

`{type, ts, …}` with ISO 8601 `ts`. No message or tool content.

| `type`                 | Extra keys                                                                                                                             | Lines |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `turn_started`         | `schema_version` (`"1.0"`), `session_id`, `model_id`, `turn_number`, `conversation_message_count`, `session_relationship`, `yolo_mode` | 1     |
| `loop_started`         | `loop_index`                                                                                                                           | 40    |
| `phase_changed`        | `phase`: `streaming_text` 406, `tool_execution` 138, `permission_prompt` 99, `waiting_for_model` 40                                    | 683   |
| `first_token`          | —                                                                                                                                      | 20    |
| `tool_started`         | `tool_name`                                                                                                                            | 99    |
| `permission_requested` | `tool_name`                                                                                                                            | 99    |
| `permission_resolved`  | `tool_name`, `decision` (`allow`), `wait_ms`                                                                                           | 99    |
| `tool_completed`       | `tool_call_id`, `tool_name`, `duration_ms`, `outcome` (`success` 97, `error` 2)                                                        | 99    |
| `turn_ended`           | `outcome`                                                                                                                              | 1     |

`loop_started` appears once per model call (40, matching the 40 assistant
lines and the 40 `usage` records). `tool_completed` is the only record
anywhere with an explicit per-call success flag, and the only link from a
tool call id to a wall-clock time.

## `grok-build.txt`

Not part of the session directory: Harbor tees the CLI's
`--output-format streaming-json` stdout and stderr into it. 816 JSON lines and
14 log lines. No timestamps.

| `type`               | Keys                                                                                                              | Lines |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | ----- |
| `available_commands` | `commands[]`, `tools[]`                                                                                           | 42    |
| `text`               | `data` (a streaming delta, ≤ 13 chars)                                                                            | 406   |
| `tool_call`          | `toolCallId`, `toolName`, `title`, `kind`, `status: "pending"`, `rawInput`, `content`, `locations`                | 99    |
| `tool_call_update`   | `toolCallId`, `status` (`in_progress` 30, `completed` 99, null 99), `content`, `rawOutput`, `locations`           | 228   |
| `usage`              | `usage` = `{input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens, reasoning_tokens}` | 40    |
| `end`                | `usage`, `modelUsage`, `num_turns`, `stopReason`, `sessionId`, `requestId`                                        | 1     |

This is the only place with token usage per model call.

## State files

- `summary.json` — `info: {id, cwd}`, `session_kind` (`headless`),
  `agent_name`, `current_model_id`, `created_at`, `updated_at`,
  `last_active_at`, `generated_title`, `session_summary`,
  `last_turn_summary`, `git_root_dir`, `head_branch`, `head_commit`,
  `chat_format_version`, `num_messages`, `num_chat_messages`,
  `sandbox_profile`, `request_id`, `agent_id`, `attempt_id`.
- `usage.json` — `session` and `turns[]`, each with the camelCase token
  counters listed under `turn_completed`, plus `primaryModelId`, `turnCount`.
- `rewind_points.jsonl` — `{prompt_index, created_at, file_snapshots,
after_snapshots}`. Both snapshot maps are keyed by workspace-relative path
  → `{path, content, captured_at}`; a `null` `content` in `file_snapshots`
  means the file did not exist before the prompt.
- `tool_definitions.json` — `[{type: "function", function: {name, …}}]`.
- `prompt_history.jsonl` (one level up) —
  `{prompt, session_id, timestamp, is_bash}`.

## Tool vocabulary

Defined in `tool_definitions.json` (25): `run_terminal_command`, `read_file`,
`search_replace`, `list_dir`, `grep`, `kill_command_or_subagent`,
`todo_write`, `get_command_or_subagent_output`, `spawn_subagent`,
`scheduler_create`, `scheduler_delete`, `scheduler_list`, `monitor`,
`search_tool`, `use_tool`, `workflow`, `enter_plan_mode`, `exit_plan_mode`,
`ask_user_question`, `send_feedback`, `image_gen`, `image_edit`,
`image_to_video`, `reference_to_video`, `write`.

Used in the session (8 of 25):

| Tool                             | Calls | Argument keys (count)                                       |
| -------------------------------- | ----- | ----------------------------------------------------------- |
| `read_file`                      | 43    | `target_file` 43, `limit` 34, `offset` 16                   |
| `grep`                           | 21    | `pattern` 21, `glob` 21, `head_limit` 9                     |
| `search_replace`                 | 13    | `file_path`, `old_string`, `new_string` 13, `replace_all` 1 |
| `run_terminal_command`           | 12    | `command`, `description` 12, `block_until_ms` 1             |
| `write`                          | 6     | `file_path`, `content`                                      |
| `list_dir`                       | 2     | `target_directory`                                          |
| `search_tool`                    | 1     | `query`                                                     |
| `get_command_or_subagent_output` | 1     | `task_ids`, `timeout_ms`                                    |

## Which file to drop on the viewer

`chat_history.jsonl`.

It is the only single file that holds the whole conversation: system prompt,
every user line, assistant text, tool calls with arguments, the result text
the model saw, and images. It is the smallest of the three streams and it is
what Harbor converts to ATIF.

Choosing it gives up:

| Lost                                                      | Where it is instead                                                                                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All timestamps and durations                              | `events.jsonl` (1,141 events), `updates.jsonl` (322)                                                                                                    |
| Per-tool outcome and duration                             | `events.jsonl` `tool_completed` (99; 2 errors)                                                                                                          |
| Diffs with line numbers and context for the 19 edit calls | `updates.jsonl` `diff` parts. The arguments in `chat_history.jsonl` (`old_string` / `new_string`, or `content`) still allow a diff without line numbers |
| Tool kind, display title, file locations                  | `updates.jsonl`                                                                                                                                         |
| Token usage                                               | `usage.json`, `updates.jsonl` `turn_completed`, `grok-build.txt` `usage`                                                                                |
| Background task lifecycle                                 | `updates.jsonl` `_x.ai/session/update` (3)                                                                                                              |
| Session title, cwd, git, model defaults                   | `summary.json`                                                                                                                                          |
| Before/after file contents                                | `rewind_points.jsonl`                                                                                                                                   |
| Untruncated terminal output                               | `terminal/*.log` (12)                                                                                                                                   |

`updates.jsonl` is the alternative. It has timestamps, diffs and usage but
lacks the system prompt and synthetic user lines, repeats every output two or
three times, and is a UI stream rather than a transcript.

## How it differs from Claude Code

Both use JSONL with `type: "user" | "assistant" | "system"` lines. Nothing
else lines up. Claude side from `src/types.ts` and the Claude fixture.

|                  | Claude Code                                                                                             | Grok Build `chat_history.jsonl`                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Line envelope    | `uuid`, `parentUuid`, `timestamp`, `isSidechain`, and a nested `message: {role, content, model, usage}` | flat: `content` at top level, no `message`, no `uuid`, no `timestamp`                        |
| Tool call        | `tool_use` block inside `message.content[]`: `{id, name, input}` with `input` an object                 | `tool_calls[]` on the assistant line: `{id, name, arguments}` with `arguments` a JSON string |
| Tool result      | `tool_result` block inside a `user` line: `{tool_use_id, content, is_error}`                            | its own line: `{type: "tool_result", tool_call_id, content, images?}`                        |
| Error flag       | `is_error`                                                                                              | none                                                                                         |
| Reasoning        | `thinking` block                                                                                        | separate `reasoning` line _(source-read)_                                                    |
| Image            | `image` block, `source: {type: "base64", media_type, data}`                                             | `images[]: {type: "image", url}` with a data URL                                             |
| Model            | `message.model`                                                                                         | `model_id`                                                                                   |
| Token usage      | `message.usage` per assistant line                                                                      | not in the file                                                                              |
| System prompt    | not in the file                                                                                         | first line                                                                                   |
| Structure        | tree (`parentUuid`), sidechains                                                                         | linear                                                                                       |
| `system` lines   | harness events with `subtype` (for example `turn_duration`), some with a top-level `content`            | the system prompt                                                                            |
| Other line types | `file-history-snapshot`, `attachment`, `queue-operation`, `permission-mode`, `last-prompt`              | none                                                                                         |

## Why the viewer says "Claude Code"

`src/parse/classify.ts` decides from the `type` field alone.

- Line 8: `CLAUDE_TYPES = new Set(["user", "assistant", "system"])`.
- Lines 24–33: for each of the first 10 lines, return `"codex"` on a Codex
  type (line 30) or `"pi"` on Pi evidence (line 31); otherwise line 32 sets
  `sawClaude = true` when the type is in `CLAUDE_TYPES`.
- Line 34: `return sawClaude ? "claude" : "unknown"`.

The first five lines of a Grok Build history are `system`, `user`, `user`,
`user`, `assistant`. No Codex or Pi type appears, line 32 fires on the first
line, and line 34 returns `"claude"`. The check never looks for `message` or
`uuid`.

What follows, confirmed by running the real file through the same functions:

- `src/App.tsx:104–107` calls `parseJsonl`, which keeps any object with a
  truthy `type` not on its skip list (`src/transcript/claude/parse.ts:19`):
  all 143 lines, none with a `message`.
- `getBlocks` (`src/transcript/claude/extractResult.ts:17–23`) reads
  `entry.message?.content` and returns `[]` for every one.
- `buildTranscriptItems` yields 43 `entry` items, no header (there is no
  timestamp), an empty results map. The page shows the file name with the
  Claude icon and an empty transcript. No error is reported.

The other session files classify as `unknown`: `updates.jsonl` has no `type`
key, and the `type` values of `events.jsonl` and `grok-build.txt` are in none
of the sets.

A line shape that separates the two formats: a `system`, `user` or
`assistant` line with a top-level `content` and none of `message`, `uuid`,
`subtype`; or any `tool_result` line with a string `tool_call_id`. In the
Claude fixture every `user` and `assistant` line has `message` and `uuid`, and
every `system` line has `uuid` and `subtype` (4 of 12 also have a top-level
`content`).

## Reproducing the tables

Structure-only queries; none prints message bodies.

```sh
jq -c '.type' chat_history.jsonl | sort | uniq -c
jq -c 'keys_unsorted' chat_history.jsonl | sort | uniq -c
jq -r 'select(.type == "assistant") | .tool_calls[]?.name' chat_history.jsonl | sort | uniq -c | sort -rn
jq -r 'select(.type == "tool_result" and .images) | [.images[].url | length] | @csv' chat_history.jsonl
jq -r '.params.update.sessionUpdate' updates.jsonl | sort | uniq -c
jq -r '.type' events.jsonl | sort | uniq -c
jq -r 'select(.type == "tool_completed") | .outcome' events.jsonl | sort | uniq -c
```
