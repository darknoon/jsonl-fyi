# Show Timestamps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Depends on:** `2026-04-29-examples-and-fixture.md` must land first (this plan tests against the new fixture and assumes the snapshot test reshape from that plan is committed).

**Goal:** Show a relative chat-start timestamp at the top of the transcript and render a small per-turn duration label between turns, sourced from `system`/`turn_duration` rows. (A scan of all 950 local Claude transcripts on 2026-04-29 found `turn_duration` in every one, so no fallback is needed.)

**Architecture:** One pure function `buildTranscriptItems(entries)` decides the render order: it returns a flat list of `RenderItem`s — `{ kind: "header", chatStartIso }`, `{ kind: "entry", entry }`, `{ kind: "separator", afterUuid, durationMs }`. Items carry the actual entry object so the renderer is a flat `items.map(switch on kind)` with no lookups. Tests stay readable via a `summarize()` helper that projects each item to one line and only reads `item.entry.uuid`. Format helpers (`formatChatStart`, `formatDuration`) live alongside as pure functions. `Transcript.tsx` becomes a deterministic mapping from items to JSX, looking entries up by uuid. Two thin presentational components (`TranscriptHeader`, `TurnSeparator`) consume the format helpers. `Entry` becomes a discriminated union so `system` rows can be modeled and pre-passed cleanly. `parse.ts` stops filtering `system` rows so `turn_duration` survives to `buildTranscriptItems`.

**Tech Stack:** React 19, TypeScript, Bun (`bun:test`), `Intl.DateTimeFormat`, CSS variables. No new dependencies.

---

## File Structure

- **Modify** `src/types.ts` — discriminated `Entry = MessageEntry | SystemEntry`
- **Modify** `src/parse.ts` — remove `"system"` from `SKIP_TYPES`
- **Modify** `src/parse.test.ts` — update inline snapshot (system entries now flow through)
- **Create** `src/transcript/timing.ts` — `formatChatStart`, `formatDuration`, `buildTranscriptItems`, `RenderItem`
- **Create** `src/transcript/timing.test.ts` — focused unit tests for format helpers + scenario snapshots for `buildTranscriptItems`
- **Create** `src/transcript/TranscriptHeader.tsx` — chat-start label component
- **Create** `src/transcript/TurnSeparator.tsx` — turn-footer label component (slot-extensible)
- **Modify** `src/transcript/claude/Transcript.tsx` — render header + inject separators
- **Modify** `src/styles.css` — `.transcript-header`, `.turn-separator`

---

## Task 1: Discriminated `Entry` union

**Files:**

- Modify: `src/types.ts`

- [ ] **Step 1: Replace the `Entry` type with a discriminated union**

Open `src/types.ts`. Replace this block:

```ts
export type Entry = {
  uuid?: string
  parentUuid?: string | null
  isSidechain?: boolean
  timestamp?: string
  type: string
  message?: { role?: string; content?: Block[] | string }
}
```

with:

```ts
export type MessageEntry = {
  type: "user" | "assistant"
  uuid?: string
  parentUuid?: string | null
  isSidechain?: boolean
  timestamp?: string
  message?: { role?: string; content?: Block[] | string }
}

export type TurnDurationEntry = {
  type: "system"
  subtype: "turn_duration"
  durationMs: number
  messageCount?: number
  parentUuid: string
  uuid?: string
  timestamp?: string
  isSidechain?: boolean
}

export type UnknownSystemEntry = {
  type: "system"
  subtype: string
  uuid?: string
  parentUuid?: string | null
  timestamp?: string
  isSidechain?: boolean
}

export type SystemEntry = TurnDurationEntry | UnknownSystemEntry

export type Entry = MessageEntry | SystemEntry
```

- [ ] **Step 2: Type-check**

Run: `bun run check`

Expected: there may be type errors in callers that index `entry.type` against string literals not in the union, or that read fields like `entry.message` on the union without narrowing. Most existing call sites use `entry.message?.role`, `entry.message?.content`, or compare `entry.type` to strings — all of these still work because `MessageEntry` defines `message`, and TypeScript will allow comparing `entry.type` against any string. If a real error appears, narrow with `if (entry.type === "user" || entry.type === "assistant")` or check `"message" in entry`.

If the renderer (`Transcript.tsx`) errors because `getBlocks(entry)` doesn't accept system entries, defer fixing that to Task 6 — for now, add a `// @ts-expect-error timing-task — renderer narrowing in Task 6` only if strictly needed. Prefer to make `getBlocks` simply return `[]` for system entries instead (one-line change), which is the cleaner path; do that here if it's needed for the type-check to pass.

- [ ] **Step 3: Run tests**

Run: `bun test`

Expected: all green (this change should be type-only).

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/transcript
git commit -m "types: discriminate Entry into MessageEntry | SystemEntry"
```

(If you also touched `getBlocks`, include that file in the add.)

---

## Task 2: Stop filtering `system` entries in `parseJsonl`

**Files:**

- Modify: `src/parse.ts`
- Modify: `src/parse.test.ts`

- [ ] **Step 1: Remove `"system"` from `SKIP_TYPES`**

Edit `src/parse.ts`. Change:

```ts
const SKIP_TYPES = new Set([
  "file-history-snapshot",
  "queue-operation",
  "permission-mode",
  "last-prompt",
  "attachment",
  "system",
])
```

to:

```ts
const SKIP_TYPES = new Set([
  "file-history-snapshot",
  "queue-operation",
  "permission-mode",
  "last-prompt",
  "attachment",
])
```

- [ ] **Step 2: Update the fixture stats snapshot**

The fixture-stats test from the previous plan asserts type counts. Now that `system` entries flow through, the count and types line will change. Re-record the snapshot:

```bash
bun test src/parse.test.ts -u
```

Open `src/parse.test.ts` and confirm the new snapshot:

- `entries=` is larger than before by roughly the count of system entries in the fixture.
- `types:` now includes `system=N` alongside `assistant=N` and `user=N`.

If anything else changed (e.g. `skipped` is no longer 0), stop and investigate.

- [ ] **Step 3: Verify both tests pass**

Run: `bun test src/parse.test.ts`

Expected: 2 pass, 0 fail.

- [ ] **Step 4: Commit**

```bash
git add src/parse.ts src/parse.test.ts
git commit -m "parse: keep system entries (needed for turn_duration)"
```

---

## Task 3: `timing.ts` helpers (TDD)

**Files:**

- Create: `src/transcript/timing.ts`
- Create: `src/transcript/timing.test.ts`

This task implements three pure functions with thorough tests. The components in later tasks are thin wrappers around these.

### Step 1: Write the failing tests

- [ ] **Create `src/transcript/timing.test.ts`**

```ts
import { test, expect } from "bun:test"
import { formatChatStart, formatDuration, buildTranscriptItems, type RenderItem } from "./timing"
import type { Entry } from "../types"

// Render the item list as a one-line-per-item string so inline snapshots stay
// readable and focused on what `buildTranscriptItems` actually decides
// (ordering, anchoring, filtering) rather than dumping entry payloads.
function summarize(items: RenderItem[]): string {
  return items
    .map((i) => {
      switch (i.kind) {
        case "header":
          return `header  ${i.chatStartIso}`
        case "entry":
          return `entry   ${i.entry.uuid}`
        case "separator":
          return `sep     after=${i.afterUuid} ${i.durationMs}ms`
      }
    })
    .join("\n")
}

// All `formatChatStart` tests force `en-US` and a fixed timezone so output is
// stable across machines. The function itself uses the runtime locale; the
// `locale` and `timeZone` arguments are test seams.

test("formatDuration: <1s shows ms", () => {
  expect(formatDuration(0)).toBe("0ms")
  expect(formatDuration(420)).toBe("420ms")
  expect(formatDuration(999)).toBe("999ms")
})

test("formatDuration: <60s shows seconds with one decimal", () => {
  expect(formatDuration(1000)).toBe("1.0s")
  expect(formatDuration(3400)).toBe("3.4s")
  expect(formatDuration(59_900)).toBe("59.9s")
})

test("formatDuration: ≥60s shows m s", () => {
  expect(formatDuration(60_000)).toBe("1m 0s")
  expect(formatDuration(83_000)).toBe("1m 23s")
  expect(formatDuration(3_600_000)).toBe("60m 0s")
})

test("formatChatStart: today renders 'Today, h:mm AM/PM'", () => {
  const now = new Date("2026-04-29T18:00:00Z")
  const ts = "2026-04-29T19:15:00Z" // same day in UTC; test uses UTC tz
  expect(formatChatStart(ts, { now, locale: "en-US", timeZone: "UTC" })).toBe("Today, 7:15 PM")
})

test("formatChatStart: yesterday", () => {
  const now = new Date("2026-04-29T12:00:00Z")
  const ts = "2026-04-28T14:15:00Z"
  expect(formatChatStart(ts, { now, locale: "en-US", timeZone: "UTC" })).toBe("Yesterday, 2:15 PM")
})

test("formatChatStart: within last 6 days uses weekday", () => {
  // 2026-04-24 is a Friday
  const now = new Date("2026-04-29T12:00:00Z")
  const ts = "2026-04-24T14:15:00Z"
  expect(formatChatStart(ts, { now, locale: "en-US", timeZone: "UTC" })).toBe("Friday, 2:15 PM")
})

test("formatChatStart: same year, more than 6 days ago, uses month + day", () => {
  const now = new Date("2026-04-29T12:00:00Z")
  const ts = "2026-02-16T14:15:00Z"
  expect(formatChatStart(ts, { now, locale: "en-US", timeZone: "UTC" })).toBe(
    "February 16, 2:15 PM",
  )
})

test("formatChatStart: prior years include the year", () => {
  const now = new Date("2026-04-29T12:00:00Z")
  const ts = "2024-04-16T14:15:00Z"
  expect(formatChatStart(ts, { now, locale: "en-US", timeZone: "UTC" })).toBe(
    "April 16, 2024, 2:15 PM",
  )
})

test("buildTranscriptItems: empty input → empty list", () => {
  expect(buildTranscriptItems([])).toEqual([])
})

test("buildTranscriptItems: prefers system.turn_duration when present", () => {
  const entries: Entry[] = [
    {
      type: "user",
      uuid: "u1",
      timestamp: "2026-04-29T20:00:00Z",
      message: { role: "user", content: "hi" },
    },
    {
      type: "assistant",
      uuid: "a1",
      timestamp: "2026-04-29T20:00:05Z",
      message: { role: "assistant", content: [{ type: "text", text: "hello" }] },
    },
    {
      type: "system",
      subtype: "turn_duration",
      parentUuid: "a1",
      durationMs: 4321,
      timestamp: "2026-04-29T20:00:05.500Z",
    },
  ]
  expect(summarize(buildTranscriptItems(entries))).toMatchInlineSnapshot()
})

test("buildTranscriptItems: assistant turn with no turn_duration row has no separator", () => {
  // No system row → no separator (we don't fall back to wall clock).
  const entries: Entry[] = [
    {
      type: "user",
      uuid: "u1",
      timestamp: "2026-04-29T20:00:00Z",
      message: { role: "user", content: "hi" },
    },
    {
      type: "assistant",
      uuid: "a1",
      timestamp: "2026-04-29T20:00:05Z",
      message: { role: "assistant", content: [{ type: "text", text: "hello" }] },
    },
  ]
  expect(summarize(buildTranscriptItems(entries))).toMatchInlineSnapshot()
})

test("buildTranscriptItems: in-progress turn has no separator", () => {
  const entries: Entry[] = [
    {
      type: "user",
      uuid: "u1",
      timestamp: "2026-04-29T20:00:00Z",
      message: { role: "user", content: "hi" },
    },
    // no assistant entry yet
  ]
  expect(summarize(buildTranscriptItems(entries))).toMatchInlineSnapshot()
})

test("buildTranscriptItems: ignores sidechain entries", () => {
  const entries: Entry[] = [
    {
      type: "user",
      uuid: "u1",
      timestamp: "2026-04-29T20:00:00Z",
      message: { role: "user", content: "hi" },
    },
    {
      type: "assistant",
      uuid: "side",
      isSidechain: true,
      timestamp: "2026-04-29T20:00:02Z",
      message: { role: "assistant", content: [{ type: "text", text: "in subagent" }] },
    },
    {
      type: "assistant",
      uuid: "a1",
      timestamp: "2026-04-29T20:00:05Z",
      message: { role: "assistant", content: [{ type: "text", text: "main reply" }] },
    },
    {
      type: "system",
      subtype: "turn_duration",
      parentUuid: "a1",
      durationMs: 5000,
      timestamp: "2026-04-29T20:00:05.500Z",
    },
  ]
  expect(summarize(buildTranscriptItems(entries))).toMatchInlineSnapshot()
})
```

Snapshots are intentionally left empty (`toMatchInlineSnapshot()`) so they're recorded by the implementation step. Expected after `bun test -u`:

```
// prefers system.turn_duration:
header  2026-04-29T20:00:00Z
entry   u1
entry   a1
sep     after=a1 4321ms

// no turn_duration row → no separator:
header  2026-04-29T20:00:00Z
entry   u1
entry   a1

// in-progress:
header  2026-04-29T20:00:00Z
entry   u1

// sidechain ignored:
header  2026-04-29T20:00:00Z
entry   u1
entry   a1
sep     after=a1 5000ms
```

If any snapshot diverges from the expected text above, that's a real bug — fix the implementation, not the expectation.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/transcript/timing.test.ts`

Expected: FAIL with `Cannot find module './timing'`.

### Step 3: Implement the helpers

- [ ] **Create `src/transcript/timing.ts`**

```ts
import type { Entry, MessageEntry, TurnDurationEntry } from "../types"

export type FormatChatStartOptions = {
  now?: Date
  locale?: string | string[]
  timeZone?: string
}

export function formatChatStart(isoTimestamp: string, opts: FormatChatStartOptions = {}): string {
  const date = new Date(isoTimestamp)
  const now = opts.now ?? new Date()
  const locale = opts.locale
  const timeZone = opts.timeZone

  const time = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(date)

  const days = calendarDayDelta(date, now, timeZone)

  if (days === 0) return `Today, ${time}`
  if (days === 1) return `Yesterday, ${time}`
  if (days >= 2 && days <= 6) {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone }).format(date)
    return `${weekday}, ${time}`
  }

  const sameYear = sameCalendarYear(date, now, timeZone)
  const dateLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    timeZone,
  }).format(date)
  return `${dateLabel}, ${time}`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const totalSeconds = Math.floor(ms / 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}m ${s}s`
}

export type RenderItem =
  | { kind: "header"; chatStartIso: string }
  | { kind: "entry"; entry: MessageEntry }
  | { kind: "separator"; afterUuid: string; durationMs: number }

export function buildTranscriptItems(entries: Entry[]): RenderItem[] {
  if (entries.length === 0) return []

  // Pass 1: index turn durations from system rows by the assistant uuid they
  // reference (parentUuid).
  const durations = new Map<string, number>()
  for (const entry of entries) {
    if (entry.type === "system" && entry.subtype === "turn_duration") {
      const td = entry as TurnDurationEntry
      if (td.parentUuid && typeof td.durationMs === "number") {
        durations.set(td.parentUuid, td.durationMs)
      }
    }
  }

  // Pass 2: emit items in source order, with header at the top and a separator
  // after each assistant entry whose uuid has a duration.
  const items: RenderItem[] = []
  const startTimestamp = entries.find((e) => e.timestamp)?.timestamp
  if (startTimestamp) {
    items.push({ kind: "header", chatStartIso: startTimestamp })
  }

  for (const entry of entries) {
    if (entry.type === "system") continue
    if (entry.isSidechain) continue
    if (entry.type !== "user" && entry.type !== "assistant") continue
    const m = entry as MessageEntry
    items.push({ kind: "entry", entry: m })
    if (m.type === "assistant" && m.uuid) {
      const ms = durations.get(m.uuid)
      if (ms != null) {
        items.push({ kind: "separator", afterUuid: m.uuid, durationMs: ms })
      }
    }
  }

  return items
}

function calendarDayDelta(date: Date, now: Date, timeZone?: string): number {
  const a = ymdInZone(now, timeZone)
  const b = ymdInZone(date, timeZone)
  return daysBetween(b, a) // a - b in days; positive if date is in the past
}

function sameCalendarYear(date: Date, now: Date, timeZone?: string): boolean {
  return ymdInZone(date, timeZone).y === ymdInZone(now, timeZone).y
}

type Ymd = { y: number; m: number; d: number }

function ymdInZone(date: Date, timeZone?: string): Ymd {
  // Use Intl to get year/month/day in the target zone reliably.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return { y: get("year"), m: get("month"), d: get("day") }
}

function daysBetween(from: Ymd, to: Ymd): number {
  const a = Date.UTC(from.y, from.m - 1, from.d)
  const b = Date.UTC(to.y, to.m - 1, to.d)
  return Math.round((b - a) / 86_400_000)
}
```

- [ ] **Step 4: Record snapshots and run tests**

Run: `bun test src/transcript/timing.test.ts -u` once to record the inline snapshots, then `bun test src/transcript/timing.test.ts` to verify.

Expected: 13 pass, 0 fail (3 `formatDuration` + 5 `formatChatStart` + 5 `buildTranscriptItems`). Compare each recorded snapshot against the expected text in the test file's comment block — if any diverge, fix the implementation, not the snapshot.

If any `formatChatStart` test fails because of locale-specific output (e.g., a CI runner's `Intl` returns `"7:15 PM"` vs `"7:15 PM"` with a non-breaking space), normalize the output in the function (`.replace(/ /g, " ")`) and re-run. Don't change the test expectations.

- [ ] **Step 5: Type-check**

Run: `bun run check`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/transcript/timing.ts src/transcript/timing.test.ts
git commit -m "feat: timing helpers (formatChatStart, formatDuration, buildTurnDurations)"
```

---

## Task 4: `TurnSeparator` component

No React testing harness in this project; verify visually in Task 8.

**Files:**

- Create: `src/transcript/TurnSeparator.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { ReactNode } from "react"
import { formatDuration } from "./timing"

type Props = {
  durationMs: number
  children?: ReactNode
}

export function TurnSeparator({ durationMs, children }: Props) {
  return (
    <div className="turn-separator" aria-hidden="true">
      <span>{formatDuration(durationMs)}</span>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `bun run check`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/transcript/TurnSeparator.tsx
git commit -m "feat: TurnSeparator component"
```

---

## Task 5: `TranscriptHeader` component

**Files:**

- Create: `src/transcript/TranscriptHeader.tsx`

- [ ] **Step 1: Implement**

```tsx
import { formatChatStart } from "./timing"

type Props = {
  startTimestamp: string
}

export function TranscriptHeader({ startTimestamp }: Props) {
  return <div className="transcript-header">{formatChatStart(startTimestamp)}</div>
}
```

- [ ] **Step 2: Type-check**

Run: `bun run check`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/transcript/TranscriptHeader.tsx
git commit -m "feat: TranscriptHeader component"
```

---

## Task 6: Render `RenderItem`s in `Transcript.tsx`

**Goal:** the Transcript body becomes `items.map(item => <Switch on item.kind>)` with no inline loops or lookups. Per-entry block rendering moves into a small `EntryView` component.

**Files:**

- Modify: `src/transcript/claude/Transcript.tsx`
- Create: `src/transcript/claude/EntryView.tsx`
- Modify: `src/transcript/claude/extractResult.ts` (only if `getBlocks` doesn't already return `[]` for system entries)

- [ ] **Step 1: Confirm `getBlocks` is safe for system entries**

Open `src/transcript/claude/extractResult.ts` and check `getBlocks`. It almost certainly indexes `entry.message?.content` and returns `[]` when missing — which is right for system entries. If it does anything that would crash on `system`, add an early `if (entry.type === "system") return []`.

- [ ] **Step 2: Switch the skill-absorption set to uuid-based keys**

The existing Pass 1b uses entry index `i` to build `skipKeys` like `${i}:${j}`. Once the renderer is driven by `RenderItem`s, source-array indices are no longer the right addressing. Rekey to `${entry.uuid}:${j}`.

In `Transcript.tsx` Pass 1b, change `skipKeys.add(\`${i}:${j}\`)`to`skipKeys.add(\`${entry.uuid}:${j}\`)`. Skip entries with no `uuid` (defensive — they shouldn't reach absorption logic but bail rather than mis-key).

- [ ] **Step 3: Extract `EntryView`**

Create `src/transcript/claude/EntryView.tsx`:

```tsx
import type { ReactNode } from "react"
import type { MessageEntry, ToolResult } from "../../types"
import { getBlocks } from "./extractResult"
import { TextBlock } from "./TextBlock"
import { ThinkingBlock } from "../ThinkingBlock"
import { ImageBlock } from "../ImageBlock"
import { Tool } from "./Tool"
import { narrowToolUse } from "./toolTypes"

const EMPTY_RESULT: ToolResult = { text: "", images: [], toolRefs: [] }

type Props = {
  entry: MessageEntry
  results: Map<string, ToolResult>
  skipKeys: Set<string>
}

export function EntryView({ entry, results, skipKeys }: Props) {
  const role = entry.message?.role ?? entry.type
  const blocks = getBlocks(entry)
  const nodes: ReactNode[] = []
  for (let j = 0; j < blocks.length; j++) {
    const block = blocks[j]
    if (skipKeys.has(`${entry.uuid}:${j}`)) continue
    if (block.type === "text") {
      nodes.push(<TextBlock key={j} text={block.text} role={role} />)
    } else if (block.type === "thinking") {
      nodes.push(<ThinkingBlock key={j} text={block.thinking} />)
    } else if (block.type === "image") {
      nodes.push(<ImageBlock key={j} source={block.source} role={role} />)
    } else if (block.type === "tool_use") {
      const use = narrowToolUse(block)
      const output = results.get(block.id) ?? EMPTY_RESULT
      nodes.push(<Tool key={j} use={use} output={output} />)
    }
  }
  return <>{nodes}</>
}
```

- [ ] **Step 4: Reduce `Transcript.tsx` to a flat map**

Replace the Pass 2 loop (lines ~57–79 in the current file) with:

```tsx
const items = buildTranscriptItems(entries)
return (
  <div className="transcript">
    {items.map((item, idx) => {
      switch (item.kind) {
        case "header":
          return <TranscriptHeader key={`hdr-${idx}`} startTimestamp={item.chatStartIso} />
        case "separator":
          return <TurnSeparator key={`sep-${item.afterUuid}`} durationMs={item.durationMs} />
        case "entry":
          return (
            <EntryView
              key={item.entry.uuid ?? `entry-${idx}`}
              entry={item.entry}
              results={results}
              skipKeys={skipKeys}
            />
          )
      }
    })}
  </div>
)
```

Add imports:

```tsx
import { TranscriptHeader } from "../TranscriptHeader"
import { TurnSeparator } from "../TurnSeparator"
import { buildTranscriptItems } from "../timing"
import { EntryView } from "./EntryView"
```

Remove the now-unused imports (`TextBlock`, `ThinkingBlock`, `ImageBlock`, `Tool`, `narrowToolUse`, `EMPTY_RESULT`) from `Transcript.tsx` — they live in `EntryView` now. Pass 1 (results) and Pass 1b (skill absorption) stay in `Transcript.tsx` unchanged except for the uuid-based `skipKeys`.

- [ ] **Step 3: Type-check**

Run: `bun run check`

Expected: no errors. If TS complains that `entry.message?.role` is unreachable on `SystemEntry`, the early `if (entry.type === "system") continue` should narrow it; verify.

- [ ] **Step 4: Run tests**

Run: `bun test`

Expected: existing tests still pass. (No test asserts UI output of `Transcript`; the new behavior is verified manually in Task 8.)

- [ ] **Step 5: Commit**

```bash
git add src/transcript/claude/Transcript.tsx src/transcript/claude/extractResult.ts
git commit -m "feat: render chat-start header and per-turn separators"
```

(Drop `extractResult.ts` from the add if you didn't touch it.)

---

## Task 7: Styles

**Files:**

- Modify: `src/styles.css`

- [ ] **Step 1: Append the new rules**

```css
.transcript-header {
  text-align: center;
  font-size: var(--fs-sm);
  color: var(--muted);
  padding: 16px 0 12px;
}

.turn-separator {
  display: flex;
  justify-content: center;
  font-size: 11px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  padding: 12px 0;
  letter-spacing: 0.02em;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles.css
git commit -m "style: transcript header and turn separator"
```

---

## Task 8: Manual browser verification

**Files:** none

- [ ] **Step 1: Confirm dev server is running**

The user typically has `bun index.html` already running on `http://localhost:3000/`. Do NOT kill it, and do NOT start a second instance. If nothing is responding on `:3000`, ask the user to start it rather than launching one yourself. Hit the URL with `curl -sI http://localhost:3000/` to confirm.

- [ ] **Step 3: Verify the header**

Open the dev URL with `?demo` (`http://localhost:3000/?demo`) so the bundled example loads.

Confirm at the top of the transcript: a small muted line like `Today, 7:15 PM` (or similar based on the fixture's first timestamp relative to today). The fixture is from 2026-04-29; if the system clock is the same date in your locale, expect `Today, …`. Otherwise expect a weekday or month-day label per the spec rules.

- [ ] **Step 4: Verify per-turn separators**

Scroll through the transcript. Between turns, you should see small muted centered numbers like `14.9s`, `1m 23s`, etc. They appear after the assistant's last message of a turn, before the next user message.

Spot-check at least one separator value against the fixture: `grep -m1 '"subtype":"turn_duration"' src/__fixtures__/sample.jsonl` and confirm one of the displayed values matches `durationMs / 1000` formatted by the rules (`<1s` → ms, `<60s` → `Xs`, ≥60s → `Xm Ys`).

- [ ] **Step 6: Run the full check one more time**

```bash
bun test
bun run check
```

Expected: all green.

- [ ] **Step 7: Final commit if any tweaks were needed**

If verification surfaced issues, fix and commit.

---

## Done

When all tasks above land:

- Transcript shows a relative chat-start label at the top.
- Each turn shows a small muted duration label between turns.
- Tests pass; type-check passes.

Future follow-ups (called out in spec, not in this plan):

- Add token usage to `TurnSeparator` via the existing `children` slot.
- Hover tooltip with the absolute ISO timestamp.
