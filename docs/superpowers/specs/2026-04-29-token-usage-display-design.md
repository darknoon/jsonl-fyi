# Token Usage Per-Turn Display

## Goal

Surface how many tokens each turn used, inline with the existing
"✓ 1.2s" turn separator. One surface only:

- **Per-turn inline** — extend the existing turn separator with a compact
  tokens line.

A session footer / totals block is **out of scope for v1**: wall-time can't
be inferred reliably from a static jsonl (resumes, idle gaps), and a totals
block is more useful once we also have cost — which we don't have. Revisit
once we have a clearer story for both.

Cost ($) is also **out of scope for v1**: the jsonl does not carry it, and a
local pricing table would drift from reality.

## Per-turn line

Format, appended to the existing separator:

```
✓ 1.2s ↑6 ↻29.0k ↓165
```

- `↑` input the model freshly processed this turn — for Claude this is
  `input_tokens + cache_creation_input_tokens` (i.e. tokens read for the first
  time, regardless of whether they were also written to cache); for Codex it
  is `last_token_usage.input_tokens − cached_input_tokens`. Excluding
  cache-creation makes ↑ collapse to ~1 on every turn after the first, which
  is accurate but useless inline.
- `↻` cache-read input
- `↓` output

Cache-write is **omitted** — noisy (spikes on first turn, near-zero after)
and not useful at a glance without a totals view to compare against.

Numbers use SI-style abbreviation: `<1k` literal, `1k`–`999k` to one decimal
when needed (`29.0k`), `≥1M` with `M` (`1.2M`). Reuse a small helper.

If a turn has no usable usage data, drop the arrows section silently — keep
the duration alone.

### Per-turn aggregation

- **Claude**: a single request often emits multiple consecutive assistant
  rows (thinking + tool_use + text) sharing the same `message.id` and
  `requestId`, with the **same** usage values repeated on each row. Example
  from `__fixtures__/sample.jsonl` — request `req_011CaYf3Jpg3WbDJHh6Csowv`,
  message `msg_01JmbYMfSzLZKyoHkdjZiENa`, two assistant rows with identical
  `usage: { input:6, cache_creation:28960, cache_read:0, output:165 }`. The
  turn separator already fires on the row whose uuid matches a
  `turn_duration` parent — use *that row's* `message.usage`. Do **not** sum
  across rows from the same request.
- **Codex**: each turn ends with a `token_count` event whose
  `last_token_usage` is the per-turn delta (`input_tokens`,
  `cached_input_tokens`, `output_tokens`). The Codex transcript already maps
  separators by entry index; attach the matching `last_token_usage` to that
  separator.

## Components & data flow

New module: `src/transcript/usage.ts`
- `formatTokens(n: number): string` — SI abbreviation helper
- `type TurnUsage = { input: number; output: number; cacheRead: number }`
  (cache-write intentionally not tracked at this layer in v1)
- `extractClaudeTurnUsage(entry: AssistantMessageEntry): TurnUsage | null`
- `extractCodexTurnUsage(event): TurnUsage | null`

Wire-up:
- `buildTranscriptItems` (Claude) attaches a `TurnUsage | null` to each
  `separator` item alongside `durationMs`.
- The Codex transcript's separator-mapping pass does the same.
- `TurnSeparator` accepts an optional `usage?: TurnUsage` prop and renders
  the arrows after the duration label when present.

## Styling

- Per-turn arrows reuse the existing turn-separator typography (small, dim,
  same line). Use a single space between the duration and each arrow group;
  no extra padding. No new colors, no new borders.
- The existing "Done " prefix in `TurnSeparator` is dropped; the separator
  shows just `✓ 1.2s` (or `✓ 1.2s ↑… ↻… ↓…` when usage is present).
- Use existing CSS variables.

## Testing

- Unit tests for `formatTokens` (boundaries: 0, 999, 1000, 1500, 999_999,
  1_200_000).
- Unit tests for `extractClaudeTurnUsage` / `extractCodexTurnUsage` against
  fixture rows.
- Update `buildTranscriptItems` tests to assert `usage` is attached to
  separator items where expected.
- Snapshot test for `TurnSeparator` with and without usage.

## Out of scope for v1

- Session footer / totals card.
- Cost in dollars.
- Context-window utilization indicator.
- Per-tool token attribution.
- Hover tooltips / expanded breakdowns on the per-turn line.
- Cache-write tokens.
