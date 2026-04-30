# Per-Turn Token Usage Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Append a compact `↑in ↻cache ↓out` token-usage line to the existing turn separator for both Claude and Codex transcripts, and drop the "Done " prefix that already lives in `TurnSeparator`.

**Architecture:** A small `src/transcript/usage.ts` module owns (a) the `TurnUsage` shape, (b) per-format extraction (`extractClaudeTurnUsage`, `extractCodexTurnUsage`), and (c) a `formatTokens` SI-abbreviation helper. `buildTranscriptItems` (Claude) and `CodexTranscript`'s separator-mapping pass attach a `TurnUsage | null` to each separator item. `TurnSeparator` accepts an optional `usage` prop and renders arrows after the duration.

**Tech Stack:** React 19, TypeScript, Vite, Bun test runner (`bun:test`), oxlint, tsgo. Existing patterns: pure helpers under `src/transcript/`, colocated `*.test.ts` using inline snapshots, transcripts assembled in `*Transcript.tsx`.

**Spec:** `docs/superpowers/specs/2026-04-29-token-usage-display-design.md`

---

## File Structure

**New:**
- `src/transcript/usage.ts` — `TurnUsage` type, `formatTokens`, `extractClaudeTurnUsage`, `extractCodexTurnUsage`
- `src/transcript/usage.test.ts` — unit tests for the above

**Modified:**
- `src/types.ts` — add optional `usage` field to Claude `MessageEntry.message`
- `src/transcript/timing.ts` — attach `usage?: TurnUsage` to `separator` items in `RenderItem`
- `src/transcript/timing.test.ts` — assert usage attached on separator items
- `src/transcript/TurnSeparator.tsx` — drop "Done " prefix, accept optional `usage` prop, render arrows
- `src/transcript/claude/ClaudeCodeTranscript.tsx` — pass `usage` to `<TurnSeparator>`
- `src/transcript/codex/types.ts` — add `CodexEventMsg` (typed for `token_count` payloads) to `CodexEntry` union
- `src/transcript/codex/parse.ts` — keep `event_msg` rows whose payload type is `token_count`
- `src/transcript/codex/parse.test.ts` (if it exists; otherwise add a test in usage.test.ts) — covers the new keep behavior
- `src/transcript/codex/CodexTranscript.tsx` — build a per-turn `Map<index, TurnUsage>` from `token_count` events, pass to `<TurnSeparator>`
- `src/styles.css` — small `.turn-separator-usage` span styling (gap, dim, no border)

---

## Task 1: `formatTokens` helper

**Files:**
- Create: `src/transcript/usage.ts`
- Create: `src/transcript/usage.test.ts`

- [ ] **Step 1: Write the failing test**

`src/transcript/usage.test.ts`:

```ts
import { test, expect } from "bun:test"
import { formatTokens } from "./usage"

test("formatTokens: under 1k shows the literal integer", () => {
  expect(formatTokens(0)).toBe("0")
  expect(formatTokens(6)).toBe("6")
  expect(formatTokens(165)).toBe("165")
  expect(formatTokens(999)).toBe("999")
})

test("formatTokens: 1k–999k uses k with one decimal, trailing .0 kept", () => {
  expect(formatTokens(1000)).toBe("1.0k")
  expect(formatTokens(1500)).toBe("1.5k")
  expect(formatTokens(29_000)).toBe("29.0k")
  expect(formatTokens(29_050)).toBe("29.1k") // round, not floor
  expect(formatTokens(999_499)).toBe("999.5k")
})

test("formatTokens: ≥1M uses M with one decimal", () => {
  expect(formatTokens(1_000_000)).toBe("1.0M")
  expect(formatTokens(1_200_000)).toBe("1.2M")
  expect(formatTokens(58_300_000)).toBe("58.3M")
})

test("formatTokens: handles 999_500 boundary correctly (rounds up to 1.0M)", () => {
  // 999_500 / 1000 = 999.5 → "999.5k" — stays in k bucket because < 1_000_000
  expect(formatTokens(999_500)).toBe("999.5k")
  expect(formatTokens(999_999)).toBe("1000.0k")
  expect(formatTokens(1_000_000)).toBe("1.0M")
})

test("formatTokens: negative or NaN falls back to '0'", () => {
  expect(formatTokens(-1)).toBe("0")
  expect(formatTokens(Number.NaN)).toBe("0")
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/transcript/usage.test.ts`
Expected: FAIL — `Cannot find module './usage'` (or "formatTokens is not a function").

- [ ] **Step 3: Write minimal implementation**

`src/transcript/usage.ts`:

```ts
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0"
  if (n < 1000) return String(Math.round(n))
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/transcript/usage.test.ts`
Expected: PASS — 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/transcript/usage.ts src/transcript/usage.test.ts
git commit -m "feat(usage): formatTokens SI helper"
```

---

## Task 2: `TurnUsage` type and `extractClaudeTurnUsage`

**Files:**
- Modify: `src/types.ts` (add `usage` to `MessageEntry.message`)
- Modify: `src/transcript/usage.ts` (add type + extractor)
- Modify: `src/transcript/usage.test.ts` (extractor tests)

- [ ] **Step 1: Write the failing test**

Append to `src/transcript/usage.test.ts`:

```ts
import { extractClaudeTurnUsage } from "./usage"
import type { MessageEntry } from "../types"

function claudeAssistant(usage: Record<string, number> | undefined): MessageEntry {
  return {
    type: "assistant",
    uuid: "u",
    message: {
      role: "assistant",
      content: [],
      ...(usage ? { usage } : {}),
    } as MessageEntry["message"],
  }
}

test("extractClaudeTurnUsage: pulls input/output/cache_read", () => {
  const entry = claudeAssistant({
    input_tokens: 6,
    cache_creation_input_tokens: 28960,
    cache_read_input_tokens: 0,
    output_tokens: 165,
  })
  expect(extractClaudeTurnUsage(entry)).toEqual({
    input: 6,
    output: 165,
    cacheRead: 0,
  })
})

test("extractClaudeTurnUsage: handles missing cache fields", () => {
  const entry = claudeAssistant({ input_tokens: 10, output_tokens: 20 })
  expect(extractClaudeTurnUsage(entry)).toEqual({
    input: 10,
    output: 20,
    cacheRead: 0,
  })
})

test("extractClaudeTurnUsage: returns null when usage missing", () => {
  expect(extractClaudeTurnUsage(claudeAssistant(undefined))).toBeNull()
})

test("extractClaudeTurnUsage: returns null for user entries", () => {
  const entry: MessageEntry = {
    type: "user",
    uuid: "u",
    message: { role: "user", content: "hi" },
  }
  expect(extractClaudeTurnUsage(entry)).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/transcript/usage.test.ts`
Expected: FAIL — `extractClaudeTurnUsage is not exported from './usage'`.

- [ ] **Step 3: Extend the Claude `MessageEntry` type**

Edit `src/types.ts`. Replace the `MessageEntry` declaration with:

```ts
export type ClaudeUsage = {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

export type MessageEntry = {
  type: "user" | "assistant"
  uuid?: string
  parentUuid?: string | null
  isSidechain?: boolean
  timestamp?: string
  message?: {
    role?: string
    content?: Block[] | string
    usage?: ClaudeUsage
  }
}
```

- [ ] **Step 4: Implement `TurnUsage` and `extractClaudeTurnUsage`**

Append to `src/transcript/usage.ts`:

```ts
import type { MessageEntry } from "../types"

export type TurnUsage = {
  input: number
  output: number
  cacheRead: number
}

export function extractClaudeTurnUsage(entry: MessageEntry): TurnUsage | null {
  if (entry.type !== "assistant") return null
  const u = entry.message?.usage
  if (!u) return null
  return {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/transcript/usage.test.ts`
Expected: PASS — 9 passing.

Run: `bun run check`
Expected: PASS (no type or lint errors).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/transcript/usage.ts src/transcript/usage.test.ts
git commit -m "feat(usage): TurnUsage type + extractClaudeTurnUsage"
```

---

## Task 3: Attach usage to Claude separator items in `buildTranscriptItems`

**Files:**
- Modify: `src/transcript/timing.ts`
- Modify: `src/transcript/timing.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/transcript/timing.test.ts`:

```ts
test("buildTranscriptItems: attaches usage from the duration-anchor assistant row", () => {
  const entries: Entry[] = [
    {
      type: "assistant",
      uuid: "a1",
      timestamp: "2026-04-29T20:00:00.000Z",
      message: {
        role: "assistant",
        content: [],
        usage: {
          input_tokens: 6,
          cache_read_input_tokens: 28960,
          output_tokens: 165,
        },
      },
    },
    {
      type: "system",
      subtype: "turn_duration",
      durationMs: 1234,
      parentUuid: "a1",
    } as Entry,
  ]
  const items = buildTranscriptItems(entries)
  const sep = items.find(i => i.kind === "separator")
  expect(sep).toBeDefined()
  if (sep?.kind !== "separator") throw new Error("expected separator")
  expect(sep.durationMs).toBe(1234)
  expect(sep.usage).toEqual({ input: 6, output: 165, cacheRead: 28960 })
})

test("buildTranscriptItems: separator usage is null when assistant entry has no usage", () => {
  const entries: Entry[] = [
    { type: "assistant", uuid: "a1", message: { role: "assistant", content: [] } },
    {
      type: "system",
      subtype: "turn_duration",
      durationMs: 500,
      parentUuid: "a1",
    } as Entry,
  ]
  const items = buildTranscriptItems(entries)
  const sep = items.find(i => i.kind === "separator")
  if (sep?.kind !== "separator") throw new Error("expected separator")
  expect(sep.usage).toBeNull()
})
```

Update `summarize` to include usage so existing inline snapshots don't get noisy: leave `summarize` alone — these new tests assert structurally rather than via snapshot.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/transcript/timing.test.ts`
Expected: FAIL — `Property 'usage' does not exist on type` (or runtime: `sep.usage` undefined → `toEqual` mismatch).

- [ ] **Step 3: Update `RenderItem` and `buildTranscriptItems`**

Edit `src/transcript/timing.ts`:

```ts
import type { Entry, MessageEntry, TurnDurationEntry } from "../types"
import { extractClaudeTurnUsage, type TurnUsage } from "./usage"
```

Replace the `RenderItem` separator variant:

```ts
export type RenderItem =
  | { kind: "header"; chatStartIso: string }
  | { kind: "entry"; entry: MessageEntry }
  | {
      kind: "separator"
      afterUuid: string
      durationMs: number
      usage: TurnUsage | null
    }
```

In the second pass of `buildTranscriptItems`, change the separator push from:

```ts
items.push({ kind: "separator", afterUuid: entry.uuid, durationMs: ms })
```

to:

```ts
items.push({
  kind: "separator",
  afterUuid: entry.uuid,
  durationMs: ms,
  usage: extractClaudeTurnUsage(entry),
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/transcript/timing.test.ts`
Expected: PASS — all timing tests pass, including the two new ones.

Run: `bun run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/transcript/timing.ts src/transcript/timing.test.ts
git commit -m "feat(timing): attach TurnUsage to Claude separator items"
```

---

## Task 4: Render usage in `TurnSeparator` and drop the "Done " prefix

**Files:**
- Modify: `src/transcript/TurnSeparator.tsx`
- Modify: `src/transcript/claude/ClaudeCodeTranscript.tsx`
- Modify: `src/styles.css`

There is no existing test file for `TurnSeparator`; we'll add a small render test in this task.

- [ ] **Step 1: Write the failing test**

Create `src/transcript/TurnSeparator.test.tsx`:

```tsx
import { test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { TurnSeparator } from "./TurnSeparator"

test("TurnSeparator: duration only — no 'Done' prefix, no usage span", () => {
  const html = renderToStaticMarkup(<TurnSeparator durationMs={1234} usage={null} />)
  expect(html).toContain("✓")
  expect(html).toContain("1.2s")
  expect(html).not.toContain("Done")
  expect(html).not.toContain("↑")
})

test("TurnSeparator: with usage renders ↑input ↻cacheRead ↓output in order", () => {
  const html = renderToStaticMarkup(
    <TurnSeparator
      durationMs={1234}
      usage={{ input: 6, output: 165, cacheRead: 29000 }}
    />,
  )
  expect(html).toContain("↑6")
  expect(html).toContain("↻29.0k")
  expect(html).toContain("↓165")
  // Order check — input before cacheRead before output
  const i = html.indexOf("↑6")
  const c = html.indexOf("↻29.0k")
  const o = html.indexOf("↓165")
  expect(i).toBeLessThan(c)
  expect(c).toBeLessThan(o)
})

test("TurnSeparator: with usage where cacheRead is 0 still renders the ↻ slot", () => {
  // Spec: arrows are always shown together when usage is present; we don't
  // suppress individual zeros (keeps alignment readable across turns).
  const html = renderToStaticMarkup(
    <TurnSeparator durationMs={500} usage={{ input: 10, output: 20, cacheRead: 0 }} />,
  )
  expect(html).toContain("↻0")
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/transcript/TurnSeparator.test.tsx`
Expected: FAIL — current component renders `"Done 1.2s"` and ignores `usage`.

- [ ] **Step 3: Rewrite `TurnSeparator`**

Replace `src/transcript/TurnSeparator.tsx` with:

```tsx
import { formatDuration } from "./timing"
import { formatTokens, type TurnUsage } from "./usage"

type Props = {
  durationMs: number
  usage?: TurnUsage | null
}

export function TurnSeparator({ durationMs, usage }: Props) {
  return (
    <div className="turn-separator" aria-hidden="true">
      <span className="turn-separator-marker">✓</span>
      <span className="turn-separator-label">{formatDuration(durationMs)}</span>
      {usage && (
        <span className="turn-separator-usage">
          <span>↑{formatTokens(usage.input)}</span>
          <span>↻{formatTokens(usage.cacheRead)}</span>
          <span>↓{formatTokens(usage.output)}</span>
        </span>
      )}
    </div>
  )
}
```

(The previous `children` prop was unused at every call site; drop it.)

- [ ] **Step 4: Wire usage through Claude transcript**

Edit `src/transcript/claude/ClaudeCodeTranscript.tsx`. Change the separator case to pass `usage`:

```tsx
case "separator":
  return (
    <TurnSeparator
      key={`sep-${item.afterUuid}`}
      durationMs={item.durationMs}
      usage={item.usage}
    />
  )
```

- [ ] **Step 5: Add CSS for the usage span**

Edit `src/styles.css`. Find the existing `.turn-separator-label { ... }` block and append a sibling rule below it:

```css
.turn-separator-usage {
  display: inline-flex;
  gap: 0.5em;
  margin-left: 0.5em;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-dim, inherit);
}
```

(If a `--color-text-dim` token doesn't exist in this codebase, omit the `color:` line — the inherited dim tone from `.turn-separator` already applies.)

- [ ] **Step 6: Run all tests**

Run: `bun test`
Expected: PASS — TurnSeparator tests + existing tests all green.

Run: `bun run check`
Expected: PASS.

- [ ] **Step 7: Visual smoke check**

Start dev server (kill any prior PID first per CLAUDE.md global rule) and load a Claude transcript fixture in the browser. Confirm:
- Each turn separator shows `✓ <duration> ↑… ↻… ↓…`
- No "Done" word anywhere
- Spacing is single-space-ish, no extra padding

Kill the dev server when done.

- [ ] **Step 8: Commit**

```bash
git add src/transcript/TurnSeparator.tsx \
        src/transcript/TurnSeparator.test.tsx \
        src/transcript/claude/ClaudeCodeTranscript.tsx \
        src/styles.css
git commit -m "feat(turn-separator): render token usage; drop 'Done' prefix"
```

---

## Task 5: Codex — keep `token_count` events through the parser

**Files:**
- Modify: `src/transcript/codex/types.ts`
- Modify: `src/transcript/codex/parse.ts`
- Modify: `src/transcript/codex/parse.test.ts`

- [ ] **Step 1: Write the failing test**

Open `src/transcript/codex/parse.test.ts`. If a test file does not exist yet, create one with:

```ts
import { test, expect } from "bun:test"
import { parseCodexEntries } from "./parse"
```

Append:

```ts
test("parseCodexEntries: keeps event_msg rows of subtype token_count", () => {
  const lines = [
    {
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          last_token_usage: {
            input_tokens: 18872,
            cached_input_tokens: 6528,
            output_tokens: 158,
            reasoning_output_tokens: 0,
            total_tokens: 19030,
          },
          total_token_usage: {
            input_tokens: 18872,
            cached_input_tokens: 6528,
            output_tokens: 158,
            reasoning_output_tokens: 0,
            total_tokens: 19030,
          },
          model_context_window: 258400,
        },
      },
    },
  ]
  const out = parseCodexEntries(lines)
  expect(out).toHaveLength(1)
  expect(out[0].type).toBe("event_msg")
})

test("parseCodexEntries: drops other event_msg rows", () => {
  const lines = [
    { type: "event_msg", payload: { type: "task_started" } },
    { type: "event_msg", payload: { type: "token_count", info: null } },
  ]
  const out = parseCodexEntries(lines)
  expect(out).toHaveLength(1)
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `bun test src/transcript/codex/parse.test.ts`
Expected: FAIL — both new tests fail because parser drops all `event_msg`.

- [ ] **Step 3: Extend Codex types**

Edit `src/transcript/codex/types.ts`. Replace the `CodexEventMsg` declaration and `CodexEntry` union with:

```ts
export type CodexTokenUsage = {
  input_tokens?: number
  cached_input_tokens?: number
  output_tokens?: number
  reasoning_output_tokens?: number
  total_tokens?: number
}

export type CodexTokenCountInfo = {
  last_token_usage?: CodexTokenUsage
  total_token_usage?: CodexTokenUsage
  model_context_window?: number
} | null

export type CodexEventMsgTokenCount = {
  type: "event_msg"
  timestamp?: string
  payload: { type: "token_count"; info: CodexTokenCountInfo }
}

export type CodexEntry =
  | CodexSessionMeta
  | CodexTurnContext
  | CodexResponseItem
  | CodexCompacted
  | CodexEventMsgTokenCount
```

Delete the now-unused `CodexEventMsg` declaration.

- [ ] **Step 4: Update the parser**

Edit `src/transcript/codex/parse.ts`. Replace contents with:

```ts
import type { CodexEntry } from "./types"

const KEEP_TYPES = new Set([
  "session_meta",
  "turn_context",
  "response_item",
  "compacted",
  "event_msg",
])

export function parseCodexEntries(lines: Iterable<unknown>): CodexEntry[] {
  const out: CodexEntry[] = []
  for (const line of lines) {
    if (!line || typeof line !== "object") continue
    const t = (line as { type?: unknown }).type
    if (typeof t !== "string" || !KEEP_TYPES.has(t)) continue

    if (t === "response_item") {
      const payload = (line as { payload?: unknown }).payload
      if (!payload || typeof payload !== "object") continue
      const subtype = (payload as { type?: unknown }).type
      if (typeof subtype !== "string") continue
    }

    if (t === "event_msg") {
      const payload = (line as { payload?: unknown }).payload
      if (!payload || typeof payload !== "object") continue
      const subtype = (payload as { type?: unknown }).type
      if (subtype !== "token_count") continue
    }

    out.push(line as CodexEntry)
  }
  return out
}
```

- [ ] **Step 5: Run tests**

Run: `bun test src/transcript/codex/`
Expected: PASS — new parser tests pass, existing Codex tests still pass.

Run: `bun run check`
Expected: PASS — no broken type narrowings on `CodexEntry` consumers (the Codex transcript currently switches on entry.type; the new variant is benign because we'll handle it in the next task).

If `tsgo` flags any exhaustive-switch in `EntryView` or `CodexTranscript` that breaks because of the new variant, add an `else if (entry.type === "event_msg") return null` branch in those switches as the minimal fix.

- [ ] **Step 6: Commit**

```bash
git add src/transcript/codex/types.ts \
        src/transcript/codex/parse.ts \
        src/transcript/codex/parse.test.ts
git commit -m "feat(codex): retain token_count event_msg rows through parser"
```

---

## Task 6: Codex — `extractCodexTurnUsage` and wire into the transcript

**Files:**
- Modify: `src/transcript/usage.ts`
- Modify: `src/transcript/usage.test.ts`
- Modify: `src/transcript/codex/CodexTranscript.tsx`

- [ ] **Step 1: Write the failing test for the extractor**

Append to `src/transcript/usage.test.ts`:

```ts
import { extractCodexTurnUsage } from "./usage"
import type { CodexEventMsgTokenCount } from "./codex/types"

function tokenCountEvent(last: Record<string, number>): CodexEventMsgTokenCount {
  return {
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        last_token_usage: last,
        total_token_usage: last,
      },
    },
  }
}

test("extractCodexTurnUsage: maps last_token_usage", () => {
  const ev = tokenCountEvent({
    input_tokens: 18872,
    cached_input_tokens: 6528,
    output_tokens: 158,
  })
  expect(extractCodexTurnUsage(ev)).toEqual({
    input: 18872 - 6528, // fresh-only input — matches Claude semantics
    output: 158,
    cacheRead: 6528,
  })
})

test("extractCodexTurnUsage: tolerates missing fields", () => {
  const ev: CodexEventMsgTokenCount = {
    type: "event_msg",
    payload: { type: "token_count", info: null },
  }
  expect(extractCodexTurnUsage(ev)).toBeNull()
})

test("extractCodexTurnUsage: zero cache means input passes through unchanged", () => {
  const ev = tokenCountEvent({
    input_tokens: 100,
    cached_input_tokens: 0,
    output_tokens: 50,
  })
  expect(extractCodexTurnUsage(ev)).toEqual({
    input: 100,
    output: 50,
    cacheRead: 0,
  })
})

test("extractCodexTurnUsage: never returns negative input if cached > input (defensive)", () => {
  const ev = tokenCountEvent({
    input_tokens: 5,
    cached_input_tokens: 10,
    output_tokens: 1,
  })
  const u = extractCodexTurnUsage(ev)
  expect(u?.input).toBe(0)
})
```

> **Why subtract `cached_input_tokens` from `input_tokens`?** Codex's
> `input_tokens` is the *total* input including the cached portion; the Claude
> shape splits them (`input_tokens` is fresh-only, `cache_read_input_tokens`
> is separate). We normalize Codex to the same fresh-vs-cached split so both
> formats render identical arrows.

- [ ] **Step 2: Run tests to verify failure**

Run: `bun test src/transcript/usage.test.ts`
Expected: FAIL — `extractCodexTurnUsage` not exported.

- [ ] **Step 3: Implement the extractor**

Append to `src/transcript/usage.ts`:

```ts
import type { CodexEventMsgTokenCount } from "./codex/types"

export function extractCodexTurnUsage(
  ev: CodexEventMsgTokenCount,
): TurnUsage | null {
  const last = ev.payload.info?.last_token_usage
  if (!last) return null
  const totalIn = last.input_tokens ?? 0
  const cached = last.cached_input_tokens ?? 0
  const fresh = Math.max(0, totalIn - cached)
  return {
    input: fresh,
    output: last.output_tokens ?? 0,
    cacheRead: cached,
  }
}
```

- [ ] **Step 4: Wire usage into `CodexTranscript`**

Edit `src/transcript/codex/CodexTranscript.tsx`. Add an import:

```tsx
import { extractCodexTurnUsage } from "../usage"
import type { TurnUsage } from "../usage"
```

Add a helper next to `buildCodexTurnDurations`:

```tsx
// Map per-turn usage to the index of the entry where the separator renders.
// Strategy: for each separator end-index, the next `event_msg` of subtype
// `token_count` at or after that index carries this turn's `last_token_usage`.
// If no such event exists (truncated file), the entry stays usage-less.
function buildCodexTurnUsage(
  entries: CodexEntry[],
  separatorIndices: Iterable<number>,
): Map<number, TurnUsage> {
  const out = new Map<number, TurnUsage>()
  for (const sepIdx of separatorIndices) {
    for (let i = sepIdx; i < entries.length; i++) {
      const e = entries[i]
      if (e.type !== "event_msg") continue
      const usage = extractCodexTurnUsage(e)
      if (usage) {
        out.set(sepIdx, usage)
        break
      }
    }
  }
  return out
}
```

Then in the body of `CodexTranscript`, after `const durations = buildCodexTurnDurations(entries)`:

```tsx
const usages = buildCodexTurnUsage(entries, durations.keys())
```

And in the JSX, change the separator render to:

```tsx
{ms != null && (
  <TurnSeparator durationMs={ms} usage={usages.get(i) ?? null} />
)}
```

Also: the new `event_msg` variant flows through the `entries.map` switch. Add a no-op branch so it renders nothing:

```tsx
if (entry.type === "session_meta") node = null
else if (entry.type === "turn_context") node = null
else if (entry.type === "event_msg") node = null
else if (entry.type === "compacted") node = <CompactedMarker key={`comp-${i}`} />
else node = <EntryView key={i} entry={entry} results={results} />
```

- [ ] **Step 5: Run tests**

Run: `bun test`
Expected: PASS — all suites green.

Run: `bun run check`
Expected: PASS.

- [ ] **Step 6: Visual smoke check**

Start dev server, drop in `src/__fixtures__/codex-sample.jsonl`, confirm token arrows render on each turn separator. Kill dev server.

- [ ] **Step 7: Commit**

```bash
git add src/transcript/usage.ts \
        src/transcript/usage.test.ts \
        src/transcript/codex/CodexTranscript.tsx
git commit -m "feat(codex): per-turn token usage on TurnSeparator"
```

---

## Task 7: TODO sweep

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Mark the line done**

Edit `TODO.md`. Change:

```
- [ ] Show tokens used?
```

to:

```
- [x] Show tokens used? (per-turn only; session totals deferred)
```

- [ ] **Step 2: Commit**

```bash
git add TODO.md
git commit -m "chore: tick 'show tokens used' in TODO"
```

---

## Self-Review

**Spec coverage:**
- Per-turn line `✓ 1.2s ↑in ↻cache ↓out` → Tasks 4 (Claude) + 6 (Codex)
- `formatTokens` SI helper → Task 1
- `TurnUsage` type + extractors → Tasks 2 (Claude) + 6 (Codex)
- `buildTranscriptItems` attaches usage → Task 3
- Drop "Done " prefix → Task 4
- Codex per-turn aggregation via `last_token_usage` → Tasks 5 + 6
- Claude per-turn aggregation uses anchor row's `message.usage` → Task 3
- Cache-write omitted from inline → covered: `TurnUsage` does not carry `cacheWrite`
- Out-of-scope items (footer, cost, context window, tooltips, cache-write totals) → no tasks, as intended

**Placeholder scan:** None. Every code step has full code; every command lists expected output.

**Type consistency:** `TurnUsage = { input, output, cacheRead }` is used identically in Tasks 2, 3, 4, 6. `RenderItem.separator.usage: TurnUsage | null` matches `TurnSeparator`'s `usage?: TurnUsage | null` prop. Codex parser keeps `event_msg` (Task 5), and that matches the new variant `CodexEventMsgTokenCount` consumed in Task 6.

**Risk note:** Task 5's parser change introduces a new `CodexEntry` variant. Any place that does an exhaustive switch on `entry.type` will need the no-op branch shown in Task 6 step 4. If `bun run check` flags additional sites in Task 5 step 5, the fix is the same minimal `else if (entry.type === "event_msg") ... null` pattern.
