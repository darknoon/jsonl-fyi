# Codex Transcript Support — Design

**Status:** Spec — ready for implementation plan.
**Depends on:** `2026-04-29-show-timestamps.md` is assumed landed (discriminated `Entry` union, `src/transcript/{timing.ts,EntryView.tsx,TranscriptHeader.tsx,TurnSeparator.tsx}`, `getBlocks` safe for non-message entries).

## Goal

Drop a Codex `rollout-*.jsonl` file onto jsonl-fyi and get a transcript that renders with parity to the existing Claude transcript view: user/assistant messages, reasoning, tool calls (rich for the common ones), tool outputs, and a session header.

## Out of scope (v1)

- Surfacing model info in the UI at all (a TODO exists for "Show model used", but the per-turn-chip approach is explicitly not the chosen treatment — design TBD)
- Token-usage display — covered by a separate cross-format spec (applies to both Codex and Claude Code)
- Ghost-snapshot diff summary (Codex emits commit SHAs only; rendering would require local repo access)
- Compaction-recovery message rendering — `compacted` events render as a thin "Conversation compacted" inline marker; we don't try to surface the replacement summary or hidden history

## Architecture

### 1. Format detection

A `classifyJsonl(lines: string[]): "claude" | "codex" | "unknown"` function takes up to the first ~10 non-empty parsed lines and decides:

- **Codex** if any line has `type === "session_meta"` or `type === "response_item"` or `type === "turn_context"` or `type === "event_msg"`
- **Claude** if any line has `type === "user"`/`"assistant"`/`"system"` AND the `message.content` is an array of Claude block types (or carries `uuid`/`parentUuid`)
- **Unknown** otherwise

The classifier is pure (input: parsed line objects, output: enum) and lives in `src/parse/classify.ts`. It must be unit-tested with fixtures from both formats and a synthetic "unknown" payload.

A separate validation script `scripts/validate-classifier.ts` runs the classifier against every `~/.claude/projects/**/*.jsonl` and `~/.codex/sessions/**/rollout-*.jsonl` on the user's machine and reports counts + any "unknown" hits. Run via `bun scripts/validate-classifier.ts`.

### 2. JSONL line streaming, separated from data-model parsing

The current `parseJsonl` does both line-splitting and entry coercion in one pass. Split into two:

- `iterJsonlLines(text: string): Generator<unknown>` — yields one parsed JSON value per non-empty line; swallows malformed lines and tracks a `skipped` count (returned via final value or a separate API). Format-agnostic.
- `parseClaudeEntries(lines: Iterable<unknown>): Entry[]` — existing Claude-specific filtering and shape coercion.
- `parseCodexEntries(lines: Iterable<unknown>): CodexEntry[]` — new, Codex-specific.

Generator-based so we don't materialize twice (once as strings, once as objects).

The top-level entry point in `App.tsx` becomes:

```ts
const lines = [...iterJsonlLines(text)] // or stream once for classify, once for parse
const format = classifyJsonl(lines.slice(0, 10))
if (format === "codex") return <CodexTranscript entries={parseCodexEntries(lines)} />
if (format === "claude") return <ClaudeCodeTranscript entries={parseClaudeEntries(lines)} />
```

The existing `<Transcript>` component (in `src/transcript/claude/Transcript.tsx`) is renamed to `<ClaudeCodeTranscript>` and its file to `ClaudeCodeTranscript.tsx`, for symmetry with `<CodexTranscript>`. (Claude and Codex use parallel data-model types — see §3 — and parallel top-level transcript components that share the same building blocks.)

### 3. Parallel types, shared rendering

Codex types live in `src/transcript/codex/types.ts` and mirror the wire shape directly:

```ts
export type CodexSessionMeta = {
  type: "session_meta"
  payload: {
    id: string
    timestamp?: string
    cwd?: string
    originator?: string
    cli_version?: string
    source?: string
    model_provider?: string
    git?: { commit_hash?: string; branch?: string; repository_url?: string } | null
  }
}

export type CodexTurnContext = {
  type: "turn_context"
  payload: { cwd?: string; model?: string; effort?: string; sandbox_policy?: unknown; approval_policy?: string; summary?: string }
}

export type CodexResponseItem = {
  type: "response_item"
  timestamp?: string
  payload:
    | { type: "message"; role: "user" | "assistant"; content: CodexContentItem[] }
    | { type: "reasoning"; summary: { type: "summary_text"; text: string }[]; content?: unknown; encrypted_content?: string }
    | { type: "function_call"; name: string; arguments: string; call_id: string }
    | { type: "function_call_output"; call_id: string; output: string }
    | { type: "custom_tool_call"; name: string; input: string; call_id: string; status?: string }
    | { type: "custom_tool_call_output"; call_id: string; output: string }
    | { type: "ghost_snapshot"; ghost_commit: { id: string; parent: string } }
    | { type: "web_search_call"; /* ... */ }
}

export type CodexContentItem =
  | { type: "input_text"; text: string }
  | { type: "output_text"; text: string }
  | { type: "input_image"; image_url: string }

export type CodexCompacted = { type: "compacted"; payload: { message: unknown; replacement_history: unknown } }

export type CodexEntry = CodexSessionMeta | CodexTurnContext | CodexResponseItem | CodexCompacted
```

Plus a `CodexEventMsg` type that we **parse but do not render** — kept around so the type captures everything we encounter, even though rendering only consumes `response_item` (see §4 for justification).

Shared rendering: the existing per-tool components in `src/transcript/claude/Tool.tsx` use `ToolCard.*`, `Header`, `Field`, `Output`, `Extras`, `EditDiff`. Codex tool components in `src/transcript/codex/CodexTool.tsx` use the same building blocks. They are siblings, not subclasses. No normalization layer.

`ImageBlock`, `ThinkingBlock`, `ToolCard`, `TranscriptHeader`, `TurnSeparator`, `shared.tsx` (`Header`/`Field`/`Output`/`Extras`/`hasOutput`), `EditDiff` remain in `src/transcript/` (already format-neutral).

### 4. Stream choice: response_item only, no event_msg

Empirically verified across the user's 468-session corpus:

- `response_item.message` (assistant) and `event_msg.agent_message` are byte-identical (sha-confirmed)
- `response_item.reasoning.summary[].text` flattened equals `event_msg.agent_reasoning.text` exactly (114 of each in test session, sha-confirmed)
- `response_item.message` (user) is a **superset** of `event_msg.user_message`: it includes auto-injected `<environment_context>` blocks the model actually saw

Tool calls only appear in `response_item` — `event_msg` has no equivalent for `function_call`/`custom_tool_call`.

Decision: consume `response_item` only. `event_msg` lines are dropped after parse. This is lossless (slightly richer, in fact) and avoids any cross-stream ordering reconciliation.

The injected `<environment_context>` user blocks are filtered before display (text starts with `<environment_context>` → hide). They're available in raw view if we ever build one.

### 5. Component layout

```
src/parse/
  classify.ts                  # NEW — classifyJsonl (format-agnostic)
  classify.test.ts             # NEW
  iter.ts                      # NEW — iterJsonlLines (format-agnostic generator)
src/parse.ts                   # DELETE — replaced; current contents are Claude-specific
src/transcript/
  claude/
    parse.ts                   # NEW (moved from src/parse.ts) — parseClaudeEntries
    parse.test.ts              # MOVED from src/parse.test.ts
    Transcript.tsx             # RENAMED → ClaudeCodeTranscript.tsx
    ClaudeCodeTranscript.tsx   # MODIFIED — exports ClaudeCodeTranscript
    Tool.tsx                   # unchanged (Claude tool dispatcher already lives here)
    EntryView.tsx              # unchanged
    ...                        # unchanged
  codex/
    types.ts                   # NEW — CodexEntry union
    parse.ts                   # NEW — line objects → CodexEntry[]
    parse.test.ts              # NEW
    v4a.ts                     # NEW — V4A patch parser → unified-diff strings
    v4a.test.ts                # NEW
    CodexTranscript.tsx        # NEW — top-level renderer
    EntryView.tsx              # NEW — per-entry renderer (parallel to claude/EntryView)
    Tool.tsx                   # NEW — dispatcher + per-tool components (parallel to claude/Tool.tsx)
    SessionHeader.tsx          # NEW — session_meta header card
    CompactedMarker.tsx        # NEW
src/App.tsx                    # MODIFIED — route to Codex vs Claude on classification
scripts/
  validate-classifier.ts       # NEW
docs/
  codex-corpus-stats.md        # already landed alongside this spec
```

The Claude path's parser moves into `src/transcript/claude/parse.ts` to mirror Codex's location at `src/transcript/codex/parse.ts`. Top-level `src/parse.ts` is deleted; the new `src/parse/` directory holds only format-agnostic helpers (`classifyJsonl`, `iterJsonlLines`). `App.tsx` updates its imports accordingly.

### 6. Tool components

Each Codex tool gets its own minimal component using the `ToolCard.Root → Trigger → Content` pattern. They mirror the Claude side's per-tool style.

| Tool name | Treatment | Notes |
|---|---|---|
| `shell_command` | Rich `<ShellCommand>` | Trigger header shows `command`; expanded body has `command` in `<pre>`, then `workdir`/`timeout_ms`/`login`/`sandbox_permissions`/`justification` as `<Field>`s, then `<Output>` |
| `exec_command` | Rich `<ExecCommand>` | Same idea, field is `cmd` not `command`; also `tty`/`yield_time_ms`/`max_output_tokens`/`prefix_rule`/`sandbox_permissions`/`justification` |
| `shell` | Rich `<Shell>` | Older variant, `command` is `string[]` — join with spaces for header/`<pre>`; `workdir`/`timeout_ms`/`with_escalated_permissions` as `<Field>`s |
| `apply_patch` | Rich `<ApplyPatch>` (custom_tool_call) | V4A parser → per-file `<PatchDiff>` from `@pierre/diffs/react`; falls back to raw `<pre>` on parse failure; `Delete File` shown as `Deleted: <path>` (no body recoverable) |
| `update_plan` | Rich `<UpdatePlan>` | Plan list, similar visual to Claude's `TodoWrite` |
| `view_image` | Rich `<ViewImage>` | Header: `Viewed image <basename>`; expanded body shows path as `<Field>`. If output parses as a JSON array containing `{type:"input_image", image_url}` blocks, render the image inline via existing `ImageBlock`. Otherwise render the raw output text in `<Output>`. **No invented commentary text.** |
| `spawn_agent` | Rich `<SpawnAgent>` | Header: `Spawned agent <agent_type>`; expanded shows the `message` prompt in `<pre>`, `agent_type`/`model`/`reasoning_effort`/`fork_context` as `<Field>`s. Output parses as `{agent_id, nickname}` and is shown as fields. |
| `wait_agent` | Rich `<WaitAgent>` | Header: `Waited for agent`; `targets` and `timeout_ms` as fields; output is the agent's final result rendered as text. |
| Anything else (MCP, `write_stdin`, future tools) | Generic `UnknownTool` reused from Claude path | Header `Ran <name>`; body lists every `arguments` field; standard `<Output>`. Need to extract `UnknownTool` from `claude/Tool.tsx` into a shared file (e.g. `src/transcript/UnknownTool.tsx`) so both paths can import it. |
| `web_search_call` (response_item subtype, not a `function_call`) | Rendered through `UnknownTool` with synthetic `name="web_search"` | Has no `arguments`/`output` pair; just shows the call existed. Handled in `CodexEntryView`, not the function-call dispatcher. |

Tool dispatch (in `CodexTool.tsx`) is a single `switch` on the wire-level `name` string, plus a separate switch for `custom_tool_call.name` (currently only `apply_patch`). Unknown tool names fall through to `UnknownTool`. The dispatcher is exhaustive over the names listed above; new known names require an explicit `case`.

#### V4A parser (`v4a.ts`)

Pure function, no React. Signature:

```ts
export type V4AFile =
  | { op: "add"; path: string; unifiedDiff: string }
  | { op: "update"; path: string; movedTo?: string; unifiedDiff: string }
  | { op: "delete"; path: string }

export function parseV4A(patch: string): { files: V4AFile[] } | { error: string; raw: string }
```

Grammar handled:

- `*** Begin Patch` / `*** End Patch` envelope
- `*** Add File: <path>` — body is `+`-prefixed lines → emit unified diff with `--- /dev/null`/`+++ b/<path>` and one hunk
- `*** Delete File: <path>` — no body; emit `op: "delete"` with no diff
- `*** Update File: <path>` (optional `*** Move to: <newpath>`) followed by hunks separated by `@@` (with optional anchor like `@@ class Foo` — anchor is dropped for display)
- Within a hunk: leading-space context, `-` removed, `+` added → emit standard unified hunk header `@@ -1,N +1,M @@\n<body>\n` (line numbers are synthetic; we display, we don't apply)
- `*** End of File` marker tolerated (and ignored — we don't need EOF-awareness for display)

On parse failure (malformed envelope, unknown directive, hunk without `@@`, etc.), return the `error` branch and the `ApplyPatch` component renders the raw input in `<pre>`. Tested with fixtures including: single-file update, multi-file patch, add+delete in same patch, move with no content change, anchor lines, malformed input.

### 7. Session header

`<SessionHeader>` is a small card rendered at the top of `<CodexTranscript>` (above the existing `<TranscriptHeader>` from timestamps work). Pulls from the single `session_meta` line:

- Branch and short (7-char) commit hash, plain text
- Repository URL (display only)
- `cwd` (truncated via `shortPath`)
- Codex CLI version + originator (e.g. `codex_sdk_ts 0.75.0`)

If `session_meta` is missing (corrupted file) the header is silently omitted.

### 8. Compacted-event marker

Each `{type: "compacted"}` line renders as a thin `<CompactedMarker>` row inline at its position in the entry list — visually similar to `<TurnSeparator>` but with text "Conversation compacted". 22 instances exist in the user's corpus; one component, ~10 lines.

### 9. Reasoning rendering

`response_item.reasoning.summary[]` is an array of `{type: "summary_text", text}` items. They group naturally — multiple `summary[]` entries belong to the same logical reasoning block. Render: one `<ThinkingBlock>` per `response_item.reasoning` line, with the `summary[].text` items joined by blank lines. We don't surface `encrypted_content` or `content` (typically null in observed data — if non-null in future logs, append after the summary; this is a forward-compatible no-op today).

### 10. User/assistant messages

`response_item.message`:
- `role: "user"` with `content[0].type === "input_text"` and text starting with `<environment_context>` → hide entirely (auto-injected by harness; not user-authored)
- All other `role: "user"` → render as user text block
- `role: "assistant"` with `output_text` content → render as assistant text block (markdown-aware once Claude side has it; see TODO "Render limited agent markdown" — same renderer should be used)
- `input_image` content items inside user messages → render via existing `ImageBlock`

### 11. Tool call ↔ output pairing

Codex pairs by `call_id` (parallel to Claude's `tool_use_id`). One pre-pass over `CodexResponseItem`s indexes outputs by `call_id`; the renderer looks up the matching output for each `function_call`/`custom_tool_call` (analogous to the existing Claude `results` map in `Transcript.tsx`).

`web_search_call` and any future implicit tool the model emits without a paired output are rendered with no output panel.

### 12. Sub-agent rendering (sidechains)

`spawn_agent`/`wait_agent` are rendered as flat tool calls in v1 (no nested transcript expansion). The full agent transcript is not in this rollout file — it lives in a separate Codex session file the user could load independently. Future enhancement: when a spawned agent's session id matches another loaded file, link to it.

### 13. Corpus stats doc

`docs/codex-corpus-stats.md` summarizes observed-format prevalence in the user's local corpus as of 2026-04-29. Includes: total session count, date range, top-level type counts, response_item subtype counts, function-call tool-name frequencies, view_image output-format breakdown, custom_tool_call names, and notable observations (workdir is optional, `cmd` vs `command` field rename across versions, image bytes embedded in ~25% of view_image outputs). Kept as a one-shot snapshot — not auto-regenerated.

## Testing

- `classify.test.ts` — fixtures for both formats + synthetic unknown payload.
- `parseCodex.test.ts` — small fixture with one of each `response_item.payload.type`; assert `CodexEntry[]` shape.
- `v4a.test.ts` — single-file update, multi-file, add+delete, move, anchor lines, malformed (assert error branch). Snapshot the produced unified-diff string per case.
- Validation script (`scripts/validate-classifier.ts`) runs across all local logs; failure if any "unknown" hits or if any Codex log fails to fully parse without a parser error.
- No React-component tests (no harness in this project); manual browser verification covers rendering.

## Open follow-ups (post-v1)

- Model-info display (TODO filed; treatment not yet decided)
- Markdown rendering of assistant text (TODO already filed; benefits Claude side too)
- Linked sub-agent transcript navigation
- Compaction history surfacing
- Compact rendering modes (TODO already filed: Normal/Expanded/Raw)
