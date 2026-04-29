# Examples & Fixture Swap — Design

Status: approved
Date: 2026-04-29

## Goal

1. Replace the synthetic `sample.jsonl` fixture with a real Claude Code session
   so the demo and tests exercise modern transcript shapes (`turn_duration`,
   `away_summary`, realistic tool use, real message volume).
2. Restructure the empty-state landing area so the bundled sample is presented
   in a browsable "Examples" section rather than a single bare button —
   extensible to multiple examples later.

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

## Examples section

### Layout (empty state)

```
┌──────────────────────────────────────────┐
│       [Drop zone]                        │
└──────────────────────────────────────────┘

Claude Code stores sessions at ~/.claude/projects/<project>/<session>.jsonl

Examples
─────────────────────────────────────────────
 app header redesign         (12 turns, 427 KB)
─────────────────────────────────────────────
```

Order: drop zone → existing `~/.claude` hint → **Examples** section at the
bottom.

### Data model

Designed for multiple examples from day 1, ships with one:

```ts
type Example = {
  name: string      // short title, e.g. "app header redesign"
  fileName: string  // what we display in the header after loading
  content: string   // imported via `with { type: "text" }`
}

const EXAMPLES: Example[] = [
  {
    name: "app header redesign",
    fileName: "sample.jsonl",
    content: sampleJsonl,
  },
]
```

### Computed metadata (turns, size)

The "(N turns, XXX KB)" line is derived at runtime from `content`, not stored
on the `Example` record:

- **Turns**: count of `system` entries with `subtype: "turn_duration"`. If
  none exist (older transcripts), fall back to the count of user-typed
  messages (user-role entries whose content is *not* a `tool_result`).
- **Size**: `content.length` formatted as a human-readable byte string
  (`KB`/`MB`, one decimal).

These derivations live in a small helper (`exampleStats(content) → { turns,
sizeBytes }`) and stay in sync automatically when fixtures are regenerated.

### Example row

Each example renders as a single clickable row:

- Title (bolder weight)
- Right-aligned metadata: `(N turns, XXX KB)` in muted color
- Whole row is the click target; loads the example via
  `loadText(example.content, example.fileName, false)`.

The current standalone `.demo-row` / "Load sample" button is removed; its
behavior is now the example row.

### Empty examples list

If `EXAMPLES` is empty (won't happen in v1, but the structure should handle
it), suppress the "Examples" header entirely rather than showing an empty
section.

## Out of scope

- Multiple examples (structure ready; content is one for now)
- Per-example thumbnails / previews
- A persistent examples picker once a transcript is loaded

## Acceptance

- New fixture file is in place; old synthetic content gone.
- `parse.test.ts` passes against the new fixture (numeric expectations updated
  as needed; semantics unchanged).
- Empty state shows the Examples section beneath the drop zone and hint, with
  one row that loads the bundled example on click.
- Row metadata shows real turn count and human-readable size, computed from
  the content at runtime.
- `?demo` URL parameter still works (loads the first example's content).
