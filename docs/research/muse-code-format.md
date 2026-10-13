# Muse Code event-log reader

This document describes the prototype reader's supported record shapes and
joining rules. It is not a complete format specification. Examples use
invented identifiers, content, model labels and times.

## Envelope

Each line is a JSON object with the following fields:

| Field                                      | Reader interpretation                                               |
| ------------------------------------------ | ------------------------------------------------------------------- |
| `schema_version`, `payload_schema_version` | Schema versions; unsupported versions remain inspectable.           |
| `id`                                       | Record identity, distinct from task and call identities.            |
| `stream`                                   | Session identity: `{ "kind": "session", "id": "example-session" }`. |
| `sequence`                                 | Ordering within a session.                                          |
| `recorded_at`                              | Epoch microseconds, subject to timestamp validation.                |
| `record_type`                              | `event`, `status` or `reconciliation`.                              |
| `durability`                               | Persistence classification, such as `durable` or `ephemeral`.       |
| `causation_id`                             | Command correlation identifier.                                     |
| `payload_type`                             | Dotted payload discriminator.                                       |
| `payload`                                  | Event-specific fields.                                              |

Status and ephemeral records can contain conversation content. Do not
filter them solely by their envelope classification.

## Session and run records

The reader groups by session and run identity. Common payload fields are
`kind`, `command_id` and `run_stream`. A file can contain multiple runs;
a run without prompt text should not produce an empty user bubble.

| Payload type               | Content and handling                                                           |
| -------------------------- | ------------------------------------------------------------------------------ |
| `runtime.command.accepted` | Command metadata, including `command_kind` and optional `client_id`.           |
| `session.run.linked`       | Associates a session with a run.                                               |
| `run.model.configured`     | `model_id`, `provider_id`, `display_label`; display the recorded label.        |
| `turn.input.user`          | `prompt`; the user message.                                                    |
| `run.lifecycle.started`    | Run start and fallback `prompt`; avoid duplicating the user message.           |
| `run.output.delta`         | Append `text` without inserting separators, within one run.                    |
| `run.terminal.completed`   | Completion state and final `text`; prefer this snapshot over duplicate deltas. |
| `todo.snapshot.updated`    | Task-list snapshot in `facts`; keep inspectable.                               |

Do not infer completion from the last line. Missing terminal records mean
completion is unknown. Preserve conflicting text and unfamiliar payloads
for inspection instead of silently discarding them.

## Task records

`task.stream.linked` associates `task_id` with `task_stream`. The
`task.lifecycle.*` payloads contain the task identity and an `event`
object. Task events are grouped by session, run and task ID.

| Lifecycle suffix     | Handling                                                                   |
| -------------------- | -------------------------------------------------------------------------- |
| `proposed`           | `event.task_kind` identifies a tool, model request or runtime task.        |
| `accepted`           | Task acceptance.                                                           |
| `scheduled`          | `event.idempotency_key` can identify the associated tool call.             |
| `side_effect_intent` | Operation metadata; retained for inspection.                               |
| `started`            | Task start; optional tracing span is not the tool call ID.                 |
| `status`             | Progress `message` and optional `details`; not assistant prose.            |
| `output`             | `chunk` and `final_result`; fallback output if no canonical result exists. |
| `completed`          | Task completion.                                                           |
| `rejected`           | Rejection with `reason`.                                                   |
| `failed`             | Failure with `reason`.                                                     |
| `cancelled`          | Cancellation with `reason`.                                                |
| `tool_output_ref`    | Artifact availability and reference; the referenced content may be absent. |

Only `tool.*` task kinds become tool cards. Other tasks remain collapsed
runtime diagnostics. A rejected runtime task is not a failed tool call.

## Pairing tools and results

A scheduled tool task can carry:

```json
{ "idempotency_key": "tool:example-call" }
```

Its `tool.result` payload carries `call_id: "example-call"`, result `text`,
and optional `correlation_facts` and `edit_facts`.

Join the scheduled key to the result's call ID within the same session and
run. Task IDs, record IDs, span IDs and call IDs are separate identities.
Do not pair by adjacency or tool name. Keep ambiguous and unmatched
results visible. Render cards in proposal order.

Prefer `tool.result.text` to a matching lifecycle output chunk; displaying
both duplicates output. Preserve differing outputs as diagnostics.
Do not treat `final_result: true` as proof a background process has exited.
Explicit failures, cancellation and running states need distinct display.

## Content and timing limits

Original tool argument objects are not required by this reader. When
result JSON includes a command, path or edit metadata, show it as recorded
result information without inventing missing inputs.

An image notice or artifact path does not supply image bytes. Show an
unavailable-content placeholder; do not resolve arbitrary local paths or
fetch referenced resources. Unknown content remains inspectable.

Convert valid `recorded_at` values to milliseconds by dividing by 1,000.
Measure run start to terminal and tool start to terminal only when both
endpoints exist and the clock is usable. Sequence numbers order events;
they are not elapsed time. The prototype suppresses missing, backwards or
counter-like timestamps rather than displaying fabricated durations.

Reasoning, token usage, multiple intermediate assistant messages and
additional terminal variants are not fully modeled. Absence of supported
records must not be reported as zero usage or an empty reasoning trace.

## Synthetic example

[`src/__fixtures__/muse/muse-code.jsonl`](../../src/__fixtures__/muse/muse-code.jsonl)
is an invented recipe-editing conversation. The tests exercise pairing,
deduplication, run boundaries, missing data and invalid clocks.
