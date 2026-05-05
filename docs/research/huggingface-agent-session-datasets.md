# Hugging Face agent session datasets — reference

Research snapshot as of 2026-05-05.

## Question

Can Hugging Face datasets store agent transcript JSONL files as session-level
rows, where the full conversation is one data item, instead of treating each
JSONL line as a separate row?

## Short answer

Yes. This is now directly supported on the Hugging Face Hub for agent traces.
Hugging Face's April 7, 2026 changelog says users can upload Claude Code,
Codex, and Pi JSONL traces directly to Hugging Face Datasets; the Hub
auto-detects the trace format, tags the dataset as `Traces`, and provides a
dedicated viewer for sessions, turns, tool calls, and model responses.

- https://huggingface.co/changelog/agent-trace-viewer

For Dataset Viewer table access, public examples also publish or auto-generate
session-level rows where one JSON object represents one session. That row can
store either the parsed event array or the raw JSONL text.

The default `load_dataset("json")` behavior is still row-oriented: each JSON
object line becomes one dataset row. That matters for Python dataset loading,
but it is no longer the only relevant path for hosted viewing because the Hub's
agent trace viewer can operate on native session JSONL files.

There is also a separate Hugging Face trace-file path: datasets tagged/formatted
as agent traces can expose individual `.jsonl` files with a trace-specific file
viewer. That is different from the Dataset Viewer table, and may be the more
relevant precedent for a hosted transcript experience.

## Hugging Face support

### Agent trace viewer

The Hub supports direct upload of local agent session JSONL files. The official
changelog lists these local session directories:

- Claude Code: `~/.claude/projects`
- Codex: `~/.codex/sessions`
- Pi: `~/.pi/agent/sessions`

It describes this as requiring no preprocessing, with the Hub auto-detecting
trace formats and adding a dedicated viewer for browsing sessions, turns, tool
calls, and model responses:

- https://huggingface.co/changelog/agent-trace-viewer

This is the strongest precedent for jsonl-fyi import/export because it matches
native session files rather than a normalized training schema.

Agent trace datasets are also discoverable through the Hub dataset filters. The
filtered dataset index currently exposes a `Traces` type / `agent-traces`
filter, and the URL form uses `format=format:agent-traces`:

- https://huggingface.co/datasets?format=format:agent-traces&sort=trending

As of this snapshot, that filter lists 60 datasets, including examples such as
`clem/ml-intern-sessions`, `ultralazr/claude-code-traces`,
`victor/claude-code-sessions`, `lukawskikacper/openai-agent-traces`, and
`cfahlgren1/agent-sessions-list`.

### Hub browser surfaces

The relevant Hugging Face surface for jsonl-fyi is the Hub website, not Python
dataset loading. There are three browser-visible paths:

- Dataset index discovery: agent traces are filterable as `Traces`, with URL
  form `format=format:agent-traces`.
- Dataset file browser: native session `.jsonl` files can open with a trace
  viewer, showing sessions, turns, tool calls, and responses instead of only raw
  code.
- Dataset Viewer table: some trace datasets also expose a table view with rows
  such as `harness`, `session_id`, `traces`, and `file_path`.

The Hub upload docs describe creating a dataset repo through the browser,
choosing public/private visibility, and dragging files into the
`Files and versions` tab:

- https://huggingface.co/docs/hub/datasets-adding

The repository structure docs are relevant only insofar as they affect what the
Hub website can preview in Dataset Viewer:

- https://huggingface.co/docs/hub/datasets-data-files-configuration

Python `load_dataset()` support is useful background for downstream consumers,
but it is not the key product precedent for a share/import button in jsonl-fyi.

## Observed patterns

### Native agent-trace files

Store one JSONL file per session directly in the dataset repository. Hugging
Face can recognize these as agent traces when the dataset is configured/tagged
appropriately, and the file page can show a `trace` view in addition to the raw
file.

The official changelog says no preprocessing is needed for Claude Code, Codex,
or Pi local session JSONL files. In practice, this means the native-file pattern
should be treated as the primary export target, not merely a companion artifact.

Example file path:

```text
claude_code__claude-opus-4-6__high__enabled.jsonl
```

The clem trace datasets show this behavior: individual JSONL files appear as
`Claude Code trace` files with a `trace`/`code` toggle in the Hugging Face file
browser. This preserves the file-level mental model that jsonl-fyi already
uses, while still allowing Hugging Face to build a Dataset Viewer table from the
same repository.

### Raw JSONL files plus session index

Keep the original `*.jsonl` files in the repository for fidelity, then add a
derived `sessions.jsonl` where each line is one session.

Example shape:

```json
{
  "session_id": "019d2fac-0b38-70f0-baff-a394265d8291",
  "file_name": "rollout-2026-03-27T09-21-37-019d2fac-0b38-70f0-baff-a394265d8291.jsonl",
  "raw_jsonl": "{\"timestamp\":\"...\"}\n{\"timestamp\":\"...\"}\n..."
}
```

This is simple and preserves the exact original file content, but viewers need
to split and parse `raw_jsonl` before rendering.

### Parsed trace list

Store a structured list column containing all JSONL entries for the session.

Example shape:

```json
{
  "harness": "codex",
  "session_id": "019d2fac-0b38-70f0-baff-a394265d8291",
  "file_path": "sessions/2026-05-05/019d2fac-0b38-70f0-baff-a394265d8291.jsonl",
  "traces": [
    { "timestamp": "2026-03-27T14:21:42.391Z", "type": "session_meta", "payload": {} }
  ]
}
```

This is easier for browser import and HF Dataset Viewer inspection, but it is
not the primary Hub trace-viewing path. The native `.jsonl` file viewer is more
directly aligned with jsonl-fyi.

### Normalized trajectory column

Research datasets often normalize agent logs into a `trajectory` column. This
is common for SWE-agent and OpenHands datasets. It is useful for model training,
but it does not preserve native Codex or Claude Code transcript fidelity unless
the conversion is deliberately lossless.

## Public examples

### `cfahlgren1/codex-sessions`

https://huggingface.co/datasets/cfahlgren1/codex-sessions

This is the closest Codex-specific example found. The dataset card describes an
archive of raw OpenAI Codex CLI session files plus a derived one-row-per-session
view. Raw `rollout-*.jsonl` files remain in the repo, and `sessions.jsonl`
stores one row per session with `session_id`, `file_name`, and `raw_jsonl`.

This directly validates the `raw_jsonl` import shape for jsonl-fyi.

### `ultralazr/claude-code-traces`

https://huggingface.co/datasets/ultralazr/claude-code-traces

This stores redacted Claude Code session traces. Each file is a native JSONL
session, and Hugging Face auto-converts it to a Parquet-backed viewer with one
row per session. Columns include `harness`, `session_id`, `traces`, and
`file_path`/`file_name`.

This validates the parsed `traces` import shape.

### `clem/ml-intern-sessions`

https://huggingface.co/datasets/clem/ml-intern-sessions

This contains ML Intern coding-agent sessions uploaded as JSON Lines files under
`sessions/`, with one file per session. The files are converted to a
Claude-Code-style event stream for the Hugging Face Agent Trace Viewer.

This suggests a broader emerging convention around Claude-Code-style trace
streams for agent session viewing.

### `clem/hf-coding-tools-traces`

https://huggingface.co/datasets/clem/hf-coding-tools-traces

This rehydrates benchmark results into JSONL sessions consumed by the Hugging
Face Agent Trace Viewer. The dataset covers `claude_code`, `codex`, `copilot`,
and `cursor` configurations. The visible dataset rows use `harness`,
`session_id`, `traces`, and `file_path`.

This is useful because it includes Codex as a tool label, though the sessions
are rendered through a Claude-Code-style schema rather than raw Codex rollouts.
The repository also demonstrates Hugging Face's richer agent-trace file view:
individual files such as
`claude_code__claude-opus-4-6__high__enabled.jsonl` are recognized as
`Claude Code trace` files and can be opened in a trace view from the file
browser.

### `nebius/SWE-agent-trajectories`

https://huggingface.co/datasets/nebius/SWE-agent-trajectories

This is a large software-agent trajectory dataset. It has one row per
trajectory and a `trajectory` column containing the logged agent trajectory,
alongside metadata such as `instance_id`, `model_name`, `target`,
`exit_status`, `generated_patch`, and `eval_logs`.

This validates the broader "one agent trajectory per row" pattern.

### `nebius/SWE-rebench-openhands-trajectories`

https://huggingface.co/datasets/nebius/SWE-rebench-openhands-trajectories

This stores OpenHands trajectories with a `trajectory` list column, plus
metadata columns including `trajectory_id`, `instance_id`, `repo`, `tools`,
`model_patch`, `exit_status`, and evaluation fields. The dataset card describes
`trajectory` as complete conversation history with `system`, `assistant`,
`user`, and `tool` roles.

This is a strong example for normalized training-oriented trajectory storage,
but it is less directly aligned with native transcript replay.

## Related tooling

### Hugging Face native upload

The Hub itself is now the baseline: for Claude Code, Codex, and Pi, the
official path is to upload native JSONL session files from the local session
directories. The Hub auto-detects trace formats and renders them with the Agent
Trace Viewer.

- https://huggingface.co/changelog/agent-trace-viewer

This is not a CLI workflow by itself. It says the storage/viewing side is
supported, but users still need a collection, redaction, review, and upload
workflow if they want to publish real traces safely.

### `badlogic/pi-share-hf`

https://github.com/badlogic/pi-share-hf

Pi-specific CLI for collecting, redacting, reviewing, and uploading Pi coding
agent sessions to a Hugging Face dataset. It is incremental and project-scoped:
collect changed sessions, redact exact secrets, filter deny patterns, scan with
TruffleHog, run LLM review, manually reject risky sessions, then upload.

The dataset layout is simple:

```text
manifest.jsonl
<session>.jsonl
```

This is currently the strongest single-agent example of a safety-conscious
`share to HF` workflow.

### `JayFarei/opentraces`

https://github.com/JayFarei/opentraces

Multi-agent trace capture/review/publish tool. It presents itself as an open
schema plus CLI for collecting, reviewing, and publishing agent traces to
Hugging Face Hub. Its project page describes support across dev-time agents
including Claude Code, Codex, Cursor, and OpenCode, plus runtime agents such as
Hermes, NemoClaw, OpenClaw, and DeepAgents.

The workflow is broader than native HF trace upload: it parses sessions into a
normalized `TraceRecord` schema, enriches with task/model/token/git metadata,
runs regex/entropy/optional TruffleHog/optional LLM review, stages traces for
local review, and publishes sharded JSONL datasets.

This is the closest thing found to a cross-agent `pi-share-hf` equivalent, but
it is opinionated toward a normalized schema and trace attribution, not just
uploading native session files.

### `traces.com`

https://traces.com/

Hosted trace-sharing product rather than a Hugging Face publishing tool. It has
a CLI and sharing flow for coding-agent sessions, with public/private/direct
visibility and scrubbing on publish. The site claims support for 10+ agents and
lists Claude Code, Cursor, OpenCode, Codex, Gemini CLI, Pi, Amp, Cline,
OpenClaw, GitHub Copilot, Hermes, and Droid.

This is relevant product precedent for import/share UX, but it is not the same
as pushing open datasets to Hugging Face.

### `cc-share-hf`

`ultralazr/claude-code-traces` says it was exported with `cc-share-hf`, with
deterministic secret redaction and LLM review. I did not find a public GitHub
repository for `cc-share-hf` in this pass, so treat it as an observed tool name
from the dataset card rather than a confirmed reusable project.

## Tooling takeaway

There does not appear to be a polished, per-agent `*-share-hf` project for every
agent. The landscape looks more like:

- HF supports native trace files for Claude Code, Codex, and Pi.
- Pi has a purpose-built safe uploader: `pi-share-hf`.
- Claude Code has at least one observed uploader name, `cc-share-hf`, but a
  public project was not found.
- Codex examples exist as datasets, but I did not find a Codex-specific
  `codex-share-hf` style tool.
- Cross-agent tools are emerging (`opentraces`, `traces.com`), but they either
  normalize traces into their own schema or publish to their own hosted service.

That leaves room for jsonl-fyi to provide a lightweight, native-format HF import
and export workflow across the formats it already understands.

## Product opportunities for jsonl-fyi

There are two clear product jobs. They should be treated as separate features,
not one broad "HF support" bucket.

### 1. Open a Hugging Face trace URL in jsonl-fyi

User story:

> I have a Hugging Face dataset/file URL for an agent trace. Open it in
> jsonl-fyi so I can use our viewer instead of the Hub viewer.

Likely inputs:

- direct file page:
  `https://huggingface.co/datasets/<owner>/<dataset>/blob/main/<path>.jsonl`
- raw/resolve URL:
  `https://huggingface.co/datasets/<owner>/<dataset>/resolve/main/<path>.jsonl`
- dataset page tagged `format:agent-traces`, where the user still needs to pick
  a trace file.

Implementation shape:

1. Parse the HF URL.
2. If it is a file URL, convert `/blob/` to `/resolve/` and fetch the raw JSONL.
3. Feed the downloaded text into the existing classifier/parser.
4. If it is a dataset URL, list candidate `.jsonl` files and let the user pick
   one.
5. Preserve HF metadata in the transcript header: repo id, revision, path, and
   source URL.

Questions to verify before implementation:

- Whether browser-side `fetch()` to `huggingface.co/.../resolve/...` has the
  right CORS behavior for public dataset files.
- Whether private/gated dataset imports should be supported in-browser with an
  optional read token, or deferred.

This is the highest-value import feature because it maps directly to the way HF
already exposes agent traces in the browser.

### 2. Share the currently viewed trace to Hugging Face

User story:

> I loaded or dragged a transcript into jsonl-fyi. Let me publish that same
> trace to a Hugging Face dataset so I can share it with a URL.

This is not a generic "export bundle" feature. The action is specifically:
upload the trace currently open in the viewer as a native `.jsonl` file in a
Hugging Face dataset repository.

Auth requirements:

- The user needs a Hugging Face account.
- For a web app, the practical first version is a user-provided HF token.
- Prefer a fine-grained token scoped to the target dataset repo with write
  access.
- If creating a new dataset repo from jsonl-fyi, the token needs permission to
  create/write datasets for the user or target organization.
- jsonl-fyi should not persist the token; keep it in memory for the upload.

Flow:

1. User clicks `Share to Hugging Face`.
2. jsonl-fyi shows a privacy/redaction warning before auth or upload.
3. User provides an HF token, or a future OAuth/app flow authenticates them.
4. User chooses:
   - existing dataset repo, or create new dataset repo;
   - public/private visibility for new repos;
   - target file path/name.
5. jsonl-fyi writes the currently viewed transcript as native JSONL.
6. jsonl-fyi uploads the file to the selected HF dataset repo.
7. jsonl-fyi returns the Hugging Face file URL, which should open in HF's Agent
   Trace Viewer if the format is recognized.

Upload format:

- Primary artifact: one native `.jsonl` session file.
- Optional later artifact: `manifest.jsonl` listing uploaded sessions, similar
  to `pi-share-hf`.
- Avoid requiring a normalized `traces` table for the first version. HF's own
  trace viewer works from native session files, and jsonl-fyi already operates
  on native JSONL.

Privacy requirement:

The push flow must include a review gate. Coding-agent transcripts commonly
contain prompts, terminal output, source snippets, file paths, repo names,
credentials pasted by accident, and private task context. `pi-share-hf` is the
best precedent here because it treats redaction/review as part of publishing,
not an afterthought.

### Non-goals for the first version

- Do not build a training-dataset exporter around `trajectory` columns.
- Do not prioritize Parquet or Dataset Viewer row import.
- Do not normalize Codex/Claude/Pi into a new cross-agent schema before upload.
- Do not require `load_dataset()` compatibility as the main design constraint.

When searching the Hub, jsonl-fyi should still use the `format:agent-traces`
tag/filter to discover likely trace datasets.
