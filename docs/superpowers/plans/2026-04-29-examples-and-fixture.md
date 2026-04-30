# Examples & Fixture Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the synthetic `sample.jsonl` fixture with a real Claude Code session, and restructure the empty-state landing area into a reusable "Examples" section.

**Architecture:** Introduce a small `examples.ts` module (`Example` type, `EXAMPLES` array, `exampleStats` helper). A new `Examples.tsx` component renders the section. `App.tsx` swaps its inline `.demo-row` for `<Examples onSelect={loadText} />`. The fixture file is replaced byte-for-byte; the snapshot test in `parse.test.ts` is reshaped to assert summary statistics instead of full per-entry rendering, since the new fixture has hundreds of entries.

**Tech Stack:** React 19, TypeScript, Bun (`bun:test`), CSS variables, `@phosphor-icons/react`. No new dependencies.

---

## File Structure

- **Create** `src/examples.ts` — `Example` type, `EXAMPLES` array, `exampleStats(content) → { turns, sizeBytes }`, `formatBytes(n) → string`
- **Create** `src/examples.test.ts` — unit tests for `exampleStats` and `formatBytes`
- **Create** `src/Examples.tsx` — `<Examples onSelect={...} />` component rendering the section
- **Modify** `src/App.tsx` — remove inline `.demo-row` / "Load sample" button, render `<Examples onSelect={loadText} />`
- **Modify** `src/styles.css` — add `.examples`, `.examples-header`, `.example-row` rules; remove now-unused `.demo-row`, `.demo-link`
- **Replace** `src/__fixtures__/sample.jsonl` — copy of the real session
- **Modify** `src/parse.test.ts` — reshape the fixture-rendering test into a stats-summary assertion (the old per-entry script is impractical at >1000 entries)

---

## Task 1: Replace the fixture

**Files:**

- Replace: `src/__fixtures__/sample.jsonl`

- [ ] **Step 1: Copy the real session over the existing fixture**

```bash
cp ~/.claude/projects/-Users-andrew-Developer-Prefix-jsonl-fyi/0dc40511-6d23-4460-9e5b-ecb10e418fe7.jsonl src/__fixtures__/sample.jsonl
```

- [ ] **Step 2: Sanity-check that turn_duration and away_summary are present**

Run:

```bash
grep -c '"subtype":"turn_duration"' src/__fixtures__/sample.jsonl
grep -c '"subtype":"away_summary"' src/__fixtures__/sample.jsonl
wc -l src/__fixtures__/sample.jsonl
```

Expected: `turn_duration` count > 0, `away_summary` count > 0, total line count > 100.

- [ ] **Step 3: Run the existing test suite to see what breaks**

Run: `bun test src/parse.test.ts`

Expected: the inline snapshot in `parseJsonl renders the fixture as a Claude-style script` will fail (entry count + types changed). The malformed-lines test still passes.

- [ ] **Step 4: Commit the fixture swap (test failure is expected at this point — fixed in Task 2)**

```bash
git add src/__fixtures__/sample.jsonl
git commit -m "fixture: swap synthetic sample for real session transcript"
```

---

## Task 2: Reshape the fixture rendering test

The old test snapshots an entry-by-entry script. With the new fixture, that snapshot is hundreds of lines and dominated by tool calls. Replace it with a summary-statistics assertion that's tight, readable, and still catches regressions in `parseJsonl`'s filter behavior.

**Files:**

- Modify: `src/parse.test.ts`

- [ ] **Step 1: Replace the fixture test body**

Replace the entire `test("parseJsonl renders the fixture as a Claude-style script", ...)` block (and the `renderEntry`, `toolTitle`, `truncate` helpers above it that exist only to support that test) with a stats-summary test.

New content (replace lines 1–151 of the current file, leaving the malformed-lines test below it untouched):

```ts
import { test, expect } from "bun:test"
import { parseJsonl } from "./parse"

test("parseJsonl filters and counts entries from the real fixture", async () => {
  const text = await Bun.file(new URL("./__fixtures__/sample.jsonl", import.meta.url)).text()
  const { entries, skipped } = parseJsonl(text)

  const typeCounts = new Map<string, number>()
  for (const e of entries) typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1)
  const types = [...typeCounts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join(" ")

  const summary = [`entries=${entries.length} skipped=${skipped}`, `types: ${types}`].join("\n")

  expect(summary).toMatchInlineSnapshot()
})
```

The empty `toMatchInlineSnapshot()` with no argument tells Bun to fill it in on first run.

- [ ] **Step 2: Run the test to populate the snapshot**

Run: `bun test src/parse.test.ts -u`

Expected: the test passes and `parse.test.ts` is rewritten with the real values inside `toMatchInlineSnapshot(\`...\`)`.

- [ ] **Step 3: Inspect the populated snapshot**

Open `src/parse.test.ts` and confirm:

- `entries=...` reflects the real entry count after `system` etc. are filtered.
- `types:` only contains `assistant` and `user` (since `parseJsonl` filters out `system`, `queue-operation`, etc.).
- `skipped=0` (no malformed lines).

If anything looks wrong, stop and investigate — do not commit a snapshot you don't believe.

- [ ] **Step 4: Run the full test file to confirm both tests pass**

Run: `bun test src/parse.test.ts`

Expected: 2 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/parse.test.ts
git commit -m "test: replace fixture script snapshot with stats summary"
```

---

## Task 3: `examples.ts` — types, helpers (TDD)

**Files:**

- Create: `src/examples.ts`
- Create: `src/examples.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/examples.test.ts`:

```ts
import { test, expect } from "bun:test"
import { exampleStats, formatBytes } from "./examples"

test("formatBytes uses bytes / KB / MB with one decimal", () => {
  expect(formatBytes(0)).toBe("0 B")
  expect(formatBytes(512)).toBe("512 B")
  expect(formatBytes(1024)).toBe("1.0 KB")
  expect(formatBytes(2048)).toBe("2.0 KB")
  expect(formatBytes(1536)).toBe("1.5 KB")
  expect(formatBytes(1024 * 1024)).toBe("1.0 MB")
  expect(formatBytes(1_500_000)).toBe("1.4 MB")
})

test("exampleStats counts turn_duration entries when present", () => {
  const lines = [
    `{"type":"user","message":{"role":"user","content":"hi"}}`,
    `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hello"}]}}`,
    `{"type":"system","subtype":"turn_duration","durationMs":1000,"parentUuid":"a"}`,
    `{"type":"user","message":{"role":"user","content":"again"}}`,
    `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"sure"}]}}`,
    `{"type":"system","subtype":"turn_duration","durationMs":2000,"parentUuid":"b"}`,
  ]
  const content = lines.join("\n")
  const stats = exampleStats(content)
  expect(stats.turns).toBe(2)
  expect(stats.sizeBytes).toBe(content.length)
})

test("exampleStats falls back to user-typed message count when no turn_duration", () => {
  // user-typed = user-role entry whose content is NOT a tool_result
  const lines = [
    `{"type":"user","message":{"role":"user","content":"hello"}}`,
    `{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"x","name":"Read","input":{}}]}}`,
    // tool_result-bearing user message — must NOT count as a turn
    `{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"x","content":"ok"}]}}`,
    `{"type":"user","message":{"role":"user","content":"thanks"}}`,
  ]
  const content = lines.join("\n")
  const stats = exampleStats(content)
  expect(stats.turns).toBe(2)
})

test("exampleStats ignores malformed lines", () => {
  const content = [`{"type":"user","message":{"role":"user","content":"hi"}}`, `not json`, ``].join(
    "\n",
  )
  expect(exampleStats(content).turns).toBe(1)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/examples.test.ts`

Expected: FAIL — `Cannot find module './examples'`.

- [ ] **Step 3: Implement `src/examples.ts`**

```ts
// eslint-disable-next-line
// @ts-ignore — Bun handles `with { type: "text" }` at bundle time
import sampleJsonl from "./__fixtures__/sample.jsonl" with { type: "text" }

export type Example = {
  name: string
  fileName: string
  content: string
}

export const EXAMPLES: Example[] = [
  {
    name: "app header redesign",
    fileName: "sample.jsonl",
    content: sampleJsonl,
  },
]

export type ExampleStats = {
  turns: number
  sizeBytes: number
}

export function exampleStats(content: string): ExampleStats {
  let turnDurations = 0
  let userTypedMessages = 0

  for (const raw of content.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    let obj: unknown
    try {
      obj = JSON.parse(line)
    } catch {
      continue
    }
    if (!obj || typeof obj !== "object") continue
    const o = obj as Record<string, unknown>

    if (o.type === "system" && o.subtype === "turn_duration") {
      turnDurations++
      continue
    }

    if (o.type === "user" && isUserTypedMessage(o)) {
      userTypedMessages++
    }
  }

  return {
    turns: turnDurations > 0 ? turnDurations : userTypedMessages,
    sizeBytes: content.length,
  }
}

function isUserTypedMessage(entry: Record<string, unknown>): boolean {
  const msg = entry.message as Record<string, unknown> | undefined
  if (!msg) return false
  const c = msg.content
  if (typeof c === "string") return true
  if (!Array.isArray(c)) return false
  // tool_result-bearing user messages are harness-emitted, not user-typed
  return !c.some(
    (b) => b && typeof b === "object" && (b as { type?: unknown }).type === "tool_result",
  )
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/examples.test.ts`

Expected: 4 pass, 0 fail.

- [ ] **Step 5: Type-check and lint**

Run: `bun run check`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/examples.ts src/examples.test.ts
git commit -m "feat: add examples module with stats helper"
```

---

## Task 4: `Examples.tsx` component

No project-level React testing harness exists, so this task uses manual browser verification rather than TDD. Keep the component small and side-effect-free so the logic is obvious by reading.

**Files:**

- Create: `src/Examples.tsx`

- [ ] **Step 1: Implement the component**

```tsx
import { EXAMPLES, exampleStats, formatBytes } from "./examples"

type Props = {
  onSelect: (content: string, fileName: string, persist?: boolean) => void
}

export function Examples({ onSelect }: Props) {
  if (EXAMPLES.length === 0) return null
  return (
    <section className="examples">
      <h2 className="examples-header">Examples</h2>
      <ul className="examples-list">
        {EXAMPLES.map((example) => {
          const { turns, sizeBytes } = exampleStats(example.content)
          return (
            <li key={example.fileName}>
              <button
                type="button"
                className="example-row"
                onClick={() => onSelect(example.content, example.fileName, false)}
              >
                <span className="example-row-title">{example.name}</span>
                <span className="example-row-meta">
                  ({turns} turns, {formatBytes(sizeBytes)})
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `bun run check`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/Examples.tsx
git commit -m "feat: add Examples section component"
```

---

## Task 5: Wire `Examples` into `App.tsx`

**Files:**

- Modify: `src/App.tsx`

- [ ] **Step 1: Remove the inline demo row and the now-unused `sampleJsonl` import**

Edit `src/App.tsx`:

Remove these lines near the top of the file:

```tsx
// eslint-disable-next-line
// @ts-ignore — Bun handles `with { type: "text" }` at bundle time
import sampleJsonl from "./__fixtures__/sample.jsonl" with { type: "text" }
```

And add:

```tsx
import { Examples } from "./Examples"
import { EXAMPLES } from "./examples"
```

- [ ] **Step 2: Replace the `.demo-row` block and reorder so Examples comes last**

The spec defines the empty-state order as: drop zone → `~/.claude` hint → Examples. The current code has `.demo-row` _between_ the drop zone and the hint. Remove the `.demo-row` entirely and place `<Examples />` _after_ the hint.

Find:

```tsx
          <div className="demo-row">
            <button
              className="demo-link"
              onClick={() => loadText(sampleJsonl, "sample.jsonl", false)}
            >
              Load sample
            </button>
          </div>
          <p className="drop-zone-hint">
            Claude Code stores sessions at{" "}
            <code>~/.claude/projects/&lt;project&gt;/&lt;session&gt;.jsonl</code>
          </p>
```

Replace with:

```tsx
          <p className="drop-zone-hint">
            Claude Code stores sessions at{" "}
            <code>~/.claude/projects/&lt;project&gt;/&lt;session&gt;.jsonl</code>
          </p>
          <Examples onSelect={loadText} />
```

- [ ] **Step 3: Update the `?demo` URL handler to use the first example**

Find this block in the `useEffect`:

```tsx
if (params.has("demo")) {
  loadText(sampleJsonl, "sample.jsonl", false)
  return
}
```

Replace with:

```tsx
if (params.has("demo") && EXAMPLES.length > 0) {
  const first = EXAMPLES[0]
  loadText(first.content, first.fileName, false)
  return
}
```

- [ ] **Step 4: Type-check**

Run: `bun run check`

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: render Examples section in empty state"
```

---

## Task 6: Styles

**Files:**

- Modify: `src/styles.css`

- [ ] **Step 1: Remove the now-unused `.demo-row` and `.demo-link` rules**

Delete these blocks from `src/styles.css`:

```css
.demo-row {
  text-align: center;
  margin-top: 12px;
}
.demo-link {
  color: var(--muted);
  text-decoration: underline;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font: inherit;
}
.demo-link:hover {
  color: var(--fg);
}
```

- [ ] **Step 2: Add the Examples section styles**

Append to `src/styles.css`:

```css
.examples {
  margin-top: 32px;
}
.examples-header {
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--muted);
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.examples-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--border);
}
.examples-list li {
  border-bottom: 1px solid var(--border);
}
.example-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 12px 8px;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.example-row:hover {
  background: var(--card);
}
.example-row-title {
  font-weight: 500;
  color: var(--fg);
}
.example-row-meta {
  font-size: var(--fs-sm);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "style: add Examples section styles, remove demo-row"
```

---

## Task 7: Manual browser verification

The dev server uses Bun's HTML loader. Following the user's standing rule, kill any prior dev server before launching a new one.

**Files:** none

- [ ] **Step 1: Kill any existing dev server you started in this session**

If you launched `bun index.html` earlier in this session, kill its PID. If not, skip.

- [ ] **Step 2: Start the dev server**

Run: `bun index.html` (likely served at `http://localhost:3000` or whatever Bun reports). Note the PID.

- [ ] **Step 3: Verify the empty state**

Open the dev URL. Confirm:

- Drop zone present.
- `~/.claude/projects/...` hint below it.
- Below the hint: a small all-caps "EXAMPLES" header, then a single row reading `app header redesign    (N turns, NNN KB)`.
- Hovering the row highlights it; clicking it loads the transcript.
- Once loaded, the header shows `sample.jsonl` and the transcript renders.

- [ ] **Step 4: Verify the `?demo` URL still works**

Visit `http://localhost:3000/?demo`. Confirm the transcript loads automatically without showing the empty state.

- [ ] **Step 5: Run the full test suite and type-check one more time**

```bash
bun test
bun run check
```

Expected: all tests pass, no type errors.

- [ ] **Step 6: Kill the dev server**

Kill the PID you noted in Step 2.

- [ ] **Step 7: Final commit if any tweaks were needed**

If browser verification surfaced issues, fix and commit. Otherwise nothing to commit here.

---

## Done

When all tasks above are complete:

- Fixture is the real session.
- `Examples` section renders in the empty state with computed metadata.
- Tests pass; type-check passes.
- The follow-up "Show Timestamps" plan (`2026-04-29-show-timestamps-design.md` →
  not yet planned) can now be written and implemented against this fixture.
