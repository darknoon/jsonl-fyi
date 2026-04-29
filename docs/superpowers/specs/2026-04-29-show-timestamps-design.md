# Show Timestamps — Design

Status: approved
Date: 2026-04-29

## Goal

Surface "significant" timestamps in the transcript view so the reader can orient
in time without crowding individual messages.

Two surfaces:

1. **Header** — when the chat happened, relative to now, in the user's locale.
2. **Per-turn separator** — how long each assistant turn took, between turns.

## Header

Render the first entry's `timestamp` (the chat-started time) at the top of the
transcript, formatted relative to "now" using the browser locale.

Format rules:

- **Today** → `Today, 2:15 PM`
- **Yesterday** → `Yesterday, 2:15 PM`
- **Within last 6 days** → `Friday, 2:15 PM`
- **Same calendar year** → `April 16, 2:15 PM`
- **Older** → `April 16, 2024, 2:15 PM`

Implemented with `Intl.DateTimeFormat`. AM/PM vs. 24h, weekday names, and month
names follow the user's locale automatically. "Today" / "Yesterday" are computed
in the user's local timezone (compare local calendar dates, not UTC).

## Per-turn separator

When a turn ends, render a small centered, lighter-weight label between the
last assistant message of that turn and whatever comes next:

```
                            14.9s
```

No horizontal rule. Muted color, smaller font. The component is designed as a
slot host so we can add more metadata later (token counts, cost, etc.) without
restructuring:

```tsx
<TurnSeparator durationMs={14942} /* usage={...} later */ />
```

### Anchoring

Each `system` / `subtype: "turn_duration"` entry has `parentUuid` pointing to
the assistant entry that ended the turn. Render the separator immediately
*after* that assistant entry.

### Duration formatting

- `< 1s` → `420ms`
- `< 60s` → `3.4s` (one decimal)
- `≥ 60s` → `1m 23s`

### Missing data — wall-clock fallback

If `turn_duration` is absent for a turn (older transcripts), fall back to a
wall-clock duration computed from entry timestamps:

> last assistant entry of the turn `.timestamp` − triggering user-typed
> message `.timestamp`

Definitions:

- **Triggering user-typed message**: a user-role entry whose content is *not*
  a `tool_result` (i.e. the human typed it), bounded by the previous
  user-typed message.
- **Last assistant entry of the turn**: the final `assistant` entry whose
  position in the file is before the next user-typed message (or end of
  file). Sidechain entries (`isSidechain: true`) are ignored.

The fallback number is rendered identically to the `turn_duration` value
(no tilde, no marker). Both represent "wall-clock from your message to the
end of the response"; the tiny difference (server-reported turn time vs.
file-write timestamps) isn't worth surfacing in the UI.

If the turn has no terminating assistant entry yet (in-progress / streaming
session), render nothing for that turn.

## Types

The current `Entry` is a flat optional bag. `system` entries have a genuinely
different shape (no `message`, instead `subtype` + per-subtype payload), so we
move to a discriminated union.

```ts
// types.ts (sketch)

type MessageEntry = {
  type: "user" | "assistant"
  uuid?: string
  parentUuid?: string | null
  isSidechain?: boolean
  timestamp?: string
  message?: { role?: string; content?: Block[] | string }
}

type SystemEntry =
  | {
      type: "system"
      subtype: "turn_duration"
      durationMs: number
      messageCount?: number
      parentUuid: string
      uuid?: string
      timestamp?: string
    }
  | {
      type: "system"
      subtype: "away_summary"
      content: string
      uuid?: string
      timestamp?: string
      parentUuid?: string
    }
  | {
      // Open fallback: unknown subtypes parse fine and are ignored by the UI.
      type: "system"
      subtype: string
      uuid?: string
      timestamp?: string
    }

type Entry = MessageEntry | SystemEntry
```

We are deliberately *not* depending on `@anthropic-ai/claude-agent-sdk`:

- Inspected v0.2.123: `turn_duration` and `away_summary` aren't in the public
  types yet.
- The SDK models the streaming wire protocol (`session_id` snake_case, no
  `parentUuid`/`timestamp`/`cwd`/`gitBranch`/`isMeta`), which diverges from the
  on-disk JSONL shape we read. Importing those types would not describe our
  inputs.
- We'll periodically diff against newer SDK releases to pick up subtype names
  and shapes as a reference, but keep our own types.

## Parsing

Single pre-pass over entries to build:

```ts
const turnDurationByAssistantUuid = new Map<string, number>()
```

keyed by `system.turn_duration.parentUuid`. Renderer does an O(1) lookup per
assistant entry to decide whether to emit a `<TurnSeparator>` after it.

`system` entries are otherwise dropped from the rendered stream.

## Fixture

Depends on the fixture swap landed in
`2026-04-29-examples-and-fixture-design.md`. The new fixture exercises
`turn_duration`, `away_summary`, and realistic tool use — what's needed to
develop and verify the timestamp surfaces in this spec. That spec ships first;
this one builds on it.

## Out of scope (for follow-ups)

- **Token usage** in the separator — `message.usage` carries
  `input_tokens` / `cache_creation_input_tokens` / `cache_read_input_tokens` /
  `output_tokens`. Same component, new slot.
- **Rendering `away_summary`** — distinct concept (a recap message), worth its
  own brainstorm.
- **Absolute-timestamp tooltip** on individual messages (hover to see exact
  ISO timestamp).
