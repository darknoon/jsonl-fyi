# Samples & Fixture Swap — Design

Status: approved
Date: 2026-04-29

## Goal

1. Replace the synthetic `sample.jsonl` fixture with a real Claude Code session
   so the demo and tests exercise modern transcript shapes (`turn_duration`,
   `away_summary`, realistic tool use, real message volume).
2. Restructure the empty-state landing area so the sample is presented as a
   browsable "Samples" section rather than a single bare button — extensible
   to multiple samples later.

This work ships first. The follow-up "Show Timestamps" spec
(`2026-04-29-show-timestamps-design.md`) builds on the new fixture.

## Fixture

Replace `src/__fixtures__/sample.jsonl` with a copy of:

```
~/.claude/projects/-Users-andrew-Developer-Prefix-jsonl-fyi/0dc40511-6d23-4460-9e5b-ecb10e418fe7.jsonl
```

This session is a real interaction redesigning the app header: it includes
`system`/`turn_duration` rows, `system`/`away_summary` rows, file edits, tool
use, and a realistic message count — the right surface for catching regressions
across the renderer.

Update `parse.test.ts` assertions if they hardcode counts from the old fixture.

## Samples section

### Layout (empty state)

```
┌──────────────────────────────────────────┐
│       [Drop zone]                        │
└──────────────────────────────────────────┘

Claude Code stores sessions at ~/.claude/projects/<project>/<session>.jsonl

Samples
─────────────────────────────────────────────
  app header redesign session
  Real Claude Code session — header refactor
  with tool use, turn durations, and away
  summaries.
─────────────────────────────────────────────
```

Order: drop zone → existing `~/.claude` hint → **Samples** section at the
bottom.

### Samples data model

Designed for multiple samples from day 1, ships with one:

```ts
type Sample = {
  name: string         // short title, e.g. "app header redesign"
  description: string  // one to two sentences
  text: string         // imported via `with { type: "text" }`
  fileName: string     // what we display in the header after loading
}

const SAMPLES: Sample[] = [
  {
    name: "app header redesign",
    description:
      "Real Claude Code session redesigning this app's header — includes tool use, turn durations, and away summaries.",
    text: sampleJsonl,
    fileName: "sample.jsonl",
  },
]
```

### Sample row

Each sample renders as a clickable row:

- Title (bolder weight, larger)
- Description (muted, smaller)
- Whole row is the click target; loads the sample via the existing
  `loadText(sample.text, sample.fileName, false)` path.

The current standalone `.demo-row` / "Load sample" button is removed; its
behavior is now the sample row.

### Empty samples list

If `SAMPLES` is empty (won't happen in v1, but the structure should handle it),
suppress the "Samples" header entirely rather than showing an empty section.

## Out of scope

- Multiple samples (structure ready; content is one for now)
- Per-sample thumbnails / previews
- A persistent samples picker once a transcript is loaded

## Acceptance

- New fixture file is in place; old synthetic content gone.
- `parse.test.ts` passes against the new fixture (numeric expectations updated
  as needed; semantics unchanged).
- Empty state shows the Samples section beneath the drop zone and hint, with
  one row that loads the bundled sample on click.
- `?demo` URL parameter still works (loads the first sample's text).
