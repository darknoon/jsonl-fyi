# Copy Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add click-to-copy buttons on code/pre-style elements throughout the transcript (fenced code in markdown, tool input/output `<pre>` blocks, edit diffs).

**Architecture:** A single shared `<CopyButton>` component handles clipboard write + visual state (with blur-fade icon swap). Each integration site adds `position: relative` to its block and overlays the button. No tool-card-level copy. No whole-message copy.

**Tech Stack:** React 19, TypeScript, Vite, Bun (test runner), existing tokens in `src/styles.css`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-01-copy-buttons-design.md`

**Coordination note:** A separate in-flight spec (`2026-05-01-pi-trace-support-design.md`) may rename `ToolResult.text` to a `content` array. This plan does not depend on that change. If the rename lands first, update Task 4 (Output) and Task 6 (tool-specific pre blocks) to read from the new shape.

---

## File Structure

| File                                       | Purpose                                                                                        |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `src/transcript/CopyButton.tsx` (new)      | Shared button component with clipboard write + state machine                                   |
| `src/transcript/CopyButton.test.tsx` (new) | Unit tests                                                                                     |
| `src/styles.css`                           | `.copy-button` styles + blur-fade icon transition + per-host `position: relative` rules        |
| `src/transcript/Markdown.tsx`              | Add CopyButton inside `pre` renderer; extract code text from children                          |
| `src/transcript/shared.tsx`                | Add CopyButton to `Output` and to string/number `Field` values                                 |
| `src/transcript/EditDiff.tsx`              | Wrap diff in relative container; overlay CopyButton with thunk producing find/replace string   |
| `src/transcript/claude/Tool.tsx`           | Wrap each non-shared `<pre>` (Bash command, Write content, Skill injectedText) with CopyButton |
| `src/transcript/codex/Tool.tsx`            | Wrap each `<pre className="output cmd">` and `<pre className="output">` with CopyButton        |
| `src/transcript/codex/ApplyPatch.tsx`      | Wrap the patch and meta `<pre>` with CopyButton                                                |

---

## Task 1: CopyButton component (TDD)

**Files:**

- Create: `src/transcript/CopyButton.tsx`
- Create: `src/transcript/CopyButton.test.tsx`

- [ ] **Step 1: Write failing test for static text copy**

Create `src/transcript/CopyButton.test.tsx`:

```tsx
import { test, expect, mock, beforeEach } from "bun:test"
import { render, fireEvent, cleanup, act } from "@testing-library/react"
import { CopyButton } from "./CopyButton"

let writeText: ReturnType<typeof mock>

beforeEach(() => {
  cleanup()
  writeText = mock(async () => {})
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  })
})

test("clicking copies static text", async () => {
  const { getByRole } = render(<CopyButton text="hello" />)
  await act(async () => {
    fireEvent.click(getByRole("button"))
  })
  expect(writeText).toHaveBeenCalledWith("hello")
})
```

- [ ] **Step 2: Verify it fails**

Run: `bun test src/transcript/CopyButton.test.tsx`
Expected: FAIL — module `./CopyButton` not found.

- [ ] **Step 3: Check that `@testing-library/react` is available**

Run: `bun pm ls 2>&1 | grep testing-library`

If not present, install:

```bash
bun add -d @testing-library/react @testing-library/dom happy-dom
```

Then ensure `bunfig.toml` (or test config) sets a DOM env. Check `bunfig.toml`:

```bash
cat bunfig.toml 2>/dev/null
```

If no DOM env is configured, add to `bunfig.toml`:

```toml
[test]
preload = ["./test-setup.ts"]
```

And create `test-setup.ts`:

```ts
import { GlobalRegistrator } from "@happy-dom/global-registrator"
GlobalRegistrator.register()
```

Install if needed: `bun add -d @happy-dom/global-registrator`.

If existing tests already use `react-dom/server` snapshots and there's no DOM testing infrastructure, **switch to a server-render approach instead** — see Task 1 alternative below. Skim other `*.test.tsx` files first:

```bash
grep -l "renderToStaticMarkup\|@testing-library" src/transcript/*.test.tsx
```

- **If `@testing-library/react` already present →** continue with the click-based tests as written.
- **If only `renderToStaticMarkup` is used →** replace the test file with the SSR-based version below.

**SSR-based alternative** for `CopyButton.test.tsx`:

```tsx
import { test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { CopyButton } from "./CopyButton"

test("renders a button with copy aria-label by default", () => {
  const html = renderToStaticMarkup(<CopyButton text="hello" />)
  expect(html).toContain('aria-label="Copy"')
  expect(html).toContain("copy-button")
})

test("custom aria-label", () => {
  const html = renderToStaticMarkup(<CopyButton text="x" ariaLabel="Copy command" />)
  expect(html).toContain('aria-label="Copy command"')
})
```

The click-behavior tests become manual via the dev server in Task 7.

- [ ] **Step 4: Write minimal implementation**

Create `src/transcript/CopyButton.tsx`:

```tsx
import { useEffect, useRef, useState } from "react"

const REVERT_MS = 1500

type Props = {
  text: string | (() => string)
  className?: string
  ariaLabel?: string
}

async function writeToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    // Fallback for insecure contexts.
    try {
      const ta = document.createElement("textarea")
      ta.value = value
      ta.style.position = "fixed"
      ta.style.opacity = "0"
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand("copy")
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

export function CopyButton({ text, className, ariaLabel = "Copy" }: Props) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    const value = typeof text === "function" ? text() : text
    const ok = await writeToClipboard(value)
    if (!ok) {
      console.warn("CopyButton: failed to copy")
      return
    }
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), REVERT_MS)
  }

  const cls = ["copy-button", copied ? "copy-button--copied" : "", className]
    .filter(Boolean)
    .join(" ")

  return (
    <button
      type="button"
      className={cls}
      aria-label={ariaLabel}
      data-copied={copied || undefined}
      onClick={handleClick}
    >
      <span className="copy-button-icon copy-button-icon-copy" aria-hidden="true">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </span>
      <span className="copy-button-icon copy-button-icon-check" aria-hidden="true">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    </button>
  )
}
```

- [ ] **Step 5: Run tests, verify pass**

Run: `bun test src/transcript/CopyButton.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/transcript/CopyButton.tsx src/transcript/CopyButton.test.tsx
# also any test infra changes if added
git commit -m "feat(copy): CopyButton component with clipboard fallback"
```

---

## Task 2: Styles + blur-fade transition

**Files:**

- Modify: `src/styles.css`

- [ ] **Step 1: Append CopyButton styles**

Append to `src/styles.css`:

```css
/* ---- copy button ----------------------------------------------------- */

.copy-button {
  position: absolute;
  top: 6px;
  right: 6px;
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  background: var(--color-card);
  color: var(--color-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  opacity: 0;
  transition: opacity 120ms ease;
  z-index: 1;
}

.copy-button:hover {
  color: var(--color-fg);
}
.copy-button:focus-visible {
  outline: 2px solid var(--color-fg);
  outline-offset: 1px;
  opacity: 1;
}

/* Reveal on hover of any container that hosts a copy button. */
.copy-host:hover > .copy-button,
.copy-host:focus-within > .copy-button {
  opacity: 1;
}

/* Touch/no-hover: always visible. */
@media (hover: none) {
  .copy-button {
    opacity: 1;
  }
}

/* Stay opaque while showing the success state. */
.copy-button--copied {
  opacity: 1;
  color: var(--color-success);
}

/* Blur-fade cross-dissolve between copy/check icons. */
.copy-button-icon {
  grid-area: 1 / 1;
  display: inline-flex;
  transition:
    opacity 180ms ease,
    filter 180ms ease;
}
.copy-button-icon-copy {
  opacity: 1;
  filter: blur(0);
}
.copy-button-icon-check {
  opacity: 0;
  filter: blur(4px);
}
.copy-button[data-copied] .copy-button-icon-copy {
  opacity: 0;
  filter: blur(4px);
}
.copy-button[data-copied] .copy-button-icon-check {
  opacity: 1;
  filter: blur(0);
}

@media (prefers-reduced-motion: reduce) {
  .copy-button,
  .copy-button-icon {
    transition: none;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles.css
git commit -m "style(copy): copy-button with blur-fade icon swap"
```

---

## Task 3: Markdown fenced code blocks

**Files:**

- Modify: `src/transcript/Markdown.tsx`
- Modify: `src/styles.css`
- Modify (test fixtures only if snapshots break): `src/transcript/__snapshots__/`

- [ ] **Step 1: Update Markdown.tsx `pre` renderer**

Replace the `pre` line in `COMPONENTS`:

```tsx
pre: ({ node: _node, children, ...props }) => {
  const code = extractCodeText(children)
  return (
    <pre {...props} className="md-code-block copy-host">
      {children}
      <CopyButton text={code} ariaLabel="Copy code" />
    </pre>
  )
},
```

Add the helper above `COMPONENTS`:

```tsx
import { Children, isValidElement, type ReactNode } from "react"
import { CopyButton } from "./CopyButton"

function extractCodeText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(extractCodeText).join("")
  if (isValidElement(node)) {
    const children = (node.props as { children?: ReactNode }).children
    return extractCodeText(children)
  }
  return ""
}
```

Add `import { CopyButton } from "./CopyButton"` to the imports if not already present.

- [ ] **Step 2: Add `position: relative` for `.md-code-block`**

The CopyButton is positioned absolutely; `.md-code-block` must be positioned. Edit `src/styles.css` around line 801:

Find:

```css
.md-content .md-code-block {
```

Add `position: relative;` to its block. (Do not remove existing properties.)

- [ ] **Step 3: Run markdown tests**

Run: `bun test src/transcript/Markdown.test.tsx`

Snapshots will fail because the output now includes the button. Inspect the diff: it should be only added `<button class="copy-button" …>` markup inside `<pre>`. If correct, update snapshots:

Run: `bun test src/transcript/Markdown.test.tsx --update-snapshots`

Verify nothing else changed.

- [ ] **Step 4: Run full test suite**

Run: `bun test`
Expected: PASS (other snapshot files may include rendered markdown — accept those updates if they only show the new copy button).

- [ ] **Step 5: Commit**

```bash
git add src/transcript/Markdown.tsx src/styles.css src/transcript/__snapshots__
git commit -m "feat(copy): copy button on markdown code blocks"
```

---

## Task 4: Output + Field

**Files:**

- Modify: `src/transcript/shared.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Update `Output` and `Field`**

Edit `src/transcript/shared.tsx`:

```tsx
import type { ReactNode } from "react"
import type { ToolResult } from "../types"
import { ImageBlock } from "./ImageBlock"
import { CopyButton } from "./CopyButton"

// ...

export function Output({ output }: { output: ToolResult }) {
  if (!output.text) return null
  return (
    <pre className="output copy-host">
      {output.text}
      <CopyButton text={output.text} ariaLabel="Copy output" />
    </pre>
  )
}

export function Field({ name, value }: { name: string; value: ReactNode }) {
  const copyable = typeof value === "string" || typeof value === "number"
  return (
    <div className={"tool-field" + (copyable ? " copy-host" : "")}>
      <dt>{name}</dt>
      <dd>
        <code>{value}</code>
        {copyable && (
          <CopyButton
            text={String(value)}
            ariaLabel={`Copy ${name}`}
            className="copy-button-field"
          />
        )}
      </dd>
    </div>
  )
}
```

- [ ] **Step 2: Style adjustments**

Edit `src/styles.css`:

`.cmd, .output` already has `padding: 8px 10px` — bump right padding when hosting a button so text doesn't crowd it. Replace the `.cmd, .output` block's padding line:

```css
.cmd,
.output {
  ...
  padding: 8px 10px;
  position: relative;
  ...
}
.cmd.copy-host,
.output.copy-host { padding-right: 40px; }
```

For the field button, override the absolute position so it sits at the right of the value column. Append:

```css
.tool-field {
  position: relative;
}
.copy-button-field {
  /* anchored to the row, not the dd box */
  top: 0;
  right: 0;
}
```

- [ ] **Step 3: Verify**

Run: `bun test`
Expected: PASS (some tool snapshots may update with copy-host/button markup — verify the diff is only additive).

- [ ] **Step 4: Commit**

```bash
git add src/transcript/shared.tsx src/styles.css src/transcript/__snapshots__
git commit -m "feat(copy): copy buttons on tool Output and Field"
```

---

## Task 5: Edit diffs

**Files:**

- Modify: `src/transcript/EditDiff.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Wrap FileDiff with overlay**

Replace `src/transcript/EditDiff.tsx`:

```tsx
import { useMemo } from "react"
import { parseDiffFromFile } from "@pierre/diffs"
import { FileDiff } from "@pierre/diffs/react"
import { CopyButton } from "./CopyButton"

const ensureTrailingNewline = (s: string) => (s.length > 0 && !s.endsWith("\n") ? s + "\n" : s)

function diffCopyText(oldString: string, newString: string): string {
  return `<<<<<<< OLD\n${oldString}\n=======\n${newString}\n>>>>>>> NEW\n`
}

export function EditDiff({
  filePath,
  oldString,
  newString,
}: {
  filePath: string
  oldString: string
  newString: string
}) {
  const fileDiff = useMemo(() => {
    const name = filePath || "file"
    return parseDiffFromFile(
      { name, contents: ensureTrailingNewline(oldString) },
      { name, contents: ensureTrailingNewline(newString) },
    )
  }, [filePath, oldString, newString])

  return (
    <div className="edit-diff-wrap copy-host">
      <FileDiff
        className="edit-diff"
        fileDiff={fileDiff}
        options={{
          diffStyle: "unified",
          disableFileHeader: true,
          diffIndicators: "classic",
          disableLineNumbers: true,
        }}
        disableWorkerPool
      />
      <CopyButton text={() => diffCopyText(oldString, newString)} ariaLabel="Copy diff" />
    </div>
  )
}
```

- [ ] **Step 2: Style the wrapper**

Append to `src/styles.css`:

```css
.edit-diff-wrap {
  position: relative;
}
.edit-diff-wrap > .copy-button {
  top: 6px;
  right: 6px;
}
```

- [ ] **Step 3: Run tests**

Run: `bun test`
Expected: PASS (any snapshot updates in tool tests should only add the wrapper + button).

- [ ] **Step 4: Commit**

```bash
git add src/transcript/EditDiff.tsx src/styles.css src/transcript/__snapshots__
git commit -m "feat(copy): copy button on edit diffs (find/replace markers)"
```

---

## Task 6: Tool-specific `<pre>` blocks

These are direct `<pre>` emissions in tool dispatchers that aren't routed through `Output`. Each gets the same `copy-host` class + `<CopyButton>` overlay.

**Files:**

- Modify: `src/transcript/claude/Tool.tsx`
- Modify: `src/transcript/codex/Tool.tsx`
- Modify: `src/transcript/codex/ApplyPatch.tsx`

- [ ] **Step 1: claude/Tool.tsx — Bash command, Write content, Skill injectedText, NotebookEdit new_source**

Find each `<pre className="output">…</pre>` or `<pre className="output cmd">…</pre>` that is **not** part of a preview snippet (those are `tool-preview-snippet`, leave them alone). Replace each like:

Before:

```tsx
{
  command && <pre className="output cmd">{command}</pre>
}
```

After:

```tsx
{
  command && (
    <pre className="output cmd copy-host">
      {command}
      <CopyButton text={command} ariaLabel="Copy command" />
    </pre>
  )
}
```

Apply to:

- `Bash`: line ~103, `<pre className="output cmd">{command}</pre>` → `ariaLabel="Copy command"`.
- `Write`: line ~224, `<pre className="output">{content}</pre>` → `ariaLabel="Copy contents"`.
- `Skill`: line ~602, `<pre className="output">{output.injectedText}</pre>` → `ariaLabel="Copy skill body"`.
- `NotebookEdit`: line ~536, `<pre className="output">{new_source}</pre>` → `ariaLabel="Copy source"`.

Add at top of file:

```tsx
import { CopyButton } from "../CopyButton"
```

Leave `tool-preview-snippet` blocks alone (they are previews, full content is below).

- [ ] **Step 2: codex/Tool.tsx — every `<pre className="output cmd">` and `<pre className="output">`**

Repeat the same pattern for the lines listed:

- 69, 129, 175, 221, 399 (`<pre className="output cmd">…</pre>` and one `<pre className="output">{message}</pre>`).

For each, choose an `ariaLabel`:

- Lines 69, 129: `"Copy command"`.
- Line 175: `"Copy command"` (joined argv).
- Line 221: `"Copy stdin"` (`chars` is stdin payload).
- Line 399: `"Copy message"`.

Add `import { CopyButton } from "../CopyButton"` at top.

Leave `tool-preview-snippet` previews (lines 64, 124, 170, 216) untouched.

- [ ] **Step 3: codex/ApplyPatch.tsx — patch and meta `<pre>`**

Lines 26 and 72:

- Line 26 `{patch}` → `ariaLabel="Copy patch"`.
- Line 72 `{meta.text}` → `ariaLabel="Copy output"`.

Add `import { CopyButton } from "../CopyButton"`.

- [ ] **Step 4: Run tests**

Run: `bun test`
Expected: PASS. Snapshot updates expected — verify each diff is only additive (`copy-host` class + `<button>`).

- [ ] **Step 5: TypeScript check**

Run: `bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/transcript/claude/Tool.tsx src/transcript/codex/Tool.tsx src/transcript/codex/ApplyPatch.tsx src/transcript/__snapshots__
git commit -m "feat(copy): copy buttons on tool-specific pre blocks"
```

---

## Task 7: Visual verification

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Check for an existing dev server first:

Run: `lsof -i :5173 -t 2>/dev/null`

If a server is running, kill it: `kill <pid>`. Then:

Run (background): `bun dev`
Expected: server up at `http://localhost:5173`.

- [ ] **Step 2: Use agent-browser to drive the page**

Invoke the `agent-browser` skill with the dev URL. Drag in fixtures from `src/__fixtures__/` and `src/transcript/__fixtures__/` (one Claude file, one Codex file).

For each, verify:

- Hovering a fenced code block shows a copy button top-right; clicking it swaps to a checkmark with a visible blur-fade; reverts after ~1.5s.
- Clipboard contains the code text (verify via a separate browser action that pastes into a textarea, or via `await navigator.clipboard.readText()` if accessible).
- Same for: Bash command pre, Bash output, Write contents, Edit diff (copy-as-find/replace markers), Skill injectedText.
- No copy button on inline code, on user bubbles, on assistant prose paragraphs, or on thinking blocks.
- No layout shifts on hover.

Take screenshots and attach to the plan-execution conversation as evidence.

- [ ] **Step 3: Leave the dev server running**

Per project convention, do not kill the server on completion.

---

## Self-review notes

- Spec coverage: every site listed in the spec's integration table has a task. Diff format matches spec (`<<<<<<< OLD ... >>>>>>> NEW`). Failure mode (`execCommand` fallback + silent warn) is implemented in Task 1. Reduce-motion handling is in Task 2.
- No placeholders (no TBD/TODO).
- Type/name consistency: `CopyButton` props are `text`, `className`, `ariaLabel` everywhere. `copy-host` is the host-class name everywhere. CSS class `copy-button--copied` and attribute `data-copied` are both written by the component (CSS uses the attribute selector for the icon swap; the modifier class is available for future styling).
