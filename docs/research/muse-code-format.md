# Muse Code reader

The prototype accepts two JSONL shapes: a live session event ledger and a
durable session log. Detection uses record fields rather than filenames.
This describes supported structure, not a complete specification. All
examples and fixtures are invented.

## Shared envelope

Records use `schema_version`, `id`, `stream`, `sequence`, `recorded_at`,
`record_type`, `durability`, `causation_id`, `payload_type`,
`payload_schema_version` and `payload`. A session stream has
`{ "kind": "session", "id": "example-session" }`.

Record, task, run and tool-call identities are distinct. Status and ephemeral
records can carry conversation content. Never filter them by durability alone.
Unsupported schemas and unfamiliar records use the shared fallback cards.
Original source records remain in parser output. Omitted content is never
reconstructed.

## Durable session log

Some lines wrap records in a transaction frame:

```json
{
  "retained_frame": "session_permission_transaction",
  "frame_schema_version": 1,
  "outer_log_ordinal": 0,
  "transaction_id": "example-transaction",
  "children": [{ "child_index": 0, "record_json": "{...}" }],
  "content_sha256": "example-checksum"
}
```

Decode `record_json` as JSON. Keep malformed children and unknown versions
inspectable. Preserve frame metadata; the prototype does not authenticate
checksums. A `retained_marker: "omitted_live_only"` record describes absent
content through `position` and `omitted_record`; it is not a conversation
message or evidence of successful completion.

`runtime.session` payloads use `kind`, `run_id` and `event`. Run events have
`kind: "run"`; task lifecycle events have `kind: "task"` and `task_id`.
`run.model.configured` stores model fields inside `payload.record`.

| Event kind                          | Interpretation                                                            |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `started`                           | `prompt`; keep empty input distinct from unavailable input.               |
| `assistant_tool_calls_committed`    | `tool_calls[]`: `id`, `call_id`, `name`, JSON-encoded `args`.             |
| `tool_result_batch_committed`       | `results[]`: `tool_call_id`, `tool_call_index`, `text`.                   |
| `assistant_message_committed`       | Assistant `text`, keyed by `message_id` and `response_id`.                |
| `reasoning_summary_delta`           | Text fragments grouped by `message_id` and `summary_index`.               |
| `reasoning_summary_committed`       | Complete summary; prefer over duplicate fragments.                        |
| `reasoning_committed`               | Render available plaintext; retain encrypted content without decoding it. |
| `tool_result_model_visible_content` | `call_id`, `content[]`; image parts carry `media_type` and `base64_data`. |
| `terminal`                          | Explicit `terminal`, `reason`, `turn_duration_ms`.                        |

Pair result `tool_call_id` with call `call_id`, scoped to session and run.
The call's separate `id` is not the result join key. Preserve ambiguous,
duplicate and unmatched records. Decode arguments once; preserve invalid JSON
as text. Assistant messages stay in their recorded positions between tools.
Image bytes can render directly; paths and artifact references alone cannot.
Unknown content parts remain in the original records in parser output.

Durable `recorded_at` values are interpreted as epoch microseconds, divided
by 1,000 for display. Validate safe integers, date range and sequence order;
invalid clocks omit dates. Prefer explicit nonnegative `turn_duration_ms`
for run duration, independently of date validity. Do not derive tool durations
from record adjacency or infer dates from identifiers.

## Live event ledger

Run payloads carry `command_id` and `run_stream`. `turn.input.user.prompt`
and `run.lifecycle.started.prompt` can duplicate one prompt.
`run.output.delta.text` fragments append within a run.
`run.terminal.completed.text` is the final snapshot; display it once and
retain differing streamed text in diagnostics.

`task.stream.linked` and `task.lifecycle.*` carry `task_id`, `task_stream`
and `event`. `event.task_kind: "tool.read_file"` identifies a tool.
Scheduled `event.idempotency_key: "tool:example-call"` joins to
`tool.result.call_id: "example-call"` within the same session and run.
Keep unresolved commands separate; do not pair records by adjacency.

Prefer canonical `tool.result.text` over duplicate lifecycle output chunks.
Preserve differing chunks and non-tool tasks in parser diagnostics.
Failures, rejection, cancellation, running and unknown states stay distinct;
a final output chunk does not prove a background process has stopped.
Shell exit codes can establish failure despite successful task completion.

The live ledger reader does not interpret `recorded_at` as a date or elapsed
time: its wall-clock semantics are not established. Raw values remain in
parser output. No missing timestamps, usage, arguments or reasoning are
reported as zero or fabricated.

## Viewer behavior and limits

Reuse shared tool cards, text, reasoning, image lightbox and Chat groups.
Keep image-bearing tools outside collapsed Chat groups. Compact mode shows
images when the tool expands. Empty and missing prompts remain distinct in
parser output; neither creates a user bubble or a visible turn label.
Use the existing session header and turn separators. Runtime bookkeeping
and full source dumps do not add rows to the conversation.
Unknown tool status uses the neutral shared marker. Missing arguments,
empty results and unavailable timestamps do not add explanatory labels.
Text-only image references remain text; only supplied image bytes render
as images.

Single-file intake does not resolve companion artifacts, reconstruct edit
diffs from counts, fetch local paths, authenticate checksums or decrypt
reasoning. Usage records remain in parser output rather than being totaled. Live
ledger intermediate assistant-message boundaries are not fully modeled.
Missing terminal records leave completion unknown.

The synthetic examples are in [`src/__fixtures__/muse`](../../src/__fixtures__/muse/README.md).
