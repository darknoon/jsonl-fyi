# Codex transcript format — reference

Quick facts about how the viewer consumes Codex `rollout-*.jsonl`
transcripts.

## Pairing

Tool calls are paired to results by `call_id`. The pre-pass in
`codex/CodexTranscript.tsx` indexes outputs by id; per-tool components look
up the matching `function_call_output` / `custom_tool_call_output`.

## Stream choice

Only `response_item` lines are consumed for rendering. `event_msg` lines are
parsed but dropped — empirically lossless and slightly richer (see
`docs/superpowers/specs/2026-04-29-codex-transcripts-design.md` §4).

## Tools dispatched in `codex/Tool.tsx`

By function-call `name`: `shell_command`, `exec_command`, `shell`,
`update_plan`, `view_image`, `spawn_agent`, `wait_agent`.

`apply_patch` is a `custom_tool_call`, dispatched separately in the same
file via `CodexCustomToolCall`.

`web_search_call` is a `response_item` subtype (not a function call) and is
dispatched at the entry level in `codex/EntryView.tsx`.

Unknown names fall through to `UnknownTool`.

## `<environment_context>` user blocks

Auto-injected by the harness; filtered before display in `codex/parse.ts`.

## Where to find real transcripts

`~/.codex/sessions/**/rollout-*.jsonl`

`docs/codex-corpus-stats.md` is a one-shot snapshot of format prevalence
across the user's local corpus as of 2026-04-29.
