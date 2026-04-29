# Show Timestamps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Depends on:** `2026-04-29-examples-and-fixture.md` must land first (this plan tests against the new fixture and assumes the snapshot test reshape from that plan is committed).

**Goal:** Show a relative chat-start timestamp at the top of the transcript and render a small per-turn duration label between turns. Use the harness's `system`/`turn_duration` rows when present; fall back to a wall-clock delta otherwise.

**Architecture:** Pure helpers (`formatChatStart`, `formatDuration`, `buildTurnDurations`) in a new `src/transcript/timing.ts`, fully unit-tested. Two thin presentational components (`TranscriptHeader`, `TurnSeparator`) consume those helpers. `Transcript.tsx` is extended to render the header at the top and to inject a separator after the last block of any assistant entry that ends a turn. `Entry` becomes a discriminated union so `system` rows can be modeled and pre-passed cleanly. `parse.ts` stops filtering `system` rows so `turn_duration` survives to the renderer.

**Tech Stack:** React 19, TypeScript, Bun (`bun:test`), `Intl.DateTimeFormat`, CSS variables. No new dependencies.

---

## File Structure

- **Modify** `src/types.ts` — discriminated `Entry = MessageEntry | SystemEntry`
- **Modify** `src/parse.ts` — remove `"system"` from `SKIP_TYPES`
- **Modify** `src/parse.test.ts` — update inline snapshot (system entries now flow through)
- **Create** `src/transcript/timing.ts` — `formatChatStart`, `formatDuration`, `buildTurnDurations`
- **Create** `src/transcript/timing.test.ts` — unit tests for the three helpers
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

export type AwaySummaryEntry = {
  type: "system"
  subtype: "away_summary"
  content: string
  uuid?: string
  parentUuid?: string
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

export type SystemEntry =
  | TurnDurationEntry
  | AwaySummaryEntry
  | UnknownSystemEntry

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
import {
  formatChatStart,
  formatDuration,
  buildTurnDurations,
} from "./timing"
import type { Entry } from "../types"

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
  expect(
    formatChatStart(ts, { now, locale: "en-US", timeZone: "UTC" }),
  ).toBe("Today, 7:15 PM")
})

test("formatChatStart: yesterday", () => {
  const now = new Date("2026-04-29T12:00:00Z")
  const ts = "2026-04-28T14:15:00Z"
  expect(
    formatChatStart(ts, { now, locale: "en-US", timeZone: "UTC" }),
  ).toBe("Yesterday, 2:15 PM")
})

test("formatChatStart: within last 6 days uses weekday", () => {
  // 2026-04-24 is a Friday
  const now = new Date("2026-04-29T12:00:00Z")
  const ts = "2026-04-24T14:15:00Z"
  expect(
    formatChatStart(ts, { now, locale: "en-US", timeZone: "UTC" }),
  ).toBe("Friday, 2:15 PM")
})

test("formatChatStart: same year, more than 6 days ago, uses month + day", () => {
  const now = new Date("2026-04-29T12:00:00Z")
  const ts = "2026-02-16T14:15:00Z"
  expect(
    formatChatStart(ts, { now, locale: "en-US", timeZone: "UTC" }),
  ).toBe("February 16, 2:15 PM")
})

test("formatChatStart: prior years include the year", () => {
  const now = new Date("2026-04-29T12:00:00Z")
  const ts = "2024-04-16T14:15:00Z"
  expect(
    formatChatStart(ts, { now, locale: "en-US", timeZone: "UTC" }),
  ).toBe("April 16, 2024, 2:15 PM")
})

test("buildTurnDurations: prefers system.turn_duration when present", () => {
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
  const map = buildTurnDurations(entries)
  expect(map.get("a1")).toBe(4321)
  expect(map.size).toBe(1)
})

test("buildTurnDurations: falls back to wall-clock when turn_duration is absent", () => {
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
      timestamp: "2026-04-29T20:00:03Z",
      message: { role: "assistant", content: [{ type: "tool_use", id: "x", name: "Read", input: {} }] },
    },
    {
      type: "user",
      uuid: "u2",
      timestamp: "2026-04-29T20:00:04Z",
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: "x", content: "ok" }] },
    },
    {
      type: "assistant",
      uuid: "a2",
      timestamp: "2026-04-29T20:00:08Z",
      message: { role: "assistant", content: [{ type: "text", text: "done" }] },
    },
  ]
  const map = buildTurnDurations(entries)
  // Last assistant before next user-typed message is a2; user-typed start was u1.
  expect(map.get("a2")).toBe(8000)
  // a1 is not a turn end — it's followed by a tool_result before the next assistant.
  expect(map.get("a1")).toBeUndefined()
})

test("buildTurnDurations: skips turns with no terminating assistant entry", () => {
  const entries: Entry[] = [
    {
      type: "user",
      uuid: "u1",
      timestamp: "2026-04-29T20:00:00Z",
      message: { role: "user", content: "hi" },
    },
    // no assistant entry yet (in-progress turn)
  ]
  expect(buildTurnDurations(entries).size).toBe(0)
})

test("buildTurnDurations: ignores sidechain entries", () => {
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
  ]
  const map = buildTurnDurations(entries)
  expect(map.get("a1")).toBe(5000)
  expect(map.get("side")).toBeUndefined()
})
```

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

export function formatChatStart(
  isoTimestamp: string,
  opts: FormatChatStartOptions = {},
): string {
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

export function buildTurnDurations(entries: Entry[]): Map<string, number> {
  const out = new Map<string, number>()

  // First pass: pick up any explicit turn_duration system entries.
  for (const entry of entries) {
    if (entry.type === "system" && entry.subtype === "turn_duration") {
      const td = entry as TurnDurationEntry
      if (td.parentUuid && typeof td.durationMs === "number") {
        out.set(td.parentUuid, td.durationMs)
      }
    }
  }

  // Second pass: wall-clock fallback for assistant turn-ends not already covered.
  // A turn = (triggering user-typed message) → ... → (last assistant entry before next user-typed message).
  let pendingUserTs: string | null = null
  let lastAssistantInTurn: MessageEntry | null = null

  function flush() {
    if (
      pendingUserTs &&
      lastAssistantInTurn &&
      lastAssistantInTurn.uuid &&
      lastAssistantInTurn.timestamp &&
      !out.has(lastAssistantInTurn.uuid)
    ) {
      const ms = Date.parse(lastAssistantInTurn.timestamp) - Date.parse(pendingUserTs)
      if (Number.isFinite(ms) && ms >= 0) {
        out.set(lastAssistantInTurn.uuid, ms)
      }
    }
    lastAssistantInTurn = null
  }

  for (const entry of entries) {
    if (entry.type !== "user" && entry.type !== "assistant") continue
    if (entry.isSidechain) continue
    const m = entry as MessageEntry
    if (m.type === "user" && isUserTyped(m)) {
      flush()
      pendingUserTs = m.timestamp ?? null
      continue
    }
    if (m.type === "assistant") {
      lastAssistantInTurn = m
    }
  }
  flush()

  return out
}

function isUserTyped(entry: MessageEntry): boolean {
  const c = entry.message?.content
  if (typeof c === "string") return true
  if (!Array.isArray(c)) return false
  return !c.some(b => b && typeof b === "object" && (b as { type?: unknown }).type === "tool_result")
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
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value)
  return { y: get("year"), m: get("month"), d: get("day") }
}

function daysBetween(from: Ymd, to: Ymd): number {
  const a = Date.UTC(from.y, from.m - 1, from.d)
  const b = Date.UTC(to.y, to.m - 1, to.d)
  return Math.round((b - a) / 86_400_000)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/transcript/timing.test.ts`

Expected: 11 pass, 0 fail.

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
  return (
    <div className="transcript-header">
      {formatChatStart(startTimestamp)}
    </div>
  )
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

## Task 6: Wire header + separators into `Transcript.tsx`

**Files:**
- Modify: `src/transcript/claude/Transcript.tsx`
- Modify: `src/transcript/claude/extractResult.ts` (only if `getBlocks` doesn't already return `[]` for system entries)

- [ ] **Step 1: Confirm `getBlocks` is safe for system entries**

Open `src/transcript/claude/extractResult.ts` and check the `getBlocks` implementation. It almost certainly indexes `entry.message?.content` and returns `[]` when missing — which is exactly right for system entries (they have no `message`). If it's already that simple, no change. If it does anything that would crash on `system`, add an early `if (entry.type === "system") return []`.

- [ ] **Step 2: Modify `Transcript.tsx`**

Open `src/transcript/claude/Transcript.tsx`.

Add imports near the top:

```tsx
import { TranscriptHeader } from "../TranscriptHeader"
import { TurnSeparator } from "../TurnSeparator"
import { buildTurnDurations } from "../timing"
```

After the existing Pass 1b loop and before `// Pass 2: render in order`, build the duration map and pick the start timestamp:

```tsx
  // Pass 1c: index turn durations (turn_duration entries + wall-clock fallback)
  // by the uuid of the assistant entry that ends the turn.
  const turnDurations = buildTurnDurations(entries)

  // Header timestamp: first entry that has one.
  const startTimestamp = entries.find(e => e.timestamp)?.timestamp
```

In the Pass 2 loop, skip system entries entirely (they were retained for `buildTurnDurations` but don't render):

Find the start of the Pass 2 loop:

```tsx
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const role = entry.message?.role ?? entry.type
    const blocks = getBlocks(entry)
    for (let j = 0; j < blocks.length; j++) {
```

Insert this guard immediately after `const entry = entries[i]`:

```tsx
    if (entry.type === "system") continue
```

After the inner `for (j ...)` loop closes (i.e., right after we've rendered all blocks for this entry but before the outer loop increments `i`), inject the separator if this assistant entry ended a turn:

Find:

```tsx
      } else if (block.type === "tool_use") {
        const use = narrowToolUse(block)
        const output = results.get(block.id) ?? EMPTY_RESULT
        nodes.push(<Tool key={k} use={use} output={output} />)
      }
    }
  }

  return <div className="transcript">{nodes}</div>
```

Insert the separator right after the inner loop closes:

```tsx
      } else if (block.type === "tool_use") {
        const use = narrowToolUse(block)
        const output = results.get(block.id) ?? EMPTY_RESULT
        nodes.push(<Tool key={k} use={use} output={output} />)
      }
    }
    if (entry.type === "assistant" && entry.uuid) {
      const ms = turnDurations.get(entry.uuid)
      if (ms != null) {
        nodes.push(<TurnSeparator key={`sep-${entry.uuid}`} durationMs={ms} />)
      }
    }
  }

  return (
    <div className="transcript">
      {startTimestamp && <TranscriptHeader startTimestamp={startTimestamp} />}
      {nodes}
    </div>
  )
```

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

- [ ] **Step 1: Kill any prior dev server**

If you launched `bun index.html` earlier in this session, kill its PID. If not, skip.

- [ ] **Step 2: Start the dev server**

Run: `bun index.html` and note the PID and URL.

- [ ] **Step 3: Verify the header**

Open the dev URL with `?demo` (`http://localhost:3000/?demo`) so the bundled example loads.

Confirm at the top of the transcript: a small muted line like `Today, 7:15 PM` (or similar based on the fixture's first timestamp relative to today). The fixture is from 2026-04-29; if the system clock is the same date in your locale, expect `Today, …`. Otherwise expect a weekday or month-day label per the spec rules.

- [ ] **Step 4: Verify per-turn separators**

Scroll through the transcript. Between turns, you should see small muted centered numbers like `14.9s`, `1m 23s`, etc. They appear after the assistant's last message of a turn, before the next user message.

Spot-check at least one separator value against the fixture: `grep -m1 '"subtype":"turn_duration"' src/__fixtures__/sample.jsonl` and confirm one of the displayed values matches `durationMs / 1000` formatted by the rules (`<1s` → ms, `<60s` → `Xs`, ≥60s → `Xm Ys`).

- [ ] **Step 5: Verify wall-clock fallback (optional, skip if all turns have turn_duration)**

If all turns in the fixture have `turn_duration`, skip this. Otherwise: confirm that turns lacking `turn_duration` still show a separator; the value should match the wall-clock delta between the user's message timestamp and the final assistant message of the chain.

- [ ] **Step 6: Run the full check one more time**

```bash
bun test
bun run check
```

Expected: all green.

- [ ] **Step 7: Kill the dev server**

Kill the PID from Step 2.

- [ ] **Step 8: Final commit if any tweaks were needed**

If verification surfaced issues, fix and commit.

---

## Done

When all tasks above land:

- Transcript shows a relative chat-start label at the top.
- Each turn shows a small muted duration label between turns.
- Wall-clock fallback fills in for transcripts that predate `turn_duration`.
- Tests pass; type-check passes.

Future follow-ups (called out in spec, not in this plan):

- Add token usage to `TurnSeparator` via the existing `children` slot.
- Render `away_summary` entries.
- Hover tooltip with the absolute ISO timestamp.
