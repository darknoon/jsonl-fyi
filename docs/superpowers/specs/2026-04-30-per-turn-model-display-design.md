# Per-Turn Model Display

## Goal

Show which model produced each turn, and surface mid-session model changes
without visual noise on typical single-model sessions.

Two surfaces:

- **Transcript header** — every distinct model (and Codex effort
  variant) used during the session, listed once, in discovery order,
  alongside the existing chat-start timestamp.
- **TurnSeparator** — when the session uses more than one distinct
  model/effort, **every** turn separator carries a model label. When
  the session is single-model (single Codex `(model, effort)` pair),
  no separators carry a label.

A single-model session therefore shows the model exactly once (in the
header) and carries no per-turn markers. Multi-model sessions list every
distinct value in the header and label every separator so the model for
any given turn is answerable without scrolling.

## Display format

- **Claude:** `Opus 4.7` — pattern-based normalization. Match
  `^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?(?:-\d{6,})?$` and
  render as `${TitleCase(family)} ${major}${minor ? "." + minor : ""}`.
  Examples:
  - `claude-opus-4-7` → `Opus 4.7`
  - `claude-opus-4-5-20251101` → `Opus 4.5` (date suffix discarded)
  - `claude-haiku-4-5-20251001` → `Haiku 4.5`
  - `claude-sonnet-4-20250514` → `Sonnet 4` (`family-major-<date>` shape
    with no minor — also a legitimate forward shape, not legacy. The
    minor group declines to match an 8-digit date, the trailing date
    group swallows it.)
  - `claude-opus-5-0` → `Opus 5.0` (future major bump)
    Anything that does not match falls back to the raw id. Dedup uses the
    raw id, not the label, so two distinct raw ids with the same rendered
    label would appear as two header entries (verified absent across 957
    observed sessions, so this is theoretical).
- **Codex:** `GPT 5.5/high` — pattern-based. Match
  `^gpt-(\d+(?:\.\d+)?)(?:-(.+))?$` and render as `GPT ${version}`
  (space between brand and version, matching Claude's `Opus 4.7` style),
  preserving a suffix when present with a space separator
  (`gpt-5.2-codex` → `GPT 5.2 codex`, `gpt-5.5` → `GPT 5.5`). Effort is
  joined with `/` and rendered as the literal string the
  `turn_context.effort` carries (`low | medium | high | xhigh | max | auto`).
  If effort is absent, omit the slash and effort. Anything that does not
  match falls back to the raw id.
- The model label has a `title=` attribute carrying the raw provider id
  (`claude-opus-4-7`, `gpt-5.5`) for hover inspection.

Examples:

- Header (single model): `Opus 4.7 • Yesterday, 4:00 PM`
- Header (Codex single config): `GPT 5.5/high • Yesterday, 4:00 PM`
- Header (multi-model, discovery order): `Opus 4.7, Sonnet 4.6 • Yesterday, 4:00 PM`
- Header (Codex with mid-session effort change):
  `GPT 5.5/high, GPT 5.5/medium • Yesterday, 4:00 PM`
- Per-turn marker (model change mid-session): `Sonnet 4.6` rendered next
  to the existing duration / token usage on the separator.

Header list rules:

- Each entry is the same `ModelDisplay` (label + raw-id tooltip) used on
  separators.
- Order is **discovery order** — first observation in the transcript,
  ignoring `<synthetic>` rows.
- Entries are deduped on the same key used for change detection: model
  string for Claude, `(model, effort)` pair for Codex.
- Separator: comma + space. No truncation in v1 (sessions in practice
  use ≤ 2–3 distinct values).

## Data sources

### Claude

- Each assistant row carries `message.model` (e.g. `claude-opus-4-7`).
  This is the per-turn signal.
- The `<synthetic>` model used by Claude Code's internal/system rows is
  **ignored** for both the discovery list and per-turn labels — it is
  not a real model.
- **Effort is out of scope for Claude in v1.** The `/effort` slash
  command in current Claude Code versions does not emit a structured
  event in the jsonl. An older `ultrathink_effort` attachment exists in
  pre-`2.1.123` sessions but corresponds to a different code path
  (magic-keyword detection); we will not display effort for Claude until
  there is a reliable signal for it.

### Codex

- Each turn is preceded by a `turn_context` event carrying `model` and
  optional `effort`.
- A turn's effective `(model, effort)` is the most recent `turn_context`
  preceding it. This pair is the per-turn signal; the discovery list
  dedupes on it.

## Per-turn labeling

Two-pass:

1. **Discovery pass.** Walk the transcript in order, collecting the set
   of distinct values for each turn's effective model/effort. Skip
   `<synthetic>` Claude rows. The result is an ordered, deduped list of
   `ModelDisplay` entries — what the header renders.
2. **Decision.** If the list has length 1, no separator carries a model
   label. If the list has length ≥ 2, every separator carries the
   `ModelDisplay` for that turn's effective value.

The compare key is `message.model` for Claude and `(model, effort)` for
Codex (effort comes from the most recent `turn_context` preceding the
turn).

## Components & data flow

New module: `src/transcript/model.ts`

- `type ModelDisplay = { label: string; raw: string }` — formatted name
  plus raw id for tooltip
- `formatClaudeModel(raw: string): ModelDisplay`
- `formatCodexModel(raw: string, effort?: string): ModelDisplay`
- `isSyntheticClaudeModel(raw: string): boolean` — true for `<synthetic>`
  and any other non-model placeholder we discover

Wire-up:

- `TranscriptHeader` accepts an optional `models?: ModelDisplay[]` prop
  and renders `{labels.join(", ")} • {date}` when present, with
  `title={raw}` on each label span. Falls back to the existing `{date}`
  when absent or empty.
- `buildTranscriptItems` (Claude) does the two-pass labeling: builds the
  discovery-order list, then attaches `model?: ModelDisplay` to every
  separator item iff the list length is ≥ 2 (synthetic rows skipped).
  Returns the list alongside the items.
- The Codex transcript's separator-mapping pass does the same, using
  `(model, effort)` from the most recent `turn_context` preceding each
  turn.
- `TurnSeparator` accepts an optional `model?: ModelDisplay` prop and
  renders the label after the duration / token usage when present.
- The transcript root component threads the discovery-order list to
  `TranscriptHeader`.

## Styling

- The header model label and the per-turn marker reuse the existing
  separator/header typography (small, dim, same line). No new colors,
  no new borders.
- A single space separates the label from neighboring elements
  (`✓ 1.2s ↑6 ↻29.0k ↓165 Sonnet 4.6`).
- The label span has `title={raw}` so hover reveals the full provider id.

## Testing

- Unit tests for `formatClaudeModel` covering the regex normalization:
  - `claude-opus-4-7` → `Opus 4.7`
  - `claude-opus-4-5-20251101` → `Opus 4.5`
  - `claude-haiku-4-5-20251001` → `Haiku 4.5`
  - `claude-sonnet-4-20250514` → `Sonnet 4` (no-minor + date)
  - `claude-opus-5-0` → `Opus 5.0` (future major)
  - Non-matching id (e.g. `claude-something-else`) falls back to raw.
- Unit tests for `formatCodexModel` covering effort present/absent,
  brand-version spacing (`gpt-5.5` → `GPT 5.5`), and suffix preservation
  (`gpt-5.2-codex` → `GPT 5.2 codex`), plus a non-matching fallback case.
- Unit test for `isSyntheticClaudeModel`.
- Tests for `buildTranscriptItems` (Claude):
  - Single-model session: header list has one entry; no separator
    carries a `model`.
  - Multi-model session: header list has all distinct values in
    discovery order; every separator carries the `ModelDisplay` for its
    turn's effective model.
  - Synthetic rows are excluded from the discovery list and from the
    per-turn labels.
- Equivalent test for the Codex separator-mapping pass covering both
  model and effort, including a session that toggles `(model, effort)`
  back and forth (header lists all distinct pairs once; every separator
  carries its turn's pair).
- Snapshot test for `TurnSeparator` with and without `model`.
- Snapshot test for `TranscriptHeader` with empty, single-entry, and
  multi-entry `models`.

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
