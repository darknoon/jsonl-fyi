# Per-Turn Model Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface which model produced each turn — once in the header for single-model sessions, and on every separator when the session uses multiple models or Codex effort variants.

**Architecture:** A new `src/transcript/model.ts` module owns name normalization and synthetic-model detection. The Claude pipeline (`buildTranscriptItems` in `timing.ts`) collects discovery-order distinct models and decorates separator items with a per-turn `ModelDisplay` when there are ≥ 2. The Codex pipeline (`CodexTranscript.tsx`) does the analogous walk over `turn_context` events. `TranscriptHeader` renders a comma-joined list; `TurnSeparator` renders an optional model badge.

**Tech Stack:** TypeScript, React, Vite, Bun (test runner via `bun:test`), JSDOM-free server rendering for component tests (`react-dom/server`).

**Spec:** `docs/superpowers/specs/2026-04-30-per-turn-model-display-design.md` (read first)

---

## File Structure

**Create:**
- `src/transcript/model.ts` — `ModelDisplay`, `formatClaudeModel`, `formatCodexModel`, `isSyntheticClaudeModel`
- `src/transcript/model.test.ts` — unit tests for the module
- `src/transcript/TranscriptHeader.test.tsx` — snapshot/render tests for the header

**Modify:**
- `src/types.ts` — add `model?: string` to `MessageEntry["message"]` so the Claude assistant row's model is typed.
- `src/transcript/TranscriptHeader.tsx` — accept `models?: ModelDisplay[]`.
- `src/transcript/TurnSeparator.tsx` — accept `model?: ModelDisplay | null`.
- `src/transcript/timing.ts` — extend `RenderItem` separator to include `model?: ModelDisplay | null`; change `buildTranscriptItems` return type to `{ items, models }`; do the discovery + per-turn labeling.
- `src/transcript/timing.test.ts` — update existing call sites (`buildTranscriptItems(entries)` → destructure) and add new tests for multi-model labeling.
- `src/transcript/TurnSeparator.test.tsx` — add tests for the model prop.
- `src/transcript/claude/ClaudeCodeTranscript.tsx` — thread `models` to `TranscriptHeader`; pass `model` to `TurnSeparator`.
- `src/transcript/codex/CodexTranscript.tsx` — track current `turn_context`, build models list and per-turn map; thread to header and separators.
- `src/styles.css` — small `.turn-separator-model` and `.transcript-header-models` rules.

---

## Task 1: Module skeleton + `ModelDisplay` type + Claude name normalization

**Files:**
- Create: `src/transcript/model.ts`
- Create: `src/transcript/model.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/transcript/model.test.ts`:

```ts
import { test, expect } from "bun:test"
import { formatClaudeModel } from "./model"

test("formatClaudeModel: family-major-minor renders 'Family M.m'", () => {
  expect(formatClaudeModel("claude-opus-4-7")).toEqual({
    label: "Opus 4.7",
    raw: "claude-opus-4-7",
  })
  expect(formatClaudeModel("claude-sonnet-4-6")).toEqual({
    label: "Sonnet 4.6",
    raw: "claude-sonnet-4-6",
  })
  expect(formatClaudeModel("claude-opus-4-5-20251101")).toEqual({
    label: "Opus 4.5",
    raw: "claude-opus-4-5-20251101",
  })
  expect(formatClaudeModel("claude-haiku-4-5-20251001")).toEqual({
    label: "Haiku 4.5",
    raw: "claude-haiku-4-5-20251001",
  })
})

test("formatClaudeModel: family-major-<date> with no minor renders 'Family M'", () => {
  expect(formatClaudeModel("claude-sonnet-4-20250514")).toEqual({
    label: "Sonnet 4",
    raw: "claude-sonnet-4-20250514",
  })
})

test("formatClaudeModel: future major bump matches the regex", () => {
  expect(formatClaudeModel("claude-opus-5-0")).toEqual({
    label: "Opus 5.0",
    raw: "claude-opus-5-0",
  })
})

test("formatClaudeModel: non-matching id falls back to raw label", () => {
  expect(formatClaudeModel("claude-something-else")).toEqual({
    label: "claude-something-else",
    raw: "claude-something-else",
  })
  expect(formatClaudeModel("not-a-claude-id")).toEqual({
    label: "not-a-claude-id",
    raw: "not-a-claude-id",
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/transcript/model.test.ts`
Expected: FAIL with `Cannot find module './model'`.

- [ ] **Step 3: Create `model.ts` with the type and Claude formatter**

Create `src/transcript/model.ts`:

```ts
export type ModelDisplay = {
  label: string
  raw: string
}

const CLAUDE_RE = /^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?(?:-\d{6,})?$/

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function formatClaudeModel(raw: string): ModelDisplay {
  const m = CLAUDE_RE.exec(raw)
  if (!m) return { label: raw, raw }
  const family = titleCase(m[1])
  const major = m[2]
  const minor = m[3]
  const label = minor != null ? `${family} ${major}.${minor}` : `${family} ${major}`
  return { label, raw }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/transcript/model.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/transcript/model.ts src/transcript/model.test.ts
git commit -m "feat(model): formatClaudeModel with regex normalization"
```

---

## Task 2: Codex name normalization

**Files:**
- Modify: `src/transcript/model.ts`
- Modify: `src/transcript/model.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/transcript/model.test.ts`:

```ts
import { formatCodexModel } from "./model"

test("formatCodexModel: brand and version separated by space", () => {
  expect(formatCodexModel("gpt-5.5")).toEqual({
    label: "GPT 5.5",
    raw: "gpt-5.5",
  })
})

test("formatCodexModel: suffix preserved with space", () => {
  expect(formatCodexModel("gpt-5.2-codex")).toEqual({
    label: "GPT 5.2 codex",
    raw: "gpt-5.2-codex",
  })
})

test("formatCodexModel: effort joined with /", () => {
  expect(formatCodexModel("gpt-5.5", "high")).toEqual({
    label: "GPT 5.5/high",
    raw: "gpt-5.5",
  })
  expect(formatCodexModel("gpt-5.2-codex", "medium")).toEqual({
    label: "GPT 5.2 codex/medium",
    raw: "gpt-5.2-codex",
  })
})

test("formatCodexModel: empty effort omitted", () => {
  expect(formatCodexModel("gpt-5.5", undefined).label).toBe("GPT 5.5")
  expect(formatCodexModel("gpt-5.5", "").label).toBe("GPT 5.5")
})

test("formatCodexModel: non-matching id falls back to raw", () => {
  expect(formatCodexModel("o1-pro")).toEqual({ label: "o1-pro", raw: "o1-pro" })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/transcript/model.test.ts`
Expected: FAIL on the new tests with "formatCodexModel is not exported".

- [ ] **Step 3: Add the Codex formatter to `model.ts`**

Append to `src/transcript/model.ts`:

```ts
const CODEX_RE = /^gpt-(\d+(?:\.\d+)?)(?:-(.+))?$/

export function formatCodexModel(raw: string, effort?: string): ModelDisplay {
  const m = CODEX_RE.exec(raw)
  let base: string
  if (!m) {
    base = raw
  } else {
    const version = m[1]
    const suffix = m[2]
    base = suffix ? `GPT ${version} ${suffix}` : `GPT ${version}`
  }
  const label = effort ? `${base}/${effort}` : base
  return { label, raw }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/transcript/model.test.ts`
Expected: PASS, 9 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/transcript/model.ts src/transcript/model.test.ts
git commit -m "feat(model): formatCodexModel with effort suffix"
```

---

## Task 3: Synthetic-model predicate

**Files:**
- Modify: `src/transcript/model.ts`
- Modify: `src/transcript/model.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/transcript/model.test.ts`:

```ts
import { isSyntheticClaudeModel } from "./model"

test("isSyntheticClaudeModel: matches the literal <synthetic> token", () => {
  expect(isSyntheticClaudeModel("<synthetic>")).toBe(true)
})

test("isSyntheticClaudeModel: real ids return false", () => {
  expect(isSyntheticClaudeModel("claude-opus-4-7")).toBe(false)
  expect(isSyntheticClaudeModel("")).toBe(false)
  expect(isSyntheticClaudeModel("synthetic")).toBe(false)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/transcript/model.test.ts`
Expected: FAIL with "isSyntheticClaudeModel is not exported".

- [ ] **Step 3: Add the predicate**

Append to `src/transcript/model.ts`:

```ts
export function isSyntheticClaudeModel(raw: string): boolean {
  return raw === "<synthetic>"
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/transcript/model.test.ts`
Expected: PASS, 11 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/transcript/model.ts src/transcript/model.test.ts
git commit -m "feat(model): isSyntheticClaudeModel predicate"
```

---

## Task 4: Type model on `MessageEntry`

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add `model?: string` to the message shape**

In `src/types.ts`, change the `MessageEntry["message"]` shape:

```ts
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
    model?: string
  }
}
```

- [ ] **Step 2: Verify the project still typechecks and tests still pass**

Run: `bun test`
Expected: PASS — no behavior change yet, just a type.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "types: add optional message.model on MessageEntry"
```

---

## Task 5: `TranscriptHeader` renders a model list

**Files:**
- Modify: `src/transcript/TranscriptHeader.tsx`
- Create: `src/transcript/TranscriptHeader.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/transcript/TranscriptHeader.test.tsx`:

```tsx
import { test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { TranscriptHeader } from "./TranscriptHeader"

const TS = "2026-04-29T19:15:00Z"
const FORMAT_OPTS = { now: new Date("2026-04-30T18:00:00Z"), locale: "en-US", timeZone: "UTC" }

test("TranscriptHeader: no models — date only", () => {
  const html = renderToStaticMarkup(
    <TranscriptHeader startTimestamp={TS} formatOptions={FORMAT_OPTS} />,
  )
  expect(html).toContain("Yesterday, 7:15 PM")
  expect(html).not.toContain("•")
})

test("TranscriptHeader: single model — '<label> • <date>'", () => {
  const html = renderToStaticMarkup(
    <TranscriptHeader
      startTimestamp={TS}
      formatOptions={FORMAT_OPTS}
      models={[{ label: "Opus 4.7", raw: "claude-opus-4-7" }]}
    />,
  )
  expect(html).toContain("Opus 4.7")
  expect(html).toContain("•")
  expect(html).toContain("Yesterday, 7:15 PM")
  expect(html).toContain('title="claude-opus-4-7"')
})

test("TranscriptHeader: multiple models comma-joined in discovery order", () => {
  const html = renderToStaticMarkup(
    <TranscriptHeader
      startTimestamp={TS}
      formatOptions={FORMAT_OPTS}
      models={[
        { label: "Opus 4.7", raw: "claude-opus-4-7" },
        { label: "Sonnet 4.6", raw: "claude-sonnet-4-6" },
      ]}
    />,
  )
  expect(html).toContain("Opus 4.7")
  expect(html).toContain("Sonnet 4.6")
  // Order-preserving
  expect(html.indexOf("Opus 4.7")).toBeLessThan(html.indexOf("Sonnet 4.6"))
  expect(html).toContain('title="claude-opus-4-7"')
  expect(html).toContain('title="claude-sonnet-4-6"')
})

test("TranscriptHeader: empty models array behaves like no models", () => {
  const html = renderToStaticMarkup(
    <TranscriptHeader startTimestamp={TS} formatOptions={FORMAT_OPTS} models={[]} />,
  )
  expect(html).not.toContain("•")
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/transcript/TranscriptHeader.test.tsx`
Expected: FAIL — `TranscriptHeader` doesn't accept `models` or `formatOptions`.

- [ ] **Step 3: Update `TranscriptHeader`**

Replace `src/transcript/TranscriptHeader.tsx` with:

```tsx
import { formatChatStart, type FormatChatStartOptions } from "./timing"
import type { ModelDisplay } from "./model"

type Props = {
  startTimestamp: string
  models?: ModelDisplay[]
  formatOptions?: FormatChatStartOptions
}

export function TranscriptHeader({ startTimestamp, models, formatOptions }: Props) {
  const date = formatChatStart(startTimestamp, formatOptions)
  const hasModels = models != null && models.length > 0
  return (
    <div className="transcript-header">
      {hasModels && (
        <span className="transcript-header-models">
          {models!.map((m, i) => (
            <span key={`${m.raw}-${i}`}>
              {i > 0 && ", "}
              <span title={m.raw}>{m.label}</span>
            </span>
          ))}
          {" • "}
        </span>
      )}
      {date}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/transcript/TranscriptHeader.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/transcript/TranscriptHeader.tsx src/transcript/TranscriptHeader.test.tsx
git commit -m "feat(header): render model list before date"
```

---

## Task 6: `TurnSeparator` renders an optional model label

**Files:**
- Modify: `src/transcript/TurnSeparator.tsx`
- Modify: `src/transcript/TurnSeparator.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `src/transcript/TurnSeparator.test.tsx`:

```tsx
test("TurnSeparator: with model renders label and raw-id tooltip", () => {
  const html = renderToStaticMarkup(
    <TurnSeparator
      durationMs={1000}
      usage={null}
      model={{ label: "Sonnet 4.6", raw: "claude-sonnet-4-6" }}
    />,
  )
  expect(html).toContain("Sonnet 4.6")
  expect(html).toContain('title="claude-sonnet-4-6"')
})

test("TurnSeparator: model + usage renders both, model after usage", () => {
  const html = renderToStaticMarkup(
    <TurnSeparator
      durationMs={1000}
      usage={{ input: 6, cacheRead: 0, output: 10 }}
      model={{ label: "Opus 4.7", raw: "claude-opus-4-7" }}
    />,
  )
  expect(html).toContain("↑ 6")
  expect(html).toContain("Opus 4.7")
  expect(html.indexOf("↑ 6")).toBeLessThan(html.indexOf("Opus 4.7"))
})

test("TurnSeparator: model=null renders no model label", () => {
  const html = renderToStaticMarkup(
    <TurnSeparator durationMs={1000} usage={null} model={null} />,
  )
  expect(html).not.toContain("title=")
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/transcript/TurnSeparator.test.tsx`
Expected: FAIL — TurnSeparator doesn't accept `model`.

- [ ] **Step 3: Add the prop**

Replace `src/transcript/TurnSeparator.tsx` with:

```tsx
import { formatDuration } from "./timing"
import { formatTokens, type TurnUsage } from "./usage"
import type { ModelDisplay } from "./model"

type Props = {
  durationMs: number
  usage?: TurnUsage | null
  verb?: string | null
  model?: ModelDisplay | null
}

export function TurnSeparator({ durationMs, usage, verb, model }: Props) {
  return (
    <div className="turn-separator" aria-hidden="true">
      <span className="turn-separator-marker">✓</span>
      <span className="turn-separator-label">
        {verb ? `${verb} for ` : ""}
        {formatDuration(durationMs)}
      </span>
      {usage && (
        <span className="turn-separator-usage">
          <span>↑ {formatTokens(usage.input)}</span>
          <span>↻ {formatTokens(usage.cacheRead)}</span>
          <span>↓ {formatTokens(usage.output)}</span>
        </span>
      )}
      {model && (
        <span className="turn-separator-model" title={model.raw}>
          {model.label}
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/transcript/TurnSeparator.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/transcript/TurnSeparator.tsx src/transcript/TurnSeparator.test.tsx
git commit -m "feat(separator): render optional per-turn model label"
```

---

## Task 7: Discovery + per-turn labeling for the Claude pipeline

**Files:**
- Modify: `src/transcript/timing.ts`
- Modify: `src/transcript/timing.test.ts`
- Modify: `src/transcript/claude/ClaudeCodeTranscript.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `src/transcript/timing.test.ts`:

```ts
test("buildTranscriptItems: returns models list and items", () => {
  const entries: Entry[] = [
    {
      type: "assistant",
      uuid: "a1",
      message: { role: "assistant", content: [], model: "claude-opus-4-7" },
    },
    { type: "system", subtype: "turn_duration", durationMs: 100, parentUuid: "a1" } as Entry,
  ]
  const { items, models } = buildTranscriptItems(entries)
  expect(items.find((i) => i.kind === "separator")).toBeDefined()
  expect(models).toEqual([{ label: "Opus 4.7", raw: "claude-opus-4-7" }])
})

test("buildTranscriptItems: single-model session — separator carries no model", () => {
  const entries: Entry[] = [
    {
      type: "assistant",
      uuid: "a1",
      message: { role: "assistant", content: [], model: "claude-opus-4-7" },
    },
    { type: "system", subtype: "turn_duration", durationMs: 100, parentUuid: "a1" } as Entry,
  ]
  const { items } = buildTranscriptItems(entries)
  const sep = items.find((i) => i.kind === "separator")
  if (sep?.kind !== "separator") throw new Error("expected separator")
  expect(sep.model).toBeNull()
})

test("buildTranscriptItems: multi-model session — every separator carries its turn's model", () => {
  const entries: Entry[] = [
    {
      type: "assistant",
      uuid: "a1",
      message: { role: "assistant", content: [], model: "claude-opus-4-7" },
    },
    { type: "system", subtype: "turn_duration", durationMs: 100, parentUuid: "a1" } as Entry,
    {
      type: "assistant",
      uuid: "a2",
      message: { role: "assistant", content: [], model: "claude-sonnet-4-6" },
    },
    { type: "system", subtype: "turn_duration", durationMs: 200, parentUuid: "a2" } as Entry,
    {
      type: "assistant",
      uuid: "a3",
      message: { role: "assistant", content: [], model: "claude-opus-4-7" },
    },
    { type: "system", subtype: "turn_duration", durationMs: 300, parentUuid: "a3" } as Entry,
  ]
  const { items, models } = buildTranscriptItems(entries)
  expect(models).toEqual([
    { label: "Opus 4.7", raw: "claude-opus-4-7" },
    { label: "Sonnet 4.6", raw: "claude-sonnet-4-6" },
  ])
  const seps = items.filter((i) => i.kind === "separator")
  expect(seps).toHaveLength(3)
  expect(seps[0].kind === "separator" && seps[0].model?.raw).toBe("claude-opus-4-7")
  expect(seps[1].kind === "separator" && seps[1].model?.raw).toBe("claude-sonnet-4-6")
  expect(seps[2].kind === "separator" && seps[2].model?.raw).toBe("claude-opus-4-7")
})

test("buildTranscriptItems: synthetic model rows excluded from discovery and per-turn labels", () => {
  const entries: Entry[] = [
    {
      type: "assistant",
      uuid: "a1",
      message: { role: "assistant", content: [], model: "claude-opus-4-7" },
    },
    { type: "system", subtype: "turn_duration", durationMs: 100, parentUuid: "a1" } as Entry,
    {
      type: "assistant",
      uuid: "syn",
      message: { role: "assistant", content: [], model: "<synthetic>" },
    },
    { type: "system", subtype: "turn_duration", durationMs: 50, parentUuid: "syn" } as Entry,
    {
      type: "assistant",
      uuid: "a2",
      message: { role: "assistant", content: [], model: "claude-sonnet-4-6" },
    },
    { type: "system", subtype: "turn_duration", durationMs: 100, parentUuid: "a2" } as Entry,
  ]
  const { items, models } = buildTranscriptItems(entries)
  expect(models.map((m) => m.raw)).toEqual(["claude-opus-4-7", "claude-sonnet-4-6"])
  const synSep = items.find(
    (i) => i.kind === "separator" && i.afterUuid === "syn",
  )
  if (synSep?.kind !== "separator") throw new Error("expected synthetic separator")
  expect(synSep.model).toBeNull()
})
```

Also update the existing `summarize` helper and call sites to handle the new shape: change `buildTranscriptItems(entries)` consumers to destructure `{ items }`. The two existing callers that need updates:

- The `summarize` helper inside `timing.test.ts` already takes `RenderItem[]`; update its callers in the file:

```ts
expect(summarize(buildTranscriptItems(entries).items)).toMatchInlineSnapshot(...)
```

(repeat for each `summarize(buildTranscriptItems(...))` call — there are several)

- For tests that read `.find((i) => i.kind === "separator")` directly, change to `buildTranscriptItems(entries).items.find(...)`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/transcript/timing.test.ts`
Expected: FAIL — `buildTranscriptItems` returns an array, but tests destructure `{ items, models }`.

- [ ] **Step 3: Update `timing.ts`**

Replace the `RenderItem` and `buildTranscriptItems` definitions in `src/transcript/timing.ts`:

```ts
import type { Entry, MessageEntry, TurnDurationEntry } from "../types"
import { extractClaudeTurnUsage, type TurnUsage } from "./usage"
import { formatClaudeModel, isSyntheticClaudeModel, type ModelDisplay } from "./model"

// (formatChatStart and formatDuration unchanged — keep them)

export type RenderItem =
  | { kind: "header"; chatStartIso: string }
  | { kind: "entry"; entry: MessageEntry }
  | {
      kind: "separator"
      afterUuid: string
      durationMs: number
      usage: TurnUsage | null
      model: ModelDisplay | null
    }

export type BuildResult = {
  items: RenderItem[]
  models: ModelDisplay[]
}

export function buildTranscriptItems(entries: Entry[]): BuildResult {
  if (entries.length === 0) return { items: [], models: [] }

  // Pass 1: index turn durations from system rows.
  const durations = new Map<string, number>()
  for (const entry of entries) {
    if (entry.type === "system" && entry.subtype === "turn_duration") {
      const td = entry as TurnDurationEntry
      if (td.parentUuid && typeof td.durationMs === "number") {
        durations.set(td.parentUuid, td.durationMs)
      }
    }
  }

  // Pass 2: discovery walk — collect distinct non-synthetic models in order.
  const seen = new Set<string>()
  const models: ModelDisplay[] = []
  for (const entry of entries) {
    if (entry.type !== "assistant") continue
    if (entry.isSidechain) continue
    const raw = entry.message?.model
    if (!raw || isSyntheticClaudeModel(raw)) continue
    if (seen.has(raw)) continue
    seen.add(raw)
    models.push(formatClaudeModel(raw))
  }
  const multiModel = models.length >= 2

  // Pass 3: emit items.
  const items: RenderItem[] = []
  const startTimestamp = entries.find((e) => e.timestamp)?.timestamp
  if (startTimestamp) {
    items.push({ kind: "header", chatStartIso: startTimestamp })
  }

  for (const entry of entries) {
    if (entry.type === "system") continue
    if (entry.isSidechain) continue
    if (entry.type !== "user" && entry.type !== "assistant") continue
    items.push({ kind: "entry", entry })
    if (entry.type === "assistant" && entry.uuid) {
      const ms = durations.get(entry.uuid)
      if (ms != null) {
        const raw = entry.message?.model
        const model =
          multiModel && raw && !isSyntheticClaudeModel(raw) ? formatClaudeModel(raw) : null
        items.push({
          kind: "separator",
          afterUuid: entry.uuid,
          durationMs: ms,
          usage: extractClaudeTurnUsage(entry),
          model,
        })
      }
    }
  }

  return { items, models }
}
```

- [ ] **Step 4: Update existing call sites in `timing.test.ts`**

Wherever the file calls `buildTranscriptItems(entries)`, destructure `.items` (or `.items` + `.models`). Specifically:

- `expect(buildTranscriptItems([])).toEqual([])` → `expect(buildTranscriptItems([]).items).toEqual([])` and add `expect(buildTranscriptItems([]).models).toEqual([])`.
- All `summarize(buildTranscriptItems(entries))` → `summarize(buildTranscriptItems(entries).items)`.
- All `buildTranscriptItems(entries).find(...)` / `.filter(...)` etc. → `.items.find(...)` etc.

- [ ] **Step 5: Update Claude transcript wiring**

Edit `src/transcript/claude/ClaudeCodeTranscript.tsx`:

Replace the `const items = buildTranscriptItems(entries)` line with:

```tsx
const { items, models } = buildTranscriptItems(entries)
```

In the items map switch, update the `header` and `separator` cases:

```tsx
case "header":
  return (
    <TranscriptHeader
      key={`hdr-${idx}`}
      startTimestamp={item.chatStartIso}
      models={models}
    />
  )
case "separator":
  return (
    <TurnSeparator
      key={`sep-${item.afterUuid}`}
      durationMs={item.durationMs}
      usage={item.usage}
      verb={pickVerb(item.afterUuid)}
      model={item.model}
    />
  )
```

- [ ] **Step 6: Run all tests**

Run: `bun test`
Expected: PASS — including the new multi-model tests.

- [ ] **Step 7: Commit**

```bash
git add src/transcript/timing.ts src/transcript/timing.test.ts src/transcript/claude/ClaudeCodeTranscript.tsx
git commit -m "feat(claude): per-turn model labeling on multi-model sessions"
```

---

## Task 8: Codex per-turn model + effort labeling

**Files:**
- Modify: `src/transcript/codex/CodexTranscript.tsx`
- Create: `src/transcript/codex/modelLabeling.ts`
- Create: `src/transcript/codex/modelLabeling.test.ts`

The Codex pipeline is currently inline in `CodexTranscript.tsx`. Extract a pure helper for the labeling logic so it's testable.

- [ ] **Step 1: Write the failing tests**

Create `src/transcript/codex/modelLabeling.test.ts`:

```ts
import { test, expect } from "bun:test"
import type { CodexEntry } from "./types"
import { buildCodexModelLabels } from "./modelLabeling"

function ctx(model: string, effort?: string): CodexEntry {
  return { type: "turn_context", payload: { model, effort } }
}
function asst(): CodexEntry {
  return {
    type: "response_item",
    payload: { type: "message", role: "assistant", content: [] },
  }
}

test("buildCodexModelLabels: single (model, effort) → models has one entry, no per-turn labels", () => {
  const entries: CodexEntry[] = [ctx("gpt-5.5", "high"), asst(), asst()]
  const sepIndices = new Set([1, 2])
  const out = buildCodexModelLabels(entries, sepIndices)
  expect(out.models).toEqual([{ label: "GPT 5.5/high", raw: "gpt-5.5" }])
  expect(out.byIndex.size).toBe(0)
})

test("buildCodexModelLabels: model change → every separator carries its turn's pair", () => {
  const entries: CodexEntry[] = [
    ctx("gpt-5.5", "high"),
    asst(),
    ctx("gpt-5.2-codex", "high"),
    asst(),
  ]
  const sepIndices = new Set([1, 3])
  const out = buildCodexModelLabels(entries, sepIndices)
  expect(out.models).toEqual([
    { label: "GPT 5.5/high", raw: "gpt-5.5" },
    { label: "GPT 5.2 codex/high", raw: "gpt-5.2-codex" },
  ])
  expect(out.byIndex.get(1)?.raw).toBe("gpt-5.5")
  expect(out.byIndex.get(3)?.raw).toBe("gpt-5.2-codex")
})

test("buildCodexModelLabels: effort change with same model still triggers multi-mode", () => {
  const entries: CodexEntry[] = [
    ctx("gpt-5.5", "high"),
    asst(),
    ctx("gpt-5.5", "medium"),
    asst(),
  ]
  const sepIndices = new Set([1, 3])
  const out = buildCodexModelLabels(entries, sepIndices)
  expect(out.models).toEqual([
    { label: "GPT 5.5/high", raw: "gpt-5.5" },
    { label: "GPT 5.5/medium", raw: "gpt-5.5" },
  ])
  expect(out.byIndex.get(1)?.label).toBe("GPT 5.5/high")
  expect(out.byIndex.get(3)?.label).toBe("GPT 5.5/medium")
})

test("buildCodexModelLabels: separator with no preceding turn_context has no label and is excluded from models", () => {
  const entries: CodexEntry[] = [asst(), ctx("gpt-5.5", "high"), asst()]
  const sepIndices = new Set([0, 2])
  const out = buildCodexModelLabels(entries, sepIndices)
  expect(out.models).toEqual([{ label: "GPT 5.5/high", raw: "gpt-5.5" }])
  expect(out.byIndex.has(0)).toBe(false)
  // Single-config session → no per-turn label
  expect(out.byIndex.has(2)).toBe(false)
})

test("buildCodexModelLabels: toggling back and forth lists every distinct pair once", () => {
  const entries: CodexEntry[] = [
    ctx("gpt-5.5", "high"),
    asst(),
    ctx("gpt-5.5", "medium"),
    asst(),
    ctx("gpt-5.5", "high"),
    asst(),
  ]
  const sepIndices = new Set([1, 3, 5])
  const out = buildCodexModelLabels(entries, sepIndices)
  expect(out.models.map((m) => m.label)).toEqual([
    "GPT 5.5/high",
    "GPT 5.5/medium",
  ])
  expect(out.byIndex.get(1)?.label).toBe("GPT 5.5/high")
  expect(out.byIndex.get(3)?.label).toBe("GPT 5.5/medium")
  expect(out.byIndex.get(5)?.label).toBe("GPT 5.5/high")
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/transcript/codex/modelLabeling.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the helper**

Create `src/transcript/codex/modelLabeling.ts`:

```ts
import type { CodexEntry } from "./types"
import { formatCodexModel, type ModelDisplay } from "../model"

export type CodexModelLabels = {
  models: ModelDisplay[]
  byIndex: Map<number, ModelDisplay>
}

export function buildCodexModelLabels(
  entries: CodexEntry[],
  separatorIndices: ReadonlySet<number>,
): CodexModelLabels {
  // Walk entries left-to-right tracking the most recent turn_context.
  // For each separator index, snapshot the (model, effort) effective at
  // that point. Build the discovery-order list deduped on the (label, raw)
  // key — using label captures effort changes; raw captures model changes.
  const labels: ModelDisplay[] = []
  const seen = new Set<string>()
  const byIndex = new Map<number, ModelDisplay>()
  let cur: { model: string; effort?: string } | null = null

  // Snapshot the labels per separator first; we need to know the total
  // count of distinct labels to decide multi vs single.
  const perSepLabel = new Map<number, ModelDisplay>()

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    if (e.type === "turn_context") {
      const m = e.payload.model
      if (m) cur = { model: m, effort: e.payload.effort }
      continue
    }
    if (separatorIndices.has(i) && cur) {
      const label = formatCodexModel(cur.model, cur.effort)
      perSepLabel.set(i, label)
      const key = `${label.raw}|${label.label}`
      if (!seen.has(key)) {
        seen.add(key)
        labels.push(label)
      }
    }
  }

  if (labels.length >= 2) {
    for (const [i, label] of perSepLabel) {
      byIndex.set(i, label)
    }
  }

  return { models: labels, byIndex }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/transcript/codex/modelLabeling.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Wire into `CodexTranscript.tsx`**

Edit `src/transcript/codex/CodexTranscript.tsx`. After the existing `const usages = ...` line, add:

```tsx
import { buildCodexModelLabels } from "./modelLabeling"
// (move this to the top with the other imports)

const sepIndexSet = new Set(durations.keys())
const modelLabels = buildCodexModelLabels(entries, sepIndexSet)
```

Update the header render:

```tsx
{startTimestamp && (
  <TranscriptHeader startTimestamp={startTimestamp} models={modelLabels.models} />
)}
```

Update the `TurnSeparator` render:

```tsx
{ms != null && (
  <TurnSeparator
    durationMs={ms}
    usage={usages.get(i) ?? null}
    model={modelLabels.byIndex.get(i) ?? null}
  />
)}
```

- [ ] **Step 6: Run all tests**

Run: `bun test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/transcript/codex/modelLabeling.ts src/transcript/codex/modelLabeling.test.ts src/transcript/codex/CodexTranscript.tsx
git commit -m "feat(codex): per-turn model+effort labeling on multi-config sessions"
```

---

## Task 9: Styling

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add CSS rules**

Append the following near the existing `.turn-separator-usage` rule in `src/styles.css`:

```css
.turn-separator-model {
  font-variant-numeric: tabular-nums;
}
.transcript-header-models {
  /* Inherits color/size from .transcript-header */
}
```

(No new colors or borders — the spec calls for reusing existing typography. `font-variant-numeric: tabular-nums` keeps version digits aligned across separators.)

- [ ] **Step 2: Verify nothing broke**

Run: `bun test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "style(model): tabular-nums on per-turn model label"
```

---

## Task 10: Manual verification

**Files:** none (smoke test the running app)

- [ ] **Step 1: Kill any existing dev server**

If a dev server is already running from a previous task, kill it first (per project preference: track the PID, don't routinely lsof).

- [ ] **Step 2: Start dev server**

```bash
bun run dev
```

(Background or in another terminal — note the PID for cleanup.)

- [ ] **Step 3: Drag in `src/__fixtures__/sample.jsonl`** (Claude, single model `claude-opus-4-7`)

Verify:
- Header shows `Opus 4.7 • <date>` (with a `title="claude-opus-4-7"` tooltip on the model label).
- No turn separators carry a model label.

- [ ] **Step 4: Drag in `src/__fixtures__/codex-sample.jsonl`** (Codex, single model `gpt-5.5`, no effort recorded in the fixture)

Verify:
- Header shows `GPT 5.5 • <date>` (slash + effort omitted because the fixture's `turn_context.effort` is empty).
- No separator labels.

- [ ] **Step 5: Construct a multi-model Claude session**

Create a temporary test fixture by combining a real session with a synthetic multi-model patch — or take one of the user's real multi-model jsonls (e.g. `~/.claude/projects/-Users-andrew-Developer-Web-Dave/b86d0172-c882-45b9-ae57-c488b987cee1.jsonl`, which mixes `claude-opus-4-6` and `sonnet`) — and drag it in.

Verify:
- Header shows two entries comma-joined.
- Every separator carries its turn's model label.
- Hover on a label reveals the raw id.

- [ ] **Step 6: Stop the dev server**

Kill the dev server PID you noted.

- [ ] **Step 7: Final test sweep + commit any missed touchups**

```bash
bun test
```

Expected: PASS, all suites.

If everything's green and the manual checks pass, no commit is needed for this task.

---

## Self-review

Spec coverage check:

- Header lists every distinct model in discovery order — Task 5 (header) + Task 7/8 (discovery walks).
- Separator labels every turn when multi-model, none when single — Task 7 (Claude logic) + Task 8 (Codex logic).
- Pattern-based normalization for Claude including `family-major-<date>` — Task 1.
- Pattern-based normalization for Codex with effort suffix — Task 2.
- `<synthetic>` model excluded — Task 3 (predicate) + Task 7 (applied).
- Tooltip with raw id — Task 5 (header) + Task 6 (separator).
- Dedup on raw id (Claude) / `(label, raw)` (Codex) — Task 7 + Task 8.
- Out of scope (subagents, Claude effort, speed) — not implemented; nothing to verify.

Type consistency check:

- `ModelDisplay` is `{ label: string; raw: string }` everywhere (model.ts, header, separator, timing, codex helper).
- `buildTranscriptItems` returns `BuildResult = { items: RenderItem[]; models: ModelDisplay[] }` — Claude transcript destructures it.
- `RenderItem` separator has `model: ModelDisplay | null` (always present, may be null).
- Codex helper returns `{ models: ModelDisplay[]; byIndex: Map<number, ModelDisplay> }` — Codex transcript looks up `byIndex.get(i) ?? null`.
