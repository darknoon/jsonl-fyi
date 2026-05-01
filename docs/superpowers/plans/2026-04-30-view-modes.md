# View modes — Normal preview implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global view-mode setting (Compact / Normal) and per-tool "Normal" inline previews that mimic Claude Code's terminal UI, supporting both Claude Code and Codex transcripts.

**Architecture:** One new slot `<ToolCard.Preview>` whose render is gated by the global `viewMode` from `useSettings()`. Each tool component declares either both `Preview + Content` (small preview, larger expanded body), or `Preview` only (preview is the full body), or neither (header-only). JS slices logical lines for snippets; CSS line-clamp bounds visual height predictably.

**Tech Stack:** Vite + React + TypeScript + Bun. Tests run via `bun test`.

**Reference:** Spec at `docs/superpowers/specs/2026-04-30-view-modes-design.md`. TUI behavior research at `docs/research/transcript-viewer-normal-tool-ui-spec.md` (Claude) and `docs/research/tui-inline-tool-call-rendering.md` (Codex).

---

## File structure

**New files:**

- `src/transcript/preview.ts` — pure helpers (`tailLines`, `headLines`, `parseFrontmatter`)
- `src/transcript/preview.test.ts` — unit tests for above
- `src/transcript/MoreHint.tsx` — `<MoreHint count={n}/>` dim row
- `src/transcript/claude/Tool.test.tsx` — per-tool Claude preview tests
- `src/transcript/codex/Tool.test.tsx` — per-tool Codex preview tests
- `src/transcript/codex/CodexTranscript.test.tsx` — nickname-resolution pre-pass test
- `src/__fixtures__/normal-mode-claude.jsonl` — minimal fixture: Bash, Read, Edit, TodoWrite, Skill
- `src/__fixtures__/normal-mode-codex.jsonl` — minimal fixture: shell_command, apply_patch, spawn_agent + wait_agent (string-abort)

**Modified files:**

- `src/settings.tsx` — `Settings` gains `viewMode`; setter; default `"normal"`
- `src/settings.test.tsx` — extend round-trip + default tests
- `src/SettingsPopover.tsx` — add View mode `<select>`
- `src/transcript/ToolCard.tsx` — add `Preview` slot + render rules + clickability
- `src/styles.css` — `.tool-preview-line`, `.tool-preview-snippet` (with per-snippet variants), MoreHint styling
- `src/transcript/claude/Tool.tsx` — add `<ToolCard.Preview>` per tool; restructure Edit/MultiEdit/NotebookEdit/ExitPlanMode to use Preview only
- `src/transcript/codex/Tool.tsx` — same for Codex tools; add nickname map prop
- `src/transcript/codex/CodexTranscript.tsx` — add `agentNicknames` pre-pass; thread it through to dispatcher
- `src/transcript/UnknownTool.tsx` — add Preview (3-line head)

---

## Phase 1 — Foundations

### Task 1: `tailLines` helper

**Files:**

- Create: `src/transcript/preview.ts`
- Create: `src/transcript/preview.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/transcript/preview.test.ts
import { describe, expect, test } from "bun:test"
import { tailLines } from "./preview"

describe("tailLines", () => {
  test("returns last n lines and remaining count", () => {
    expect(tailLines("a\nb\nc\nd", 2)).toEqual({ text: "c\nd", remaining: 2 })
  })

  test("returns full text when n exceeds line count", () => {
    expect(tailLines("a\nb", 5)).toEqual({ text: "a\nb", remaining: 0 })
  })

  test("handles empty string", () => {
    expect(tailLines("", 3)).toEqual({ text: "", remaining: 0 })
  })

  test("strips trailing newline before counting", () => {
    expect(tailLines("a\nb\n", 1)).toEqual({ text: "b", remaining: 1 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/transcript/preview.test.ts`
Expected: FAIL — `tailLines is not defined` (or module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/transcript/preview.ts
export function tailLines(text: string, n: number): { text: string; remaining: number } {
  if (!text) return { text: "", remaining: 0 }
  const trimmed = text.endsWith("\n") ? text.slice(0, -1) : text
  const lines = trimmed.split("\n")
  if (lines.length <= n) return { text: trimmed, remaining: 0 }
  return { text: lines.slice(-n).join("\n"), remaining: lines.length - n }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/transcript/preview.test.ts`
Expected: PASS — 4 of 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/transcript/preview.ts src/transcript/preview.test.ts
git commit -m "feat(preview): tailLines helper"
```

---

### Task 2: `headLines` helper

**Files:**

- Modify: `src/transcript/preview.ts`
- Modify: `src/transcript/preview.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
// append to src/transcript/preview.test.ts
import { tailLines, headLines } from "./preview"

describe("headLines", () => {
  test("returns first n lines and remaining count", () => {
    expect(headLines("a\nb\nc\nd", 2)).toEqual({ text: "a\nb", remaining: 2 })
  })

  test("returns full text when n exceeds line count", () => {
    expect(headLines("a\nb", 5)).toEqual({ text: "a\nb", remaining: 0 })
  })

  test("handles empty string", () => {
    expect(headLines("", 3)).toEqual({ text: "", remaining: 0 })
  })

  test("strips trailing newline before counting", () => {
    expect(headLines("a\nb\n", 1)).toEqual({ text: "a", remaining: 1 })
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `bun test src/transcript/preview.test.ts`
Expected: FAIL — `headLines is not defined`

- [ ] **Step 3: Implement**

```ts
// append to src/transcript/preview.ts
export function headLines(text: string, n: number): { text: string; remaining: number } {
  if (!text) return { text: "", remaining: 0 }
  const trimmed = text.endsWith("\n") ? text.slice(0, -1) : text
  const lines = trimmed.split("\n")
  if (lines.length <= n) return { text: trimmed, remaining: 0 }
  return { text: lines.slice(0, n).join("\n"), remaining: lines.length - n }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `bun test src/transcript/preview.test.ts`
Expected: PASS — all 8 cases

- [ ] **Step 5: Commit**

```bash
git add src/transcript/preview.ts src/transcript/preview.test.ts
git commit -m "feat(preview): headLines helper"
```

---

### Task 3: `parseFrontmatter` helper

**Files:**

- Modify: `src/transcript/preview.ts`
- Modify: `src/transcript/preview.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
// append to src/transcript/preview.test.ts
import { parseFrontmatter } from "./preview"

describe("parseFrontmatter", () => {
  test("parses simple key/value frontmatter", () => {
    const text = `---
name: brainstorming
description: Help turn ideas into designs
---

# Body
`
    expect(parseFrontmatter(text)).toEqual({
      name: "brainstorming",
      description: "Help turn ideas into designs",
    })
  })

  test("joins folded multi-line description into one string", () => {
    const text = `---
name: foo
description: Use this when starting any conversation - establishes how
  to find and use skills, requiring tool invocation before any response
---
body`
    const fm = parseFrontmatter(text)
    expect(fm?.description).toContain("starting any conversation")
    expect(fm?.description).toContain("requiring tool invocation")
    expect(fm?.description).not.toContain("\n")
  })

  test("returns undefined when no frontmatter block", () => {
    expect(parseFrontmatter("just body, no fences")).toBeUndefined()
  })

  test("returns undefined when fences are not closed", () => {
    expect(parseFrontmatter("---\nname: x\nbody without close")).toBeUndefined()
  })

  test("handles empty input", () => {
    expect(parseFrontmatter("")).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `bun test src/transcript/preview.test.ts`
Expected: FAIL — `parseFrontmatter is not defined`

- [ ] **Step 3: Implement**

```ts
// append to src/transcript/preview.ts
export function parseFrontmatter(text: string): Record<string, string> | undefined {
  if (!text || !text.startsWith("---")) return undefined
  const lines = text.split("\n")
  if (lines[0] !== "---") return undefined
  let endIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      endIdx = i
      break
    }
  }
  if (endIdx === -1) return undefined

  const out: Record<string, string> = {}
  let currentKey: string | null = null
  for (let i = 1; i < endIdx; i++) {
    const line = lines[i]
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line)
    if (m) {
      currentKey = m[1]
      out[currentKey] = m[2].trim()
    } else if (currentKey && /^\s+\S/.test(line)) {
      // folded continuation: indented further than the key
      const trimmed = line.trim()
      out[currentKey] = out[currentKey] ? `${out[currentKey]} ${trimmed}` : trimmed
    } else if (line.trim() === "") {
      currentKey = null
    }
  }
  return out
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `bun test src/transcript/preview.test.ts`
Expected: PASS — all cases

- [ ] **Step 5: Commit**

```bash
git add src/transcript/preview.ts src/transcript/preview.test.ts
git commit -m "feat(preview): parseFrontmatter helper"
```

---

### Task 4: `viewMode` setting

**Files:**

- Modify: `src/settings.tsx`
- Modify: `src/settings.test.tsx`

- [ ] **Step 1: Add failing test**

```tsx
// append to src/settings.test.tsx — inside the existing describe block
test("default viewMode is 'normal' for fresh users", () => {
  localStorage.clear()
  // render the provider, assert the context exposes viewMode === "normal"
  // (Use the existing test pattern — render <SettingsProvider>, hook into useSettings via a probe component.)
})

test("setViewMode persists to localStorage and round-trips", () => {
  localStorage.clear()
  // ... render, call setViewMode("compact"), unmount, remount, assert "compact"
})

test("legacy payload without viewMode upgrades to default 'normal'", () => {
  localStorage.setItem("jsonl-fyi:settings", JSON.stringify({ renderMarkdown: false }))
  // ... render, assert viewMode === "normal" and renderMarkdown === false
})
```

(Adapt the exact test scaffolding to match the existing `settings.test.tsx` style — same test runner, same probe approach.)

- [ ] **Step 2: Run tests to verify failure**

Run: `bun test src/settings.test.tsx`
Expected: FAIL — `viewMode` not defined on context.

- [ ] **Step 3: Modify `src/settings.tsx`**

```tsx
// Replace the relevant parts of src/settings.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

export type ViewMode = "compact" | "normal"
export type Settings = { renderMarkdown: boolean; viewMode: ViewMode }

type Ctx = Settings & {
  setRenderMarkdown: (v: boolean) => void
  setViewMode: (v: ViewMode) => void
}

const STORAGE_KEY = "jsonl-fyi:settings"
const DEFAULTS: Settings = { renderMarkdown: true, viewMode: "normal" }

const SettingsCtx = createContext<Ctx>({
  ...DEFAULTS,
  setRenderMarkdown: () => {},
  setViewMode: () => {},
})

function load(): Settings {
  if (typeof localStorage === "undefined") return DEFAULTS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<Settings>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return DEFAULTS
  }
}

function persist(s: Settings): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // ignore quota / privacy mode failures
  }
}

export function SettingsProvider({
  initial,
  children,
}: {
  initial?: Settings
  children: ReactNode
}) {
  const [settings, setSettings] = useState<Settings>(() => initial ?? load())

  useEffect(() => {
    if (initial) return
    persist(settings)
  }, [settings, initial])

  const value: Ctx = {
    ...settings,
    setRenderMarkdown: (v) => setSettings((s) => ({ ...s, renderMarkdown: v })),
    setViewMode: (v) => setSettings((s) => ({ ...s, viewMode: v })),
  }
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>
}

export function useSettings(): Ctx {
  return useContext(SettingsCtx)
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `bun test src/settings.test.tsx`
Expected: PASS — all (existing + 3 new) cases.

- [ ] **Step 5: Commit**

```bash
git add src/settings.tsx src/settings.test.tsx
git commit -m "feat(settings): add viewMode (compact|normal) with default 'normal'"
```

---

### Task 5: View mode dropdown in SettingsPopover

**Files:**

- Modify: `src/SettingsPopover.tsx`

- [ ] **Step 1: Read current SettingsPopover**

Run: `cat src/SettingsPopover.tsx` — get the existing structure so the new control matches.

- [ ] **Step 2: Add the dropdown above the Markdown toggle**

```tsx
// In SettingsPopover.tsx — add inside the popover body, before the existing
// renderMarkdown row. Adapt to match existing visual pattern (label + control on
// one row, etc.).
const { viewMode, setViewMode } = useSettings()

// Render:
<label className="setting-row">
  <span className="setting-label">View mode</span>
  <select
    className="setting-control"
    value={viewMode}
    onChange={(e) => setViewMode(e.currentTarget.value as ViewMode)}
  >
    <option value="normal">Normal</option>
    <option value="compact">Compact</option>
  </select>
</label>
```

Import `ViewMode` from `./settings` alongside the existing imports.

- [ ] **Step 3: Visual check via agent-browser**

Skip end-to-end at this point (no Preview slot yet — switching modes won't change rendering until Phase 2). Instead, run `bun run tsc --noEmit` to confirm types are clean.

Run: `bun run tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/SettingsPopover.tsx
git commit -m "feat(settings): View mode dropdown in popover"
```

---

### Task 6: `MoreHint` component

**Files:**

- Create: `src/transcript/MoreHint.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Create the component**

```tsx
// src/transcript/MoreHint.tsx
export function MoreHint({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <div className="tool-more-hint">
      … +{count} {count === 1 ? "line" : "lines"}
    </div>
  )
}
```

- [ ] **Step 2: Add CSS**

Append to `src/styles.css`:

```css
.tool-more-hint {
  font-size: 0.85em;
  color: var(--muted, #888);
  padding-top: 2px;
}
```

(Adapt the variable name to whatever the project uses for muted text — check `styles.css` for an existing pattern.)

- [ ] **Step 3: Type-check**

Run: `bun run tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/transcript/MoreHint.tsx src/styles.css
git commit -m "feat(preview): MoreHint component"
```

---

### Task 7: ToolCard `Preview` slot + render rules

**Files:**

- Modify: `src/transcript/ToolCard.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Update `ToolCard.tsx`**

```tsx
// src/transcript/ToolCard.tsx — full replacement
import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useState,
  type ReactElement,
  type ReactNode,
} from "react"
import { useSettings } from "../settings"

type CardCtx = {
  expanded: boolean
  toggle: () => void
  hasContent: boolean
}

const Ctx = createContext<CardCtx | null>(null)

function useCard(): CardCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("ToolCard.* must be used inside <ToolCard.Root>")
  return ctx
}

function findChild(children: ReactNode, type: unknown): ReactElement | null {
  for (const c of Children.toArray(children)) {
    if (isValidElement(c) && c.type === type) return c
  }
  return null
}

function Root({
  hasContent = true,
  status,
  children,
}: {
  hasContent?: boolean
  status?: "success" | "error"
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const { viewMode } = useSettings()
  const statusClass = status ? ` tool-card-${status}` : ""

  const trigger = findChild(children, Trigger)
  const preview = findChild(children, Preview)
  const content = findChild(children, Content)

  // Render-decision: which body (if any) shows below trigger?
  let body: ReactNode = null
  if (expanded) body = content ?? preview
  else if (viewMode === "normal") body = preview
  else body = null // compact + collapsed

  // Click changes rendering iff:
  // - content is present (collapsed → content, OR preview → content)
  // - or in compact mode preview is present (collapsed → preview)
  const clickable = hasContent && (content != null || (preview != null && viewMode === "compact"))

  return (
    <Ctx.Provider value={{ expanded, toggle: () => setExpanded((e) => !e), hasContent: clickable }}>
      <div className={`tool-card${statusClass}`}>
        {trigger}
        {body}
      </div>
    </Ctx.Provider>
  )
}

function Trigger({ children }: { children: ReactNode }) {
  const { toggle, hasContent } = useCard()
  return (
    <button
      className={`tool-row ${hasContent ? "clickable" : ""}`}
      onClick={() => hasContent && toggle()}
    >
      {children}
    </button>
  )
}

function Preview({ children }: { children: ReactNode }) {
  return <div className="tool-body tool-preview">{children}</div>
}

function Content({ children }: { children: ReactNode }) {
  return <div className="tool-body">{children}</div>
}

export const ToolCard = { Root, Trigger, Preview, Content }
```

Key points:

- `Root` no longer renders `Trigger`/`Content` via context-based rendering. It picks slots out of `children` and decides which to render itself.
- `Trigger` always renders. `Preview` and `Content` are now plain wrappers; the choice is made by `Root`.
- `hasContent` in the context is reused as the "clickable" flag for `Trigger`.

- [ ] **Step 2: Add Preview snippet CSS**

Append to `src/styles.css`:

```css
.tool-preview-line {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-preview-snippet {
  display: -webkit-box;
  -webkit-line-clamp: 6;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
}

.tool-preview-snippet.snippet-tall {
  -webkit-line-clamp: 10;
}

.tool-preview-snippet.snippet-error {
  -webkit-line-clamp: 12;
}
```

- [ ] **Step 3: Type-check + smoke run existing tests**

Run: `bun run tsc --noEmit && bun test`
Expected: tsc clean; existing tests still pass (tools still wrap their bodies in `<ToolCard.Content>` — they will continue to render in Compact-collapsed = nothing, Compact-expanded = full body. Normal-collapsed shows nothing because no `<Preview>` is declared yet — fine, we'll add them in Phase 2.)

- [ ] **Step 4: Commit**

```bash
git add src/transcript/ToolCard.tsx src/styles.css
git commit -m "feat(toolcard): Preview slot + view-mode-aware render rules"
```

---

## Phase 2 — Claude tool previews

For each tool below, the pattern is the same:

1. Add a `<ToolCard.Preview>...</ToolCard.Preview>` block before the existing `<ToolCard.Content>` (or replace `<Content>` entirely for "preview-is-content" tools).
2. Add a unit test that renders the tool with viewMode "normal" and asserts the preview text.

The Tool.test.tsx file exists once for all tools — created in Task 8.

### Task 8: Test scaffolding for `claude/Tool.tsx`

**Files:**

- Create: `src/transcript/claude/Tool.test.tsx`

- [ ] **Step 1: Create test file with rendering helper**

```tsx
// src/transcript/claude/Tool.test.tsx
import { describe, expect, test } from "bun:test"
import { render } from "@testing-library/react"
import { Tool } from "./Tool"
import { SettingsProvider, type Settings } from "../../settings"
import type { ToolUse, ToolResult } from "../../types"

function renderTool(use: ToolUse, output: ToolResult, settings: Partial<Settings> = {}) {
  return render(
    <SettingsProvider initial={{ renderMarkdown: true, viewMode: "normal", ...settings }}>
      <Tool use={use} output={output} />
    </SettingsProvider>,
  )
}

const okOutput: ToolResult = { text: "", images: [], toolRefs: [], isError: false }

describe("Claude tool previews — placeholder", () => {
  test("scaffolding loads", () => {
    expect(typeof renderTool).toBe("function")
  })
})
```

(If `@testing-library/react` is not yet a dep, install it: `bun add -d @testing-library/react @testing-library/dom`. Check existing `Markdown.test.tsx` / `TurnSeparator.test.tsx` for the pattern actually used in the project. If they use a different setup, adopt that — don't introduce a second test framework.)

- [ ] **Step 2: Run tests**

Run: `bun test src/transcript/claude/Tool.test.tsx`
Expected: PASS — 1 test (placeholder).

- [ ] **Step 3: Commit**

```bash
git add src/transcript/claude/Tool.test.tsx
git commit -m "test(claude): scaffolding for Tool preview tests"
```

---

### Task 9: Bash preview

**Files:**

- Modify: `src/transcript/claude/Tool.tsx` (the `Bash` component)
- Modify: `src/transcript/claude/Tool.test.tsx`

- [ ] **Step 1: Add failing tests**

Append to `src/transcript/claude/Tool.test.tsx`:

```tsx
describe("Bash preview", () => {
  test("renders last 3 lines as snippet in normal mode", () => {
    const { container } = renderTool({ name: "Bash", input: { command: "ls" } } as ToolUse, {
      ...okOutput,
      text: "1\n2\n3\n4\n5",
    })
    const snippet = container.querySelector(".tool-preview-snippet")
    expect(snippet?.textContent).toBe("3\n4\n5")
    expect(container.textContent).toContain("+2")
  })

  test("renders last 10 lines on error", () => {
    const text = Array.from({ length: 15 }, (_, i) => String(i + 1)).join("\n")
    const { container } = renderTool({ name: "Bash", input: { command: "fail" } } as ToolUse, {
      ...okOutput,
      text,
      isError: true,
    })
    const snippet = container.querySelector(".tool-preview-snippet")
    expect(snippet?.textContent).toBe("6\n7\n8\n9\n10\n11\n12\n13\n14\n15")
    expect(container.textContent).toContain("+5")
  })

  test("no MoreHint when output fits in window", () => {
    const { container } = renderTool({ name: "Bash", input: { command: "echo hi" } } as ToolUse, {
      ...okOutput,
      text: "hi",
    })
    expect(container.querySelector(".tool-more-hint")).toBeNull()
  })

  test("compact mode shows no preview", () => {
    const { container } = renderTool(
      { name: "Bash", input: { command: "ls" } } as ToolUse,
      { ...okOutput, text: "1\n2\n3" },
      { viewMode: "compact" },
    )
    expect(container.querySelector(".tool-preview-snippet")).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `bun test src/transcript/claude/Tool.test.tsx`
Expected: FAIL — preview not rendered.

- [ ] **Step 3: Modify `src/transcript/claude/Tool.tsx` — Bash component**

Add imports at top:

```tsx
import { tailLines } from "../preview"
import { MoreHint } from "../MoreHint"
```

Replace the `Bash` component body to add `<ToolCard.Preview>`:

```tsx
function Bash({ input, output }: CardProps<BashInput>) {
  const { command, description, timeout, run_in_background, dangerouslyDisableSandbox, ...rest } =
    input
  assertExhaustive(rest)
  const hasContent =
    !!command ||
    !!description ||
    timeout != null ||
    run_in_background != null ||
    dangerouslyDisableSandbox != null ||
    hasOutput(output)
  const tailN = output.isError ? 10 : 3
  const tail = output.text ? tailLines(output.text, tailN) : null
  const snippetClass = output.isError
    ? "tool-preview-snippet snippet-error"
    : "tool-preview-snippet"

  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="Bash" detail={command || "Done"} />
        </Header>
      </ToolCard.Trigger>
      {tail && (
        <ToolCard.Preview>
          <pre className={snippetClass}>{tail.text}</pre>
          <MoreHint count={tail.remaining} />
        </ToolCard.Preview>
      )}
      <ToolCard.Content>
        {command && <pre className="output cmd">{command}</pre>}
        {(description || timeout != null || run_in_background || dangerouslyDisableSandbox) && (
          <dl className="tool-fields">
            {description && <Field name="description" value={description} />}
            {timeout != null && <Field name="timeout" value={`${timeout}ms`} />}
            {run_in_background && <Field name="run_in_background" value="true" />}
            {dangerouslyDisableSandbox && <Field name="dangerouslyDisableSandbox" value="true" />}
          </dl>
        )}
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `bun test src/transcript/claude/Tool.test.tsx`
Expected: PASS — all 4 Bash cases.

- [ ] **Step 5: Commit**

```bash
git add src/transcript/claude/Tool.tsx src/transcript/claude/Tool.test.tsx
git commit -m "feat(claude): Bash preview — 3-line tail, 10 on error"
```

---

### Task 10: Read preview

**Files:**

- Modify: `src/transcript/claude/Tool.tsx` (the `Read` component)
- Modify: `src/transcript/claude/Tool.test.tsx`

- [ ] **Step 1: Add failing tests**

```tsx
describe("Read preview", () => {
  test("counts lines from output text", () => {
    const { container } = renderTool({ name: "Read", input: { file_path: "/x.ts" } } as ToolUse, {
      ...okOutput,
      text: "a\nb\nc",
    })
    expect(container.querySelector(".tool-preview")?.textContent).toBe("Read 3 lines")
  })

  test("trailing newline does not inflate count", () => {
    const { container } = renderTool({ name: "Read", input: { file_path: "/x.ts" } } as ToolUse, {
      ...okOutput,
      text: "a\nb\n",
    })
    expect(container.querySelector(".tool-preview")?.textContent).toBe("Read 2 lines")
  })

  test("singular line", () => {
    const { container } = renderTool({ name: "Read", input: { file_path: "/x.ts" } } as ToolUse, {
      ...okOutput,
      text: "a",
    })
    expect(container.querySelector(".tool-preview")?.textContent).toBe("Read 1 line")
  })

  test("empty output", () => {
    const { container } = renderTool(
      { name: "Read", input: { file_path: "/x.ts" } } as ToolUse,
      okOutput,
    )
    expect(container.querySelector(".tool-preview")?.textContent).toBe("(no output)")
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `bun test src/transcript/claude/Tool.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Modify Read component**

```tsx
function readSummary(text: string): string {
  if (!text) return "(no output)"
  const trimmed = text.endsWith("\n") ? text.slice(0, -1) : text
  const n = trimmed.split("\n").length
  return `Read ${n} ${n === 1 ? "line" : "lines"}`
}

function Read({ input, output }: CardProps<ReadInput>) {
  const { file_path, offset, limit, pages, ...rest } = input
  assertExhaustive(rest)
  const hasContent = offset != null || limit != null || !!pages || hasOutput(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="Read" detail={file_path && shortPath(file_path)} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Preview>
        <div className="tool-preview-line">{readSummary(output.text)}</div>
      </ToolCard.Preview>
      <ToolCard.Content>
        {(offset != null || limit != null || pages) && (
          <dl className="tool-fields">
            {offset != null && <Field name="offset" value={offset} />}
            {limit != null && <Field name="limit" value={limit} />}
            {pages && <Field name="pages" value={pages} />}
          </dl>
        )}
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `bun test src/transcript/claude/Tool.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/transcript/claude/Tool.tsx src/transcript/claude/Tool.test.tsx
git commit -m "feat(claude): Read preview — line-count summary"
```

---

### Task 11: Edit / MultiEdit / NotebookEdit / ExitPlanMode — Preview-only tools

**Files:**

- Modify: `src/transcript/claude/Tool.tsx` (Edit, MultiEdit, NotebookEdit, ExitPlanMode)
- Modify: `src/transcript/claude/Tool.test.tsx`

- [ ] **Step 1: Add failing tests**

```tsx
describe("Preview-is-content tools", () => {
  test("Edit shows the diff inline in normal mode (no Content slot)", () => {
    const { container } = renderTool(
      {
        name: "Edit",
        input: { file_path: "/foo.ts", old_string: "a", new_string: "b" },
      } as ToolUse,
      okOutput,
    )
    expect(container.querySelector(".tool-preview")).not.toBeNull()
    // diff renderer should be present inside preview
    expect(container.querySelector(".tool-preview")?.children.length).toBeGreaterThan(0)
  })

  test("ExitPlanMode renders plan markdown in preview", () => {
    const { container } = renderTool(
      { name: "ExitPlanMode", input: { plan: "# Title\n\nbody" } } as ToolUse,
      okOutput,
    )
    expect(container.querySelector(".tool-preview")?.textContent).toContain("Title")
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `bun test src/transcript/claude/Tool.test.tsx`
Expected: FAIL — preview elements not present yet (today they live in `<Content>`).

- [ ] **Step 3: Restructure components**

For each of Edit, MultiEdit, NotebookEdit, ExitPlanMode in `claude/Tool.tsx`:

- Replace `<ToolCard.Content>...</ToolCard.Content>` with `<ToolCard.Preview>...</ToolCard.Preview>` containing the same body content (diff / source / plan markdown).
- Drop the trailing `<Output>` and `<Extras>` (they're rarely populated for these tools, and `Content` is gone — so they wouldn't render anyway). Verify against fixtures during agent-browser checks; if any of these tools have meaningful `output.text`, restore `Content` for that tool only.

Example (`Edit`):

```tsx
function Edit({ input, output }: CardProps<EditInput>) {
  const { file_path, old_string, new_string, replace_all, ...rest } = input
  assertExhaustive(rest)
  const hasDiff = !!old_string || !!new_string
  const hasContent = hasDiff || replace_all || hasOutput(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="Edit" detail={file_path && shortPath(file_path)} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Preview>
        {hasDiff && <EditDiff filePath={file_path} oldString={old_string} newString={new_string} />}
        {replace_all && (
          <dl className="tool-fields">
            <Field name="replace_all" value="true" />
          </dl>
        )}
      </ToolCard.Preview>
    </ToolCard.Root>
  )
}
```

Apply the equivalent change to MultiEdit, NotebookEdit, ExitPlanMode.

- [ ] **Step 4: Run tests to verify pass**

Run: `bun test src/transcript/claude/Tool.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/transcript/claude/Tool.tsx src/transcript/claude/Tool.test.tsx
git commit -m "feat(claude): Edit/MultiEdit/NotebookEdit/ExitPlanMode use Preview slot"
```

---

### Task 12: Write preview

**Files:**

- Modify: `src/transcript/claude/Tool.tsx` (Write component)
- Modify: `src/transcript/claude/Tool.test.tsx`

- [ ] **Step 1: Add failing test**

```tsx
describe("Write preview", () => {
  test("shows first 10 lines + MoreHint when content has more", () => {
    const lines = Array.from({ length: 15 }, (_, i) => `line ${i + 1}`).join("\n")
    const { container } = renderTool(
      { name: "Write", input: { file_path: "/foo.ts", content: lines } } as ToolUse,
      okOutput,
    )
    const snippet = container.querySelector(".tool-preview-snippet")
    expect(snippet?.textContent).toContain("line 1")
    expect(snippet?.textContent).toContain("line 10")
    expect(snippet?.textContent).not.toContain("line 11")
    expect(container.textContent).toContain("+5")
  })

  test("no MoreHint when content fits", () => {
    const { container } = renderTool(
      { name: "Write", input: { file_path: "/foo.ts", content: "a\nb" } } as ToolUse,
      okOutput,
    )
    expect(container.querySelector(".tool-more-hint")).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `bun test src/transcript/claude/Tool.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Modify Write component**

```tsx
import { headLines } from "../preview" // ensure import exists

function Write({ input, output }: CardProps<WriteInput>) {
  const { file_path, content, ...rest } = input
  assertExhaustive(rest)
  const hasContent = !!content || hasOutput(output)
  const head = content ? headLines(content, 10) : null
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="Write" detail={file_path && shortPath(file_path)} />
        </Header>
      </ToolCard.Trigger>
      {head && (
        <ToolCard.Preview>
          <pre className="tool-preview-snippet snippet-tall">{head.text}</pre>
          <MoreHint count={head.remaining} />
        </ToolCard.Preview>
      )}
      <ToolCard.Content>
        {content && <pre className="output">{content}</pre>}
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}
```

- [ ] **Step 4: Run tests + commit**

Run: `bun test src/transcript/claude/Tool.test.tsx`
Expected: PASS.

```bash
git add src/transcript/claude/Tool.tsx src/transcript/claude/Tool.test.tsx
git commit -m "feat(claude): Write preview — first 10 lines"
```

---

### Task 13: Glob, Grep, ToolSearch, WebFetch, WebSearch — one-line summary tools

**Files:**

- Modify: `src/transcript/claude/Tool.tsx`
- Modify: `src/transcript/claude/Tool.test.tsx`

- [ ] **Step 1: Add failing tests for all five**

```tsx
describe("One-line summary previews", () => {
  test("Glob shows file count", () => {
    const { container } = renderTool({ name: "Glob", input: { pattern: "*.ts" } } as ToolUse, {
      ...okOutput,
      text: "/a.ts\n/b.ts\n/c.ts",
    })
    expect(container.querySelector(".tool-preview-line")?.textContent).toBe("Found 3 files")
  })

  test("Grep counts matches", () => {
    const { container } = renderTool({ name: "Grep", input: { pattern: "foo" } } as ToolUse, {
      ...okOutput,
      text: "match1\nmatch2",
    })
    expect(container.querySelector(".tool-preview-line")?.textContent).toBe("Found 2 matches")
  })

  test("Grep with files_with_matches mode says 'files'", () => {
    const { container } = renderTool(
      { name: "Grep", input: { pattern: "foo", output_mode: "files_with_matches" } } as ToolUse,
      { ...okOutput, text: "/a.ts\n/b.ts" },
    )
    expect(container.querySelector(".tool-preview-line")?.textContent).toBe("Found 2 files")
  })

  test("ToolSearch reports loaded count", () => {
    const { container } = renderTool({ name: "ToolSearch", input: { query: "x" } } as ToolUse, {
      ...okOutput,
      toolRefs: ["Read", "Edit"],
    })
    expect(container.querySelector(".tool-preview-line")?.textContent).toBe("Loaded 2 tools")
  })

  test("ToolSearch zero loaded", () => {
    const { container } = renderTool(
      { name: "ToolSearch", input: { query: "x" } } as ToolUse,
      okOutput,
    )
    expect(container.querySelector(".tool-preview-line")?.textContent).toBe("No tools loaded")
  })

  test("WebFetch shows first non-empty line", () => {
    const { container } = renderTool(
      { name: "WebFetch", input: { url: "https://x", prompt: "summarize" } } as ToolUse,
      { ...okOutput, text: "\nFirst content line\nrest..." },
    )
    expect(container.querySelector(".tool-preview-line")?.textContent).toBe("First content line")
  })

  test("WebFetch fallback when output empty", () => {
    const { container } = renderTool(
      { name: "WebFetch", input: { url: "https://x", prompt: "y" } } as ToolUse,
      okOutput,
    )
    expect(container.querySelector(".tool-preview-line")?.textContent).toBe("Fetched")
  })

  test("WebSearch counts markdown links", () => {
    const { container } = renderTool({ name: "WebSearch", input: { query: "x" } } as ToolUse, {
      ...okOutput,
      text: "Some [first](http://a) [second](http://b) result",
    })
    expect(container.querySelector(".tool-preview-line")?.textContent).toBe("2 results")
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `bun test src/transcript/claude/Tool.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Modify the 5 components**

Add a small helper near the top of the file (after imports):

```tsx
function nonEmptyLines(text: string): string[] {
  if (!text) return []
  return text.split("\n").filter((l) => l.trim().length > 0)
}
function firstNonEmptyLine(text: string): string | null {
  for (const l of text.split("\n")) {
    if (l.trim().length > 0) return l.trim()
  }
  return null
}
function countMarkdownLinks(text: string): number {
  return (text.match(/\[[^\]]+\]\([^)]+\)/g) || []).length
}
```

Then add `<ToolCard.Preview>` to each:

**Glob:** preview = `<div className="tool-preview-line">Found {nonEmptyLines(output.text).length} {n === 1 ? "file" : "files"}</div>`

**Grep:** preview computes `n` from non-empty lines; label = "files" when `output_mode === "files_with_matches"`, else "matches".

**ToolSearch:** preview = `Loaded N tools` from `output.toolRefs.length`; if zero → `No tools loaded`.

**WebFetch:** preview = `firstNonEmptyLine(output.text) ?? "Fetched"`.

**WebSearch:** preview = `${countMarkdownLinks(output.text)} results` (fall back to `firstNonEmptyLine` if zero).

Each preview block is just:

```tsx
<ToolCard.Preview>
  <div className="tool-preview-line">{summary}</div>
</ToolCard.Preview>
```

- [ ] **Step 4: Run tests to verify pass**

Run: `bun test src/transcript/claude/Tool.test.tsx`
Expected: PASS — all 8 cases.

- [ ] **Step 5: Commit**

```bash
git add src/transcript/claude/Tool.tsx src/transcript/claude/Tool.test.tsx
git commit -m "feat(claude): one-line summary previews for Glob/Grep/ToolSearch/WebFetch/WebSearch"
```

---

### Task 14: Task / Agent preview

**Files:**

- Modify: `src/transcript/claude/Tool.tsx` (Agent component)
- Modify: `src/transcript/claude/Tool.test.tsx`

- [ ] **Step 1: Add failing test**

```tsx
describe("Agent preview", () => {
  test("shows first 3 lines of output + MoreHint", () => {
    const text = "result line 1\nresult line 2\nresult line 3\nresult line 4"
    const { container } = renderTool(
      { name: "Agent", input: { description: "Search docs", prompt: "..." } } as ToolUse,
      { ...okOutput, text },
    )
    const snippet = container.querySelector(".tool-preview-snippet")
    expect(snippet?.textContent).toBe("result line 1\nresult line 2\nresult line 3")
    expect(container.textContent).toContain("+1")
  })
})
```

- [ ] **Step 2: Run + verify failure**

Run: `bun test src/transcript/claude/Tool.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Modify Agent component**

```tsx
function Agent({ input, output, name }: CardProps<AgentInput> & { name: "Task" | "Agent" }) {
  const {
    description,
    prompt,
    subagent_type,
    model,
    mode,
    team_name,
    name: agentName,
    isolation,
    run_in_background,
    ...rest
  } = input
  assertExhaustive(rest)
  const opts: Array<[string, ReactNode]> = []
  if (subagent_type) opts.push(["subagent_type", subagent_type])
  if (model) opts.push(["model", model])
  if (mode) opts.push(["mode", mode])
  if (team_name) opts.push(["team_name", team_name])
  if (agentName) opts.push(["name", agentName])
  if (isolation) opts.push(["isolation", isolation])
  if (run_in_background) opts.push(["run_in_background", "true"])
  const hasContent = !!prompt || opts.length > 0 || hasOutput(output)
  const head = output.text ? headLines(output.text, 3) : null

  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name={name} detail={description && shortPath(description)} />
        </Header>
      </ToolCard.Trigger>
      {head && (
        <ToolCard.Preview>
          <pre className="tool-preview-snippet">{head.text}</pre>
          <MoreHint count={head.remaining} />
        </ToolCard.Preview>
      )}
      <ToolCard.Content>
        {prompt && <Markdown source={prompt} />}
        {opts.length > 0 && (
          <dl className="tool-fields">
            {opts.map(([k, v]) => (
              <Field key={k} name={k} value={v} />
            ))}
          </dl>
        )}
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}
```

- [ ] **Step 4: Run + commit**

Run: `bun test src/transcript/claude/Tool.test.tsx`
Expected: PASS.

```bash
git add src/transcript/claude/Tool.tsx src/transcript/claude/Tool.test.tsx
git commit -m "feat(claude): Agent preview — first 3 lines of output"
```

---

### Task 15: TodoWrite preview

**Files:**

- Modify: `src/transcript/claude/Tool.tsx` (TodoWrite component)
- Modify: `src/transcript/claude/Tool.test.tsx`

- [ ] **Step 1: Add failing tests**

```tsx
describe("TodoWrite preview", () => {
  test("header detail = activeForm of in-progress; body = M/N complete", () => {
    const { container } = renderTool(
      {
        name: "TodoWrite",
        input: {
          todos: [
            { content: "Do A", activeForm: "Doing A", status: "completed" },
            { content: "Do B", activeForm: "Doing B", status: "in_progress" },
            { content: "Do C", activeForm: "Doing C", status: "pending" },
          ],
        },
      } as ToolUse,
      okOutput,
    )
    expect(container.textContent).toContain("(Doing B)")
    expect(container.querySelector(".tool-preview-line")?.textContent).toBe("1 / 3 complete")
  })

  test("no in-progress todo → no parens in header", () => {
    const { container } = renderTool(
      {
        name: "TodoWrite",
        input: {
          todos: [
            { content: "Do A", activeForm: "Doing A", status: "completed" },
            { content: "Do B", activeForm: "Doing B", status: "pending" },
          ],
        },
      } as ToolUse,
      okOutput,
    )
    expect(container.textContent).not.toContain("(Doing")
    expect(container.querySelector(".tool-preview-line")?.textContent).toBe("1 / 2 complete")
  })

  test("all complete shows N / N complete", () => {
    const { container } = renderTool(
      {
        name: "TodoWrite",
        input: {
          todos: [
            { content: "A", activeForm: "Aing", status: "completed" },
            { content: "B", activeForm: "Bing", status: "completed" },
          ],
        },
      } as ToolUse,
      okOutput,
    )
    expect(container.querySelector(".tool-preview-line")?.textContent).toBe("2 / 2 complete")
  })
})
```

- [ ] **Step 2: Run + verify failure**

- [ ] **Step 3: Modify TodoWrite component**

```tsx
function TodoWrite({ input, output }: CardProps<TodoWriteInput>) {
  const { todos, ...rest } = input
  assertExhaustive(rest)
  const total = todos.length
  const done = todos.filter((t) => t.status === "completed").length
  const inProgress = todos.find((t) => t.status === "in_progress")
  return (
    <ToolCard.Root
      hasContent={todos.length > 0 || hasOutput(output)}
      status={output.isError ? "error" : "success"}
    >
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="TodoWrite" detail={inProgress?.activeForm} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Preview>
        <div className="tool-preview-line">
          {done} / {total} complete
        </div>
      </ToolCard.Preview>
      <ToolCard.Content>
        <ul className="todo-list">
          {todos.map((t, i) => {
            const { content, status, activeForm, ...todoRest } = t
            assertExhaustive(todoRest)
            return (
              <li key={i} className={`todo todo-${status}`}>
                <span className="todo-status">{status}</span>
                <span>
                  <Markdown source={status === "in_progress" ? activeForm : content} inline />
                </span>
              </li>
            )
          })}
        </ul>
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}
```

- [ ] **Step 4: Run + commit**

```bash
bun test src/transcript/claude/Tool.test.tsx
git add src/transcript/claude/Tool.tsx src/transcript/claude/Tool.test.tsx
git commit -m "feat(claude): TodoWrite preview — activeForm + M/N complete"
```

---

### Task 16: Skill preview

**Files:**

- Modify: `src/transcript/claude/Tool.tsx` (Skill component)
- Modify: `src/transcript/claude/Tool.test.tsx`

- [ ] **Step 1: Add failing test**

```tsx
describe("Skill preview", () => {
  test("shows description from injectedText frontmatter", () => {
    const injected = `---
name: brainstorming
description: Help turn ideas into designs through dialogue
---
body`
    const { container } = renderTool(
      { name: "Skill", input: { skill: "brainstorming" } } as ToolUse,
      { ...okOutput, injectedText: injected },
    )
    expect(container.querySelector(".tool-preview-line")?.textContent).toBe(
      "Help turn ideas into designs through dialogue",
    )
  })

  test("no preview when injectedText missing", () => {
    const { container } = renderTool({ name: "Skill", input: { skill: "x" } } as ToolUse, okOutput)
    // no preview line; trigger only
    expect(container.querySelector(".tool-preview")).toBeNull()
  })
})
```

- [ ] **Step 2: Run + verify failure**

- [ ] **Step 3: Modify Skill component**

```tsx
import { parseFrontmatter } from "../preview" // ensure import

function Skill({ input, output }: CardProps<SkillInput>) {
  const { skill, args, ...rest } = input
  assertExhaustive(rest)
  const fm = output.injectedText ? parseFrontmatter(output.injectedText) : undefined
  const description = fm?.description
  const hasContent = !!args || !!output.injectedText || hasOutput(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="Skill" detail={skill && shortPath(skill)} />
        </Header>
      </ToolCard.Trigger>
      {description && (
        <ToolCard.Preview>
          <div className="tool-preview-line">{description}</div>
        </ToolCard.Preview>
      )}
      <ToolCard.Content>
        {args && (
          <dl className="tool-fields">
            <Field name="args" value={args} />
          </dl>
        )}
        {output.injectedText && <pre className="output">{output.injectedText}</pre>}
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}
```

- [ ] **Step 4: Run + commit**

```bash
bun test src/transcript/claude/Tool.test.tsx
git add src/transcript/claude/Tool.tsx src/transcript/claude/Tool.test.tsx
git commit -m "feat(claude): Skill preview — description from frontmatter"
```

---

### Task 17: UnknownTool preview

**Files:**

- Modify: `src/transcript/UnknownTool.tsx`
- Modify: `src/transcript/claude/Tool.test.tsx`

- [ ] **Step 1: Add failing test**

```tsx
describe("UnknownTool preview", () => {
  test("shows first 3 lines of output + MoreHint", () => {
    const { container } = renderTool({ name: "mcp__custom__do_thing", input: {} } as ToolUse, {
      ...okOutput,
      text: "a\nb\nc\nd\ne",
    })
    const snippet = container.querySelector(".tool-preview-snippet")
    expect(snippet?.textContent).toBe("a\nb\nc")
    expect(container.textContent).toContain("+2")
  })
})
```

- [ ] **Step 2: Run + verify failure**

- [ ] **Step 3: Modify UnknownTool**

```tsx
// src/transcript/UnknownTool.tsx — read it first; this is the structure to add to.
import { ToolCard } from "./ToolCard"
import { Header, Output, Extras, ToolTitle, hasOutput } from "./shared"
import { headLines } from "./preview"
import { MoreHint } from "./MoreHint"
import type { ToolResult } from "../types"

export function UnknownTool({
  name,
  input,
  output,
}: {
  name: string
  input: unknown
  output: ToolResult
}) {
  const head = output.text ? headLines(output.text, 3) : null
  return (
    <ToolCard.Root hasContent={hasOutput(output)} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name={name} />
        </Header>
      </ToolCard.Trigger>
      {head && (
        <ToolCard.Preview>
          <pre className="tool-preview-snippet">{head.text}</pre>
          <MoreHint count={head.remaining} />
        </ToolCard.Preview>
      )}
      <ToolCard.Content>
        <pre className="output">{JSON.stringify(input, null, 2)}</pre>
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}
```

(Adapt to actual existing UnknownTool structure — preserve existing input rendering style.)

- [ ] **Step 4: Run + commit**

```bash
bun test src/transcript/claude/Tool.test.tsx
git add src/transcript/UnknownTool.tsx src/transcript/claude/Tool.test.tsx
git commit -m "feat(unknown): preview — first 3 lines of output"
```

---

## Phase 3 — Codex tool previews

### Task 18: Test scaffolding for Codex tools

**Files:**

- Create: `src/transcript/codex/Tool.test.tsx`

- [ ] **Step 1: Create file with rendering helpers**

```tsx
import { describe, expect, test } from "bun:test"
import { render } from "@testing-library/react"
import { CodexFunctionCall, CodexCustomToolCall } from "./Tool"
import { SettingsProvider, type Settings } from "../../settings"
import type { ToolResult } from "../../types"

function renderFn(
  name: string,
  args: unknown,
  output: ToolResult,
  settings: Partial<Settings> = {},
) {
  return render(
    <SettingsProvider initial={{ renderMarkdown: true, viewMode: "normal", ...settings }}>
      <CodexFunctionCall name={name} argumentsJson={JSON.stringify(args)} output={output} />
    </SettingsProvider>,
  )
}

const okOutput: ToolResult = { text: "", images: [], toolRefs: [], isError: false }

describe("Codex tool previews — placeholder", () => {
  test("scaffolding loads", () => {
    expect(typeof renderFn).toBe("function")
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
bun test src/transcript/codex/Tool.test.tsx
git add src/transcript/codex/Tool.test.tsx
git commit -m "test(codex): scaffolding for Tool preview tests"
```

---

### Task 19: Codex shell-family previews

**Files:**

- Modify: `src/transcript/codex/Tool.tsx` (ShellCommand, ExecCommand, Shell)
- Modify: `src/transcript/codex/Tool.test.tsx`

- [ ] **Step 1: Add failing tests**

```tsx
describe("Codex shell-family preview", () => {
  test("shell_command shows last 3 lines tail", () => {
    const { container } = renderFn(
      "shell_command",
      { command: "ls" },
      { ...okOutput, text: "1\n2\n3\n4\n5" },
    )
    const snippet = container.querySelector(".tool-preview-snippet")
    expect(snippet?.textContent).toBe("3\n4\n5")
    expect(container.textContent).toContain("+2")
  })

  test("exec_command on error shows last 10", () => {
    const text = Array.from({ length: 12 }, (_, i) => String(i + 1)).join("\n")
    const { container } = renderFn(
      "exec_command",
      { cmd: "fail" },
      { ...okOutput, text, isError: true },
    )
    expect(container.querySelector(".tool-preview-snippet")?.textContent).toBe(
      "3\n4\n5\n6\n7\n8\n9\n10\n11\n12",
    )
  })

  test("shell joins string[] command for header detail", () => {
    const { container } = renderFn("shell", { command: ["ls", "-la"] }, { ...okOutput, text: "x" })
    expect(container.textContent).toContain("ls -la")
  })
})
```

- [ ] **Step 2: Run + verify failure**

- [ ] **Step 3: Modify the three shell components**

For each (ShellCommand, ExecCommand, Shell):

- Add `import { tailLines } from "../preview"` and `import { MoreHint } from "../MoreHint"` at top of file.
- Compute `tailN = output.isError ? 10 : 3` and `tail = output.text ? tailLines(output.text, tailN) : null`.
- Insert before existing `<ToolCard.Content>`:

```tsx
{
  tail && (
    <ToolCard.Preview>
      <pre
        className={output.isError ? "tool-preview-snippet snippet-error" : "tool-preview-snippet"}
      >
        {tail.text}
      </pre>
      <MoreHint count={tail.remaining} />
    </ToolCard.Preview>
  )
}
```

- [ ] **Step 4: Run + commit**

```bash
bun test src/transcript/codex/Tool.test.tsx
git add src/transcript/codex/Tool.tsx src/transcript/codex/Tool.test.tsx
git commit -m "feat(codex): shell-family previews — 3-line tail (10 on error)"
```

---

### Task 20: `apply_patch` and `view_image` — Preview-only

**Files:**

- Modify: `src/transcript/codex/Tool.tsx` (`view_image`)
- Modify: `src/transcript/codex/ApplyPatch.tsx`
- Modify: `src/transcript/codex/Tool.test.tsx`

- [ ] **Step 1: Add failing test**

```tsx
describe("Codex preview-is-content tools", () => {
  test("view_image uses Preview slot (image renders inline)", () => {
    const { container } = renderFn("view_image", { path: "/foo.png" }, okOutput)
    expect(container.querySelector(".tool-preview")).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run + verify failure**

- [ ] **Step 3: Modify `view_image`**

In codex/Tool.tsx, change `<ToolCard.Content>...</ToolCard.Content>` to `<ToolCard.Preview>...</ToolCard.Preview>` for `ViewImage`.

- [ ] **Step 4: Modify `ApplyPatch`**

In `codex/ApplyPatch.tsx`, change the Content slot wrapping the patch render to `<ToolCard.Preview>`.

- [ ] **Step 5: Run + commit**

```bash
bun test src/transcript/codex/Tool.test.tsx
git add src/transcript/codex/Tool.tsx src/transcript/codex/ApplyPatch.tsx src/transcript/codex/Tool.test.tsx
git commit -m "feat(codex): apply_patch and view_image use Preview slot"
```

---

### Task 21: `update_plan` preview

**Files:**

- Modify: `src/transcript/codex/Tool.tsx` (UpdatePlan)
- Modify: `src/transcript/codex/Tool.test.tsx`

- [ ] **Step 1: Add failing tests**

```tsx
describe("update_plan preview", () => {
  test("M / N complete with explanation in header detail", () => {
    const { container } = renderFn(
      "update_plan",
      {
        explanation: "Refactoring auth",
        plan: [
          { step: "Read files", status: "completed" },
          { step: "Update fn", status: "in_progress" },
          { step: "Run tests", status: "pending" },
        ],
      },
      okOutput,
    )
    expect(container.textContent).toContain("Refactoring auth")
    expect(container.querySelector(".tool-preview-line")?.textContent).toBe("1 / 3 complete")
  })
})
```

- [ ] **Step 2: Run + verify failure**

- [ ] **Step 3: Modify UpdatePlan**

```tsx
function UpdatePlan({ input, output }: { input: UpdatePlanInput; output: ToolResult }) {
  const { explanation, plan } = input
  const total = plan?.length ?? 0
  const done = plan?.filter((p) => p.status === "completed").length ?? 0
  const hasContent = !!explanation || total > 0 || hasOutput(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="update_plan" detail={explanation} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Preview>
        <div className="tool-preview-line">
          {done} / {total} complete
        </div>
      </ToolCard.Preview>
      <ToolCard.Content>
        {plan && plan.length > 0 && (
          <ul className="todo-list">
            {plan.map((p, i) => (
              <li key={i} className={`todo todo-${p.status}`}>
                <span className="todo-status">{p.status}</span>
                <span>{p.step}</span>
              </li>
            ))}
          </ul>
        )}
        <Output output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}
```

- [ ] **Step 4: Run + commit**

```bash
bun test src/transcript/codex/Tool.test.tsx
git add src/transcript/codex/Tool.tsx src/transcript/codex/Tool.test.tsx
git commit -m "feat(codex): update_plan preview — M/N complete"
```

---

### Task 22: `spawn_agent` preview

**Files:**

- Modify: `src/transcript/codex/Tool.tsx` (SpawnAgent)
- Modify: `src/transcript/codex/Tool.test.tsx`

- [ ] **Step 1: Add failing tests**

```tsx
describe("spawn_agent preview", () => {
  test("nickname · message line", () => {
    const { container } = renderFn(
      "spawn_agent",
      { agent_type: "explorer", message: "Inspect commit b29189..." },
      { ...okOutput, text: '{"agent_id":"019d","nickname":"Bacon"}' },
    )
    expect(container.querySelector(".tool-preview-line")?.textContent).toBe(
      "Bacon · Inspect commit b29189...",
    )
  })

  test("falls back to nickname only when message missing", () => {
    const { container } = renderFn(
      "spawn_agent",
      { agent_type: "worker" },
      { ...okOutput, text: '{"agent_id":"019d","nickname":"Faraday"}' },
    )
    expect(container.querySelector(".tool-preview-line")?.textContent).toBe("Faraday")
  })
})
```

- [ ] **Step 2: Run + verify failure**

- [ ] **Step 3: Modify SpawnAgent**

Add a `<ToolCard.Preview>` block. Use the existing `tryParseAgentSpawnOutput(output.text)` helper to get nickname:

```tsx
const meta = tryParseAgentSpawnOutput(output.text)
const previewLine =
  meta.nickname && message ? `${meta.nickname} · ${message}` : meta.nickname || null

// In JSX, before <ToolCard.Content>:
{
  previewLine && (
    <ToolCard.Preview>
      <div className="tool-preview-line">{previewLine}</div>
    </ToolCard.Preview>
  )
}
```

- [ ] **Step 4: Run + commit**

```bash
bun test src/transcript/codex/Tool.test.tsx
git add src/transcript/codex/Tool.tsx src/transcript/codex/Tool.test.tsx
git commit -m "feat(codex): spawn_agent preview — nickname · message"
```

---

### Task 23: Nickname-resolution pre-pass

**Files:**

- Modify: `src/transcript/codex/CodexTranscript.tsx`
- Modify: `src/transcript/codex/Tool.tsx` — `CodexFunctionCall` accepts an optional `agentNicknames: Map<string, string>` prop and threads it to `WaitAgent`
- Create: `src/transcript/codex/CodexTranscript.test.tsx`

- [ ] **Step 1: Add failing test**

```tsx
// src/transcript/codex/CodexTranscript.test.tsx
import { describe, expect, test } from "bun:test"
import { render } from "@testing-library/react"
import { CodexTranscript } from "./CodexTranscript"
import { SettingsProvider } from "../../settings"
import type { CodexEntry } from "./types"

describe("nickname resolution", () => {
  test("WaitAgent header uses nickname from earlier spawn_agent output", () => {
    const entries: CodexEntry[] = [
      // spawn_agent function_call
      {
        type: "response_item",
        payload: {
          type: "function_call",
          name: "spawn_agent",
          arguments: JSON.stringify({ agent_type: "worker", message: "x" }),
          call_id: "c1",
        },
      },
      // its output
      {
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "c1",
          output: '{"agent_id":"019d","nickname":"Bacon"}',
        },
      },
      // wait_agent
      {
        type: "response_item",
        payload: {
          type: "function_call",
          name: "wait_agent",
          arguments: JSON.stringify({ targets: ["019d"], timeout_ms: 60000 }),
          call_id: "c2",
        },
      },
      {
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "c2",
          output: '"aborted by user after 5s"',
        },
      },
    ]
    const { container } = render(
      <SettingsProvider initial={{ renderMarkdown: true, viewMode: "normal" }}>
        <CodexTranscript entries={entries} />
      </SettingsProvider>,
    )
    expect(container.textContent).toContain("Bacon")
    // Should NOT show the bare UUID in the wait_agent header
    expect(container.querySelectorAll("button.tool-row")[1]?.textContent).toContain("Bacon")
  })
})
```

- [ ] **Step 2: Run + verify failure**

- [ ] **Step 3: Add the pre-pass to `CodexTranscript.tsx`**

```tsx
// In CodexTranscript.tsx, alongside the existing call_id → output map:

import { tryParseAgentSpawnOutput } from "./Tool" // export it

// Inside the component, after the outputs map is built:
const agentNicknames = new Map<string, string>()
for (const e of entries) {
  if (e.type !== "response_item") continue
  const p = e.payload
  if (p.type === "function_call" && p.name === "spawn_agent") {
    const out = outputs.get(p.call_id)
    if (out?.text) {
      const meta = tryParseAgentSpawnOutput(out.text)
      if (meta.agentId && meta.nickname) {
        agentNicknames.set(meta.agentId, meta.nickname)
      }
    }
  }
}

// Then pass agentNicknames to CodexFunctionCall:
// <CodexFunctionCall ... agentNicknames={agentNicknames} />
```

- [ ] **Step 4: Update `CodexFunctionCall` and `WaitAgent`**

Add an optional prop `agentNicknames?: Map<string, string>` to `CodexFunctionCall` in `codex/Tool.tsx`. Forward it to `WaitAgent` only.

In `WaitAgent`, use the map to resolve `targets[]` to nicknames for the header. Fallback: short ID (first 8 chars).

```tsx
function WaitAgent({ input, output, agentNicknames }:
  { input: WaitAgentInput; output: ToolResult; agentNicknames?: Map<string, string> }) {
  const { targets, timeout_ms } = input
  const labels = (targets ?? []).map((id) => agentNicknames?.get(id) ?? id.slice(0, 8))
  const detail = labels.join(", ")
  // ... existing fields/UI plus the new preview to be added in Task 24
  return (/* render with detail */)
}
```

Also export `tryParseAgentSpawnOutput` so the transcript pre-pass can import it.

- [ ] **Step 5: Run + commit**

```bash
bun test src/transcript/codex/
git add src/transcript/codex/CodexTranscript.tsx src/transcript/codex/Tool.tsx src/transcript/codex/CodexTranscript.test.tsx
git commit -m "feat(codex): nickname-resolution pre-pass for wait_agent"
```

---

### Task 24: `wait_agent` preview

**Files:**

- Modify: `src/transcript/codex/Tool.tsx` (WaitAgent)
- Modify: `src/transcript/codex/Tool.test.tsx`

- [ ] **Step 1: Add failing tests for all four output cases**

```tsx
describe("wait_agent preview", () => {
  test("string output (abort) shown as one line", () => {
    const { container } = renderFn(
      "wait_agent",
      { targets: ["019d"], timeout_ms: 60000 },
      { ...okOutput, text: '"aborted by user after 274.4s"' },
    )
    expect(container.querySelector(".tool-preview-line")?.textContent).toContain("aborted by user")
  })

  test("empty status + timed_out → 'Timed out after Ns'", () => {
    const { container } = renderFn(
      "wait_agent",
      { targets: ["019d"], timeout_ms: 600000 },
      { ...okOutput, text: '{"status":{},"timed_out":true}' },
    )
    expect(container.querySelector(".tool-preview-line")?.textContent).toBe("Timed out after 600s")
  })

  test("empty status + not timed out → '(no agent results)'", () => {
    const { container } = renderFn(
      "wait_agent",
      { targets: ["019d"], timeout_ms: 60000 },
      { ...okOutput, text: '{"status":{},"timed_out":false}' },
    )
    expect(container.querySelector(".tool-preview-line")?.textContent).toBe("(no agent results)")
  })

  test("populated status renders one row per agent", () => {
    const out = JSON.stringify({
      status: {
        "019d-A": { Completed: { message: "Refactor done" } },
        "019d-B": { Errored: { error: "test failed: x.test.ts:42" } },
      },
      timed_out: false,
    })
    const { container } = renderFn(
      "wait_agent",
      { targets: ["019d-A", "019d-B"], timeout_ms: 60000 },
      { ...okOutput, text: out },
    )
    const rows = container.querySelectorAll(".tool-preview-line")
    expect(rows.length).toBe(2)
    expect(rows[0].textContent).toContain("Completed")
    expect(rows[1].textContent).toContain("Errored")
  })
})
```

- [ ] **Step 2: Run + verify failure**

- [ ] **Step 3: Modify WaitAgent**

```tsx
type WaitStatus =
  | string
  | { Completed: { message?: string } }
  | { Errored: { error?: string } }
  | "InProgress"
  | "NotFound"

type WaitOutput = { status: Record<string, WaitStatus>; timed_out: boolean }

function parseWaitOutput(raw: string): WaitOutput | string | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    if (typeof v === "string") return v
    if (v && typeof v === "object" && "status" in v) return v as WaitOutput
    return null
  } catch {
    return null
  }
}

function statusLabel(s: WaitStatus): { name: string; message?: string } {
  if (typeof s === "string") return { name: s }
  if ("Completed" in s) return { name: "Completed", message: s.Completed.message }
  if ("Errored" in s) return { name: "Errored", message: s.Errored.error }
  return { name: "Unknown" }
}

function WaitAgent({
  input,
  output,
  agentNicknames,
}: {
  input: WaitAgentInput
  output: ToolResult
  agentNicknames?: Map<string, string>
}) {
  const { targets, timeout_ms } = input
  const labels = (targets ?? []).map((id) => agentNicknames?.get(id) ?? id.slice(0, 8))
  const detail = labels.join(", ")

  const parsed = parseWaitOutput(output.text)
  const previewRows: { id: string; line: string }[] = []
  let singleLine: string | null = null
  if (typeof parsed === "string") {
    singleLine = parsed
  } else if (parsed && typeof parsed === "object") {
    const entries = Object.entries(parsed.status)
    if (entries.length === 0) {
      singleLine = parsed.timed_out
        ? `Timed out after ${(timeout_ms ?? 0) / 1000}s`
        : "(no agent results)"
    } else {
      for (const [id, s] of entries) {
        const lab = agentNicknames?.get(id) ?? id.slice(0, 8)
        const { name, message } = statusLabel(s)
        previewRows.push({ id, line: message ? `${lab}: ${name} — ${message}` : `${lab}: ${name}` })
      }
    }
  }

  const fields: Array<[string, ReactNode]> = []
  if (targets && targets.length > 0) fields.push(["targets", targets.join(", ")])
  if (timeout_ms != null) fields.push(["timeout_ms", `${timeout_ms}`])

  return (
    <ToolCard.Root hasContent={true} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="wait_agent" detail={detail} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Preview>
        {singleLine && <div className="tool-preview-line">{singleLine}</div>}
        {previewRows.map((r) => (
          <div key={r.id} className="tool-preview-line">
            {r.line}
          </div>
        ))}
      </ToolCard.Preview>
      <ToolCard.Content>
        {fields.length > 0 && (
          <dl className="tool-fields">
            {fields.map(([k, v]) => (
              <Field key={k} name={k} value={v} />
            ))}
          </dl>
        )}
        <Output output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}
```

- [ ] **Step 4: Run + commit**

```bash
bun test src/transcript/codex/
git add src/transcript/codex/Tool.tsx src/transcript/codex/Tool.test.tsx
git commit -m "feat(codex): wait_agent preview — handles string/JSON/timeout/empty cases"
```

---

## Phase 4 — Verification

### Task 25: Fixtures

**Files:**

- Create: `src/__fixtures__/normal-mode-claude.jsonl`
- Create: `src/__fixtures__/normal-mode-codex.jsonl`

- [ ] **Step 1: Build minimal Claude fixture**

Construct a small JSONL file with one of each: a Bash call, a Read call, an Edit call, a TodoWrite call, a Skill call. Exact shape: copy patterns from `src/__fixtures__/sample.jsonl` for the line structure (`type: "user"` / `type: "assistant"`, etc.).

**This step is hand-crafted — match the existing parse pipeline. Reference existing fixture for shape; do not invent fields.**

- [ ] **Step 2: Build minimal Codex fixture**

Construct a small rollout JSONL with: `session_meta`, one `shell_command` (with output that has 5 lines), one `apply_patch`, and a `spawn_agent` + `wait_agent` pair where the `wait_agent` output is `"aborted by user after 5.1s"` (the simplest real string-abort case).

Reference: `src/__fixtures__/codex-sample.jsonl` for line shape.

- [ ] **Step 3: Smoke render test**

Run: `bun test` — confirm no parse errors / regressions on existing fixture tests.

- [ ] **Step 4: Commit**

```bash
git add src/__fixtures__/normal-mode-claude.jsonl src/__fixtures__/normal-mode-codex.jsonl
git commit -m "test: minimal fixtures for view-mode previews"
```

---

### Task 26: agent-browser end-to-end

**Files:**

- (No source changes; this task captures screenshots and verifies behavior.)

- [ ] **Step 1: Start dev server**

Run: `bun dev` (background). Capture the URL it prints.

- [ ] **Step 2: Verify settings + Claude fixture in agent-browser**

Use the `agent-browser` skill to:

1. Open the dev URL.
2. Open settings popover. Confirm "View mode" dropdown is present, default value is "Normal". Screenshot.
3. Drag in `src/__fixtures__/normal-mode-claude.jsonl`. Screenshot.
4. Verify visually that:
   - Bash row shows the 3-line tail and `+N lines` if applicable.
   - Read row shows `Read N lines`.
   - Edit row shows the diff inline; trigger has no caret/hover affordance.
   - TodoWrite header shows `(activeForm)` of the in-progress todo and body shows `M / N complete`.
   - Skill shows the description first line.
5. Click a Bash row → it expands to full body. Screenshot. Click again → back to preview.
6. Switch to **Compact** in settings. Cards collapse to header-only. Previously-expanded cards stay expanded. Screenshot.
7. Switch back to **Normal**. Previews return; previously-expanded cards still expanded. Screenshot.

- [ ] **Step 3: Verify Codex fixture**

Drag in `src/__fixtures__/normal-mode-codex.jsonl`. Confirm:

- shell_command 3-line tail.
- apply_patch full diff inline, non-clickable.
- spawn_agent `Bacon · Inspect ...` style line.
- wait_agent shows `aborted by user after 5.1s`.

Screenshot.

- [ ] **Step 4: Regression check existing fixtures**

Drag in `src/__fixtures__/sample.jsonl` (Claude) and `src/__fixtures__/codex-sample.jsonl` (Codex). Confirm:

- No console errors.
- Every tool row renders without crashing.
- Previews display sensible content.

Screenshot any anomaly.

- [ ] **Step 5: Type-check + full test suite**

Run: `bun run tsc --noEmit && bun test`
Expected: tsc clean; all tests pass.

- [ ] **Step 6: Final commit (only if any small fixes were needed in steps 2–4)**

If the agent-browser walkthrough surfaced bugs, fix them as their own commits with clear messages, then return to this step.

- [ ] **Step 7: Leave dev server running for Andrew's spot-check**

Per `AGENTS.md`: do not stop the dev server. Print the URL one more time and surface any screenshots saved from the walkthrough.

---

## Self-review

Spec coverage:

- [x] Setting + dropdown (Tasks 4, 5)
- [x] ToolCard Preview slot + render rules (Task 7)
- [x] CSS line-clamp (Task 7)
- [x] Helpers tailLines/headLines/parseFrontmatter (Tasks 1–3)
- [x] MoreHint component (Task 6)
- [x] All Claude tools (Tasks 9–17): Bash, Read, Edit, MultiEdit, Write, Glob, Grep, WebFetch, WebSearch, Task/Agent, NotebookEdit, EnterPlanMode (no body, no change), ExitPlanMode, TodoWrite, Skill, ToolSearch, Unknown
- [x] All Codex tools (Tasks 19–24): shell_command, exec_command, shell, apply_patch, update_plan, view_image, spawn_agent, wait_agent (all 4 output cases). web_search has no preview, no Codex-specific change required beyond what Phase 1 already gives it.
- [x] Nickname-resolution pre-pass (Task 23)
- [x] Verification via agent-browser (Task 26)
- [x] Definition of done (covered in Task 26 final check)

Type consistency:

- `tailLines` / `headLines` return `{ text: string; remaining: number }` everywhere.
- `parseFrontmatter` returns `Record<string, string> | undefined`.
- `Map<string, string>` for nicknames; consistent across pre-pass + WaitAgent.
- `viewMode: ViewMode` everywhere.

Placeholders: none. Each step has either code, a command, or a concrete agent-browser instruction.
