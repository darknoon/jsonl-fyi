# Per-Turn Model Display

## Goal

Show which model produced each turn, and surface mid-session model changes
without visual noise on typical single-model sessions.

Two surfaces:

- **Transcript header** — the initial model (and Codex effort) shown once,
  alongside the existing chat-start timestamp.
- **TurnSeparator** — a per-turn model label appears only on turns where
  the model (Claude) or model/effort (Codex) differs from the previous
  turn.

A single-model session therefore shows the model exactly once (in the
header). Mid-session switches surface inline at the point of change.

## Display format

- **Claude:** `Opus 4.7` — light normalization of known ids
  (`claude-opus-4-7` → `Opus 4.7`, `claude-sonnet-4-6` → `Sonnet 4.6`,
  `claude-haiku-4-5*` → `Haiku 4.5`). Unknown ids fall back to the raw
  string.
- **Codex:** `GPT-5.5/high` — model id capitalized (`gpt-5.5` → `GPT-5.5`),
  effort joined with `/`. Effort is whatever string the
  `turn_context.effort` carries (`low | medium | high | xhigh | max | auto`),
  rendered as-is. If effort is absent, omit the slash and effort.
- The model label has a `title=` attribute carrying the raw provider id
  (`claude-opus-4-7`, `gpt-5.5`) for hover inspection.
- No arrow glyph on the per-turn marker.

Examples:

- Header: `Opus 4.7 • Yesterday, 4:00 PM`
- Header: `GPT-5.5/high • Yesterday, 4:00 PM`
- Per-turn marker (model change mid-session): `Sonnet 4.6` rendered next
  to the existing duration / token usage on the separator.

## Data sources

### Claude

- Each assistant row carries `message.model` (e.g. `claude-opus-4-7`).
  This is the per-turn signal.
- The `<synthetic>` model used by Claude Code's internal/system rows is
  **ignored** when computing transitions — it is not a real model change.
- **Effort is out of scope for Claude in v1.** The `/effort` slash
  command in current Claude Code versions does not emit a structured
  event in the jsonl. An older `ultrathink_effort` attachment exists in
  pre-`2.1.123` sessions but corresponds to a different code path
  (magic-keyword detection); we will not display effort for Claude until
  there is a reliable signal for it.

### Codex

- Each turn is preceded by a `turn_context` event carrying `model` and
  optional `effort`.
- The header uses the first `turn_context`'s model/effort.
- A per-turn marker fires when either field differs from the previous
  turn's effective values.

## Per-turn change detection

Walk transcript items in order. Track `(model, effort)` of the previously
seen turn. On each turn, compare:

- Claude: compare `message.model` only
- Codex: compare `(model, effort)` pair

Emit a marker on the current turn's separator if either differs.
The first turn always sets the baseline (no marker rendered for it,
because the header already carries the same information).

## Components & data flow

New module: `src/transcript/model.ts`

- `type ModelDisplay = { label: string; raw: string }` — formatted name
  plus raw id for tooltip
- `formatClaudeModel(raw: string): ModelDisplay`
- `formatCodexModel(raw: string, effort?: string): ModelDisplay`
- `isSyntheticClaudeModel(raw: string): boolean` — true for `<synthetic>`
  and any other non-model placeholder we discover

Wire-up:

- `TranscriptHeader` accepts an optional `model?: ModelDisplay` prop and
  renders `{label} • {date}` when present, with `title={raw}` on the
  label span. Falls back to today's existing `{date}` when absent.
- `buildTranscriptItems` (Claude) attaches an optional
  `model?: ModelDisplay` to each `separator` item. The attached value is
  populated only when the separator's turn introduces a model different
  from the previous turn (synthetic rows skipped).
- The Codex transcript's separator-mapping pass attaches the same field,
  using `(model, effort)` from the most recent `turn_context`.
- `TurnSeparator` accepts an optional `model?: ModelDisplay` prop and
  renders the label after the duration / token usage when present.
- The transcript root component derives an initial `ModelDisplay` from
  the first non-synthetic turn and threads it through to
  `TranscriptHeader`.

## Styling

- The header model label and the per-turn marker reuse the existing
  separator/header typography (small, dim, same line). No new colors,
  no new borders.
- A single space separates the label from neighboring elements
  (`✓ 1.2s ↑6 ↻29.0k ↓165 Sonnet 4.6`).
- The label span has `title={raw}` so hover reveals the full provider id.

## Testing

- Unit tests for `formatClaudeModel` covering the normalization map and
  fallback for unknown ids.
- Unit tests for `formatCodexModel` covering effort present/absent.
- Unit test for `isSyntheticClaudeModel`.
- Tests for `buildTranscriptItems` (Claude) asserting `model` is
  attached to a separator only on turns where the model changes, and
  that synthetic rows are ignored when detecting changes.
- Equivalent test for the Codex separator-mapping pass covering both
  model and effort transitions.
- Snapshot test for `TurnSeparator` with and without `model`.
- Snapshot test for `TranscriptHeader` with and without `model`.

## Out of scope for v1

- Sub-agent / sidechain models (Task tool card header, sidechain
  separators). Easy to add later — we already parse the requested model
  on the Task tool input.
- Claude effort display (no reliable jsonl signal in current versions).
- Codex `auto` effort resolution (we render the literal string the
  transcript carries; we do not attempt to compute the chosen tier).
- Speed / service tier surfaces (separate concept; not part of model
  identity).
- Session-level totals or footer summaries.
