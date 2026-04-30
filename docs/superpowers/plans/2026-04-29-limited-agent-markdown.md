# Limited Agent Markdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a curated subset of Markdown in agent-authored prose surfaces (assistant text, ExitPlanMode plan, skill bodies, Agent prompts, TodoWrite items), behind a user-toggleable setting. Anything we don't render keeps its literal source text.

**Architecture:** A single `<Markdown>` component in `src/transcript/Markdown.tsx`, built on `react-markdown` + `remark-gfm` with a custom remark plugin that converts disallowed AST nodes (images, raw HTML, non-http/https/mailto links) back to literal text. A `SettingsContext` exposes a `renderMarkdown` boolean persisted to `localStorage`, surfaced via a native HTML Popover anchored to the existing gear button.

**Tech Stack:** React 19, TypeScript, `react-markdown` ^9, `remark-gfm` ^4, `mdast-util-to-markdown` (transitive), `bun:test`, `react-dom/server` for snapshot tests, native HTML Popover API + CSS anchor positioning.

**Spec:** `docs/superpowers/specs/2026-04-29-limited-agent-markdown-design.md`

---

## File Structure

**Create:**
- `src/settings.tsx` — SettingsContext + provider + `useSettings()` hook + `localStorage` persistence
- `src/transcript/Markdown.tsx` — `<Markdown>` component (block + inline modes)
- `src/transcript/remarkKeepDisallowed.ts` — remark plugin converting disallowed nodes to text
- `src/transcript/Markdown.test.tsx` — unit + snapshot tests for `<Markdown>`
- `src/transcript/remarkKeepDisallowed.test.ts` — unit tests for the plugin
- `src/transcript/__fixtures__/markdown-sample.md` — single fixture for snapshot tests
- `src/SettingsPopover.tsx` — gear-button popover housing the toggle

**Modify:**
- `package.json` — add `react-markdown`, `remark-gfm` deps
- `src/index.tsx` — wrap app in `<SettingsProvider>`
- `src/App.tsx` — replace gear `<button>` with popover trigger; render `<SettingsPopover>`
- `src/transcript/claude/TextBlock.tsx` — assistant branch uses `<Markdown>`
- `src/transcript/claude/SkillBlock.tsx` — body uses `<Markdown>`
- `src/transcript/claude/Tool.tsx` — `Agent` prompt, `TodoWrite` items, `ExitPlanMode` plan use `<Markdown>`
- `src/styles.css` — `.md-content` scoped styles + popover styles

---

## Task 1: Add dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime deps**

```bash
bun add react-markdown@^9 remark-gfm@^4
```

- [ ] **Step 2: Verify package.json contains both**

Run: `grep -E '"react-markdown"|"remark-gfm"' package.json`
Expected: two matching lines under `dependencies`.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "deps: add react-markdown and remark-gfm for limited markdown rendering"
```

---

## Task 2: `remark-keep-disallowed` plugin

Walks the mdast tree before render. For each `image`, `html`, or `link` with a non-allowed URL scheme, replaces the node with a `text` node containing its original Markdown source. This is what enforces "kept as literal text, never silently dropped."

**Files:**
- Create: `src/transcript/remarkKeepDisallowed.ts`
- Test: `src/transcript/remarkKeepDisallowed.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/transcript/remarkKeepDisallowed.test.ts`:

```ts
import { test, expect } from "bun:test"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkStringify from "remark-stringify"
import { remarkKeepDisallowed } from "./remarkKeepDisallowed"

function transform(md: string): string {
  // Round-trip through the plugin: parse → keep-disallowed → stringify.
  // Disallowed nodes are replaced with text nodes containing their literal
  // source, so re-stringifying produces text (no markdown syntax) for those
  // pieces.
  const tree = unified()
    .use(remarkParse)
    .use(remarkKeepDisallowed)
    .use(remarkStringify)
    .processSync(md)
  return String(tree).trimEnd()
}

test("image → literal alt-image syntax", () => {
  expect(transform("before ![alt](https://x/i.png) after")).toBe(
    "before \\!\\[alt]\\(https://x/i.png) after",
  )
})

test("javascript: link → literal", () => {
  expect(transform("[click](javascript:alert(1))")).toBe(
    "\\[click]\\(javascript:alert\\(1\\))",
  )
})

test("http link kept as link", () => {
  expect(transform("[ok](https://example.com)")).toBe(
    "[ok](https://example.com)",
  )
})

test("raw html block kept as text", () => {
  expect(transform("<div>hi</div>")).toBe("\\<div>hi\\</div>")
})

test("mailto link kept as link", () => {
  expect(transform("[me](mailto:a@b.c)")).toBe("[me](mailto:a@b.c)")
})
```

> **Note on escaped output:** `remark-stringify` escapes characters that would otherwise re-parse as Markdown. The escapes confirm the node is now a plain `text` node, not a structural node — exactly what we want. The actual user-visible rendering happens through React (no re-stringification), so escapes do not appear on screen.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/transcript/remarkKeepDisallowed.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Add `unified` and `remark-parse`/`remark-stringify` as dev deps for the test**

```bash
bun add -d unified remark-parse remark-stringify
```

- [ ] **Step 4: Implement the plugin**

Create `src/transcript/remarkKeepDisallowed.ts`:

```ts
import type { Plugin } from "unified"
import type { Root, Image, Html, Link, Parent, Text, RootContent } from "mdast"
import { visit } from "unist-util-visit"

const ALLOWED_SCHEMES = /^(https?:|mailto:)/i

function imageToText(node: Image): Text {
  // Reconstruct `![alt](url "title")` from the parsed node. Title is rare
  // but preserved when present so we never drop characters the author wrote.
  const title = node.title ? ` "${node.title}"` : ""
  return { type: "text", value: `![${node.alt ?? ""}](${node.url}${title})` }
}

function linkToText(node: Link): Text {
  // Children of a link are themselves mdast nodes (e.g. text, emphasis).
  // For literal-text fallback we only need the plain-text concatenation.
  const inner = node.children
    .map(c => (c.type === "text" ? c.value : ""))
    .join("")
  const title = node.title ? ` "${node.title}"` : ""
  return { type: "text", value: `[${inner}](${node.url}${title})` }
}

function htmlToText(node: Html): Text {
  return { type: "text", value: node.value }
}

export const remarkKeepDisallowed: Plugin<[], Root> = () => tree => {
  visit(tree, (node, index, parent: Parent | undefined) => {
    if (!parent || index === undefined) return
    if (node.type === "image") {
      ;(parent.children as RootContent[])[index] = imageToText(node as Image)
      return
    }
    if (node.type === "html") {
      ;(parent.children as RootContent[])[index] = htmlToText(node as Html)
      return
    }
    if (node.type === "link") {
      const link = node as Link
      if (!ALLOWED_SCHEMES.test(link.url)) {
        ;(parent.children as RootContent[])[index] = linkToText(link)
      }
      return
    }
  })
}
```

- [ ] **Step 5: Install `mdast` types and `unist-util-visit`**

```bash
bun add -d unist-util-visit @types/mdast
```

- [ ] **Step 6: Run tests, verify pass**

Run: `bun test src/transcript/remarkKeepDisallowed.test.ts`
Expected: 5 passing.

- [ ] **Step 7: Run typecheck**

Run: `bun run check`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/transcript/remarkKeepDisallowed.ts src/transcript/remarkKeepDisallowed.test.ts package.json bun.lock
git commit -m "feat(markdown): remark plugin converting disallowed nodes to literal text"
```

---

## Task 3: `<Markdown>` component (block mode + render-off)

Renders Markdown via `react-markdown`, with the `remarkKeepDisallowed` plugin always active. In this task we cover block mode and the `renderMarkdown=false` short-circuit. Inline mode comes in Task 4.

**Files:**
- Create: `src/transcript/Markdown.tsx`
- Test: `src/transcript/Markdown.test.tsx`

- [ ] **Step 1: Write failing snapshot test (block mode)**

Create `src/transcript/__fixtures__/markdown-sample.md` with the spec's fixture content:

```md
A paragraph with **strong**, *emphasis*, ~~strike~~, and `inline code`.

# H1
## H2

- item one
- item two
  - nested
- [x] done task
- [ ] pending task

1. first
2. second

> a quote

```ts
const x: number = 1
```

A [safe link](https://example.com), an ![image](https://ex.com/i.png), a [bad link](javascript:alert(1)), and some <b>raw HTML</b>.

| col a | col b |
| --- | --- |
| 1 | 2 |
```

Create `src/transcript/Markdown.test.tsx`:

```tsx
import { test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { Markdown } from "./Markdown"
import { SettingsProvider } from "../settings"

const FIXTURE = readFileSync(
  join(import.meta.dir, "__fixtures__/markdown-sample.md"),
  "utf8",
)

function render(node: React.ReactNode, renderMarkdown = true): string {
  return renderToStaticMarkup(
    <SettingsProvider initial={{ renderMarkdown }}>{node}</SettingsProvider>,
  )
}

test("block mode renders fixture", () => {
  expect(render(<Markdown source={FIXTURE} />)).toMatchSnapshot()
})

test("block mode disallowed nodes become literal text", () => {
  const html = render(<Markdown source={FIXTURE} />)
  expect(html).toContain("![image](https://ex.com/i.png)")
  expect(html).toContain("[bad link](javascript:alert(1))")
  expect(html).toContain("&lt;b&gt;raw HTML&lt;/b&gt;")
  // safe link still becomes an <a>
  expect(html).toMatch(/<a [^>]*href="https:\/\/example\.com"/)
})

test("renderMarkdown=false returns source verbatim", () => {
  const html = render(<Markdown source={FIXTURE} />, false)
  // The raw source should appear inside the assistant-text wrapper
  expect(html).toContain("# H1")
  expect(html).toContain("**strong**")
  expect(html).not.toMatch(/<strong>strong<\/strong>/)
})

test("safe link gets target=_blank rel", () => {
  const html = render(<Markdown source="[x](https://e.com)" />)
  expect(html).toContain('target="_blank"')
  expect(html).toContain('rel="noreferrer noopener"')
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `bun test src/transcript/Markdown.test.tsx`
Expected: FAIL — `Markdown` and `SettingsProvider` not found.

- [ ] **Step 3: Implement minimal `SettingsProvider` for tests** (full version in Task 5)

Create `src/settings.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from "react"

export type Settings = { renderMarkdown: boolean }

const Ctx = createContext<Settings>({ renderMarkdown: true })

export function SettingsProvider({
  initial,
  children,
}: {
  initial?: Settings
  children: ReactNode
}) {
  return <Ctx.Provider value={initial ?? { renderMarkdown: true }}>{children}</Ctx.Provider>
}

export function useSettings(): Settings {
  return useContext(Ctx)
}
```

> Task 5 will replace this with a stateful provider that persists to `localStorage` and exposes a setter. The test-only signature here is forward-compatible.

- [ ] **Step 4: Implement `<Markdown>`**

Create `src/transcript/Markdown.tsx`:

```tsx
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { remarkKeepDisallowed } from "./remarkKeepDisallowed"
import { useSettings } from "../settings"

const COMPONENTS: Components = {
  a: ({ node: _node, ...props }) => (
    <a
      {...props}
      className="md-link"
      target="_blank"
      rel="noreferrer noopener"
    />
  ),
  code: ({ node: _node, className, children, ...props }) => {
    const lang = /language-(\w+)/.exec(className ?? "")?.[1]
    // Inline code has no language class; block code is wrapped in <pre> by
    // react-markdown, so the same component handles both. We only set
    // data-lang when there's an actual language tag.
    return (
      <code
        {...props}
        className={lang ? "md-code" : "md-code-inline"}
        data-lang={lang}
      >
        {children}
      </code>
    )
  },
  pre: ({ node: _node, ...props }) => <pre {...props} className="md-code-block" />,
  ul: ({ node: _node, ...props }) => <ul {...props} className="md-list" />,
  ol: ({ node: _node, ...props }) => <ol {...props} className="md-list" />,
  blockquote: ({ node: _node, ...props }) => (
    <blockquote {...props} className="md-quote" />
  ),
  table: ({ node: _node, ...props }) => <table {...props} className="md-table" />,
  h1: ({ node: _node, ...props }) => <h1 {...props} className="md-heading" />,
  h2: ({ node: _node, ...props }) => <h2 {...props} className="md-heading" />,
  h3: ({ node: _node, ...props }) => <h3 {...props} className="md-heading" />,
  h4: ({ node: _node, ...props }) => <h4 {...props} className="md-heading" />,
  h5: ({ node: _node, ...props }) => <h5 {...props} className="md-heading" />,
  h6: ({ node: _node, ...props }) => <h6 {...props} className="md-heading" />,
}

export function Markdown({
  source,
  inline = false,
}: {
  source: string
  inline?: boolean
}) {
  const { renderMarkdown } = useSettings()

  if (!renderMarkdown) {
    if (inline) return <>{source}</>
    return (
      <div className="assistant-text" style={{ whiteSpace: "pre-wrap" }}>
        {source}
      </div>
    )
  }

  // Inline mode handled in Task 4. For now both modes use the same render.
  return (
    <div className="md-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkKeepDisallowed]}
        components={COMPONENTS}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
```

- [ ] **Step 5: Run tests, verify pass**

Run: `bun test src/transcript/Markdown.test.tsx`
Expected: 4 passing. The first run writes the snapshot; subsequent runs assert against it.

- [ ] **Step 6: Run typecheck**

Run: `bun run check`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/transcript/Markdown.tsx src/transcript/Markdown.test.tsx src/transcript/__fixtures__/markdown-sample.md src/settings.tsx
git add src/transcript/__snapshots__/  # if bun:test wrote one here
git commit -m "feat(markdown): Markdown component with block-mode rendering and render-off short-circuit"
```

---

## Task 4: Inline mode for `<Markdown>`

Inline mode disallows block-level elements and renders their literal source instead.

**Files:**
- Modify: `src/transcript/Markdown.tsx`
- Modify: `src/transcript/Markdown.test.tsx`

- [ ] **Step 1: Add failing inline-mode tests**

Append to `src/transcript/Markdown.test.tsx`:

```tsx
test("inline mode: heading and list render as literal source", () => {
  const html = render(<Markdown source="# Heading\n- one\n- two" inline />)
  expect(html).not.toMatch(/<h1/)
  expect(html).not.toMatch(/<ul/)
  expect(html).toContain("# Heading")
  expect(html).toContain("- one")
})

test("inline mode: emphasis and inline code still render", () => {
  const html = render(<Markdown source="**b** and `c`" inline />)
  expect(html).toMatch(/<strong>b<\/strong>/)
  expect(html).toMatch(/<code [^>]*>c<\/code>/)
})

test("inline mode snapshot of fixture", () => {
  expect(render(<Markdown source={FIXTURE} inline />)).toMatchSnapshot()
})
```

- [ ] **Step 2: Run, verify failure**

Run: `bun test src/transcript/Markdown.test.tsx -t "inline mode"`
Expected: failures — block elements still render.

- [ ] **Step 3: Add a second remark plugin pass for inline mode**

Create `src/transcript/remarkInlineOnly.ts`:

```ts
import type { Plugin } from "unified"
import type { Root, RootContent, Parent, Text } from "mdast"
import { toMarkdown } from "mdast-util-to-markdown"
import { gfmToMarkdown } from "mdast-util-gfm"

const BLOCK_TYPES = new Set([
  "heading",
  "list",
  "listItem",
  "code", // fenced/indented code block (inline code is `inlineCode`)
  "blockquote",
  "thematicBreak",
  "table",
  "tableRow",
  "tableCell",
])

function nodeToSource(node: RootContent): string {
  // Stringify the disallowed node back to its Markdown source so the literal
  // characters survive into the rendered output.
  return toMarkdown(node, { extensions: [gfmToMarkdown()] }).trimEnd()
}

export const remarkInlineOnly: Plugin<[], Root> = () => tree => {
  function walk(parent: Parent) {
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i]
      if (BLOCK_TYPES.has(child.type)) {
        const text: Text = { type: "text", value: nodeToSource(child) }
        ;(parent.children as RootContent[])[i] = text
        continue
      }
      if ("children" in child) walk(child as Parent)
    }
  }
  walk(tree)
}
```

- [ ] **Step 4: Install `mdast-util-to-markdown` and `mdast-util-gfm`**

```bash
bun add mdast-util-to-markdown mdast-util-gfm
```

- [ ] **Step 5: Wire inline plugin into `<Markdown>`**

Edit `src/transcript/Markdown.tsx`. Replace the body of the rendering branch:

```tsx
import { remarkInlineOnly } from "./remarkInlineOnly"

// ... inside Markdown(), after the renderMarkdown=false branch:
const plugins = inline
  ? [remarkGfm, remarkKeepDisallowed, remarkInlineOnly]
  : [remarkGfm, remarkKeepDisallowed]

if (inline) {
  return (
    <span className="md-content md-inline">
      <ReactMarkdown remarkPlugins={plugins} components={COMPONENTS}>
        {source}
      </ReactMarkdown>
    </span>
  )
}

return (
  <div className="md-content">
    <ReactMarkdown remarkPlugins={plugins} components={COMPONENTS}>
      {source}
    </ReactMarkdown>
  </div>
)
```

> Note: `react-markdown` wraps top-level content in `<p>` by default. Inside `md-inline`, the CSS in Task 8 sets `.md-inline > p { display: inline; margin: 0; }` so the inline mode renders without breaking flow. We accept that the wrapper is technically a `<span>` containing a `<p>` — invalid HTML strictly, but every browser handles it fine. Alternative is `unwrapDisallowed` on `p`, which would lose paragraph children.

Switch the wrapper to a `<p>`-friendly form: change `<span>` to `<span>` with the CSS rule above; do not nest `<p>` inside `<span>` if it causes issues — if the test fails, change `<span>` to `<>` fragment.

- [ ] **Step 6: Run tests, verify pass**

Run: `bun test src/transcript/Markdown.test.tsx`
Expected: all passing (block + inline + render-off + new inline tests).

- [ ] **Step 7: Run typecheck**

Run: `bun run check`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/transcript/Markdown.tsx src/transcript/Markdown.test.tsx src/transcript/remarkInlineOnly.ts package.json bun.lock
git add src/transcript/__snapshots__/
git commit -m "feat(markdown): inline-only mode preserving block constructs as literal source"
```

---

## Task 5: Real `SettingsProvider` with localStorage persistence

Replace the placeholder provider from Task 3 with one that persists to `localStorage` and exposes a setter.

**Files:**
- Modify: `src/settings.tsx`
- Test: `src/settings.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/settings.test.tsx`:

```tsx
import { test, expect, beforeEach } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { SettingsProvider, useSettings } from "./settings"

const KEY = "jsonl-fyi:settings"

beforeEach(() => {
  globalThis.localStorage?.clear?.()
})

function Probe() {
  const { renderMarkdown } = useSettings()
  return <span>{renderMarkdown ? "on" : "off"}</span>
}

test("default is renderMarkdown=true", () => {
  expect(renderToStaticMarkup(
    <SettingsProvider><Probe /></SettingsProvider>
  )).toBe("<span>on</span>")
})

test("reads existing value from localStorage", () => {
  globalThis.localStorage.setItem(KEY, JSON.stringify({ renderMarkdown: false }))
  expect(renderToStaticMarkup(
    <SettingsProvider><Probe /></SettingsProvider>
  )).toBe("<span>off</span>")
})

test("initial prop overrides localStorage (test-only)", () => {
  globalThis.localStorage.setItem(KEY, JSON.stringify({ renderMarkdown: true }))
  expect(renderToStaticMarkup(
    <SettingsProvider initial={{ renderMarkdown: false }}><Probe /></SettingsProvider>
  )).toBe("<span>off</span>")
})
```

> Note: bun's test runner provides a `localStorage` polyfill in recent versions. If the `globalThis.localStorage` calls error, install `@happy-dom/global-registrator` as a dev dep and register it in a `bun:test` setup file. Try running the tests first — only add the polyfill if needed.

- [ ] **Step 2: Run, verify failure**

Run: `bun test src/settings.test.tsx`
Expected: third test fails (no setter), or all fail if `localStorage` undefined.

- [ ] **Step 3: Implement real provider**

Replace `src/settings.tsx` contents:

```tsx
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

export type Settings = { renderMarkdown: boolean }

type Ctx = Settings & { setRenderMarkdown: (v: boolean) => void }

const STORAGE_KEY = "jsonl-fyi:settings"
const DEFAULTS: Settings = { renderMarkdown: true }

const SettingsCtx = createContext<Ctx>({
  ...DEFAULTS,
  setRenderMarkdown: () => {},
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
  // `initial` is for tests; in production the provider seeds from
  // localStorage on first render.
  const [settings, setSettings] = useState<Settings>(() => initial ?? load())

  useEffect(() => {
    if (initial) return // tests inject — do not overwrite their value
    persist(settings)
  }, [settings, initial])

  const value: Ctx = {
    ...settings,
    setRenderMarkdown: v => setSettings(s => ({ ...s, renderMarkdown: v })),
  }
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>
}

export function useSettings(): Ctx {
  return useContext(SettingsCtx)
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `bun test src/settings.test.tsx`
Expected: 3 passing.

- [ ] **Step 5: Run all tests; ensure Markdown tests still pass**

Run: `bun test`
Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add src/settings.tsx src/settings.test.tsx
git commit -m "feat(settings): SettingsProvider with localStorage persistence"
```

---

## Task 6: Wrap app in `<SettingsProvider>`

**Files:**
- Modify: `src/index.tsx`

- [ ] **Step 1: Read current `src/index.tsx`**

Run: `cat src/index.tsx`

- [ ] **Step 2: Wrap `<App />` in `<SettingsProvider>`**

Edit `src/index.tsx` — add the import at the top:

```tsx
import { SettingsProvider } from "./settings"
```

And wrap the rendered tree:

```tsx
root.render(
  <StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </StrictMode>
)
```

> If `src/index.tsx` already has additional providers, place `<SettingsProvider>` outside any transcript-related providers (settings is global) and inside `<StrictMode>`.

- [ ] **Step 3: Run dev server, manually confirm app boots**

Run: `bun run dev` (background), open the app, confirm no console errors.
Stop the dev server when done. (Per repo convention: track the PID, kill before relaunching.)

- [ ] **Step 4: Commit**

```bash
git add src/index.tsx
git commit -m "feat(settings): wrap app in SettingsProvider"
```

---

## Task 7: `SettingsPopover` component using native HTML Popover

**Files:**
- Create: `src/SettingsPopover.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create the popover component**

Create `src/SettingsPopover.tsx`:

```tsx
import { useSettings } from "./settings"

export const SETTINGS_POPOVER_ID = "settings-popover"

export function SettingsPopover() {
  const { renderMarkdown, setRenderMarkdown } = useSettings()
  return (
    <div
      id={SETTINGS_POPOVER_ID}
      // @ts-expect-error: `popover` is a valid HTML attribute, not yet in
      // React's DOM types as of @types/react 19.0
      popover="auto"
      className="settings-popover"
      role="dialog"
      aria-label="Settings"
    >
      <label className="settings-row">
        <input
          type="checkbox"
          checked={renderMarkdown}
          onChange={e => setRenderMarkdown(e.target.checked)}
        />
        <span>Render markdown</span>
      </label>
    </div>
  )
}
```

- [ ] **Step 2: Wire the gear button to the popover**

Edit `src/App.tsx`. Find the gear button:

```tsx
<button
  className="icon-btn settings-btn"
  aria-label="Settings"
  title="Settings"
>
  <GearIcon size={16} />
</button>
```

Replace with:

```tsx
<button
  className="icon-btn settings-btn"
  aria-label="Settings"
  title="Settings"
  // @ts-expect-error: `popoverTarget` not yet in React's button type defs
  popoverTarget={SETTINGS_POPOVER_ID}
>
  <GearIcon size={16} />
</button>
```

Add the import at the top of `src/App.tsx`:

```tsx
import { SettingsPopover, SETTINGS_POPOVER_ID } from "./SettingsPopover"
```

And render `<SettingsPopover />` once, inside the header (next to the button is fine — popovers are positioned via CSS anchor, not DOM order):

```tsx
<button ... popoverTarget={SETTINGS_POPOVER_ID}>
  <GearIcon size={16} />
</button>
<SettingsPopover />
```

- [ ] **Step 3: Manual smoke test**

Run: `bun run dev`. Click gear → popover opens. Click outside → closes. Press Escape → closes. Toggle checkbox → state survives reload (localStorage).

Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add src/SettingsPopover.tsx src/App.tsx
git commit -m "feat(settings): native popover with Render markdown toggle"
```

---

## Task 8: Markdown + popover styles

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Append styles**

Add to `src/styles.css`:

```css
/* ---------- Markdown content ---------- */

.md-content {
  /* Inherit text color/size from parent (assistant-text, tool body, etc.) */
}

.md-content > :first-child {
  margin-top: 0;
}
.md-content > :last-child {
  margin-bottom: 0;
}

/* Headings: semantic tags only — no size or extra margin. */
.md-content h1,
.md-content h2,
.md-content h3,
.md-content h4,
.md-content h5,
.md-content h6 {
  font-size: inherit;
  font-weight: bold;
  margin: 0;
  line-height: inherit;
}

.md-content p {
  margin: 0 0 0.5em;
}
.md-content p:last-child {
  margin-bottom: 0;
}

.md-content .md-list {
  margin: 0 0 0.5em;
  padding-left: 1.4em;
}

.md-content .md-quote {
  border-left: 3px solid var(--border);
  margin: 0 0 0.5em;
  padding: 0 0.8em;
  color: var(--muted);
}

.md-content .md-code-inline {
  background: var(--code-bg);
  border: 1px solid var(--code-border);
  border-radius: 3px;
  padding: 0 0.25em;
  font-size: 0.95em;
}

.md-content .md-code-block {
  background: var(--code-bg);
  border: 1px solid var(--code-border);
  border-radius: 4px;
  padding: 0.5em 0.75em;
  margin: 0 0 0.5em;
  overflow-x: auto;
}
.md-content .md-code-block .md-code {
  background: transparent;
  border: 0;
  padding: 0;
}

.md-content .md-link {
  color: inherit;
  text-decoration: underline;
}

.md-content .md-table {
  border-collapse: collapse;
  margin: 0 0 0.5em;
}
.md-content .md-table th,
.md-content .md-table td {
  border: 1px solid var(--border);
  padding: 0.25em 0.5em;
}

/* Inline mode: unwrap react-markdown's default <p> wrapper so flow is preserved. */
.md-inline > p {
  display: inline;
  margin: 0;
}

/* ---------- Settings popover ---------- */

.settings-popover {
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--fg);
  border-radius: 6px;
  padding: 0.5em 0.75em;
  margin: 0;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
  /* Anchor positioning where supported; fallback uses default popover placement. */
  position-anchor: --settings-anchor;
  top: anchor(bottom);
  right: anchor(right);
  inset-area: bottom span-left;
}

.settings-btn {
  anchor-name: --settings-anchor;
}

.settings-row {
  display: flex;
  align-items: center;
  gap: 0.5em;
  cursor: pointer;
  user-select: none;
}
```

- [ ] **Step 2: Manual visual check**

Run: `bun run dev`. Load `src/__fixtures__/sample.jsonl`. Verify:

1. Assistant prose with bold/italic/lists renders correctly.
2. Headings appear bold, same size as body.
3. Code blocks have background and don't overflow.
4. Popover opens beneath gear button, not floating top-left.

Stop dev server.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "style(markdown): scoped .md-content styles and settings popover"
```

---

## Task 9: Wire `<Markdown>` into transcript surfaces

**Files:**
- Modify: `src/transcript/claude/TextBlock.tsx`
- Modify: `src/transcript/claude/SkillBlock.tsx`
- Modify: `src/transcript/claude/Tool.tsx`

- [ ] **Step 1: Update assistant `TextBlock`**

Edit `src/transcript/claude/TextBlock.tsx`:

```tsx
import { detectSkill } from "./detectSkill"
import { SkillBlock } from "./SkillBlock"
import { Markdown } from "../Markdown"

export function TextBlock({ text, role }: { text: string; role?: string }) {
  if (!text.trim()) return null
  if (role === "user") {
    const skill = detectSkill(text)
    if (skill) return <SkillBlock name={skill.name} body={skill.body} />
    return <div className="user-bubble">{text}</div>
  }
  return (
    <div className="assistant-text">
      <Markdown source={text} />
    </div>
  )
}
```

- [ ] **Step 2: Update `SkillBlock`**

Edit `src/transcript/claude/SkillBlock.tsx`:

```tsx
import { useState } from "react"
import { Markdown } from "../Markdown"

export function SkillBlock({ name, body }: { name: string; body: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="tool-card">
      <button
        className="tool-row clickable"
        onClick={() => setExpanded(!expanded)}
      >
        <span>Skill (/{name})</span>
      </button>
      {expanded && (
        <div className="tool-body">
          <Markdown source={body} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Update `Tool.tsx` — Agent prompt**

In `src/transcript/claude/Tool.tsx`, replace the line in the `Agent` component:

```tsx
{prompt && <pre className="output">{prompt}</pre>}
```

with:

```tsx
{prompt && <Markdown source={prompt} />}
```

- [ ] **Step 4: Update `Tool.tsx` — TodoWrite items**

In the `TodoWrite` component, replace:

```tsx
<span>{status === "in_progress" ? activeForm : content}</span>
```

with:

```tsx
<span>
  <Markdown source={status === "in_progress" ? activeForm : content} inline />
</span>
```

- [ ] **Step 5: Update `Tool.tsx` — ExitPlanMode plan**

In the `ExitPlanMode` component, replace:

```tsx
{plan && <pre className="output">{plan}</pre>}
```

with:

```tsx
{plan && <Markdown source={plan} />}
```

- [ ] **Step 6: Add `Markdown` import at top of `Tool.tsx`**

```tsx
import { Markdown } from "../Markdown"
```

- [ ] **Step 7: Run typecheck and tests**

Run: `bun run check && bun test`
Expected: no errors, all tests pass.

- [ ] **Step 8: Manual verification**

Run: `bun run dev`. Load `src/__fixtures__/sample.jsonl`:

- Assistant prose: markdown renders.
- Toggle "Render markdown" off in popover: prose reverts to plain text with newlines preserved.
- Expand a Skill block: body renders as markdown.
- Find an Agent / Task / TodoWrite / ExitPlanMode block in a transcript that has them — verify rendering.
- Bash output, Read content, Edit diffs, user bubbles: visually unchanged.

Stop dev server.

- [ ] **Step 9: Commit**

```bash
git add src/transcript/claude/TextBlock.tsx src/transcript/claude/SkillBlock.tsx src/transcript/claude/Tool.tsx
git commit -m "feat(markdown): render Markdown in assistant text, skills, plans, agent prompts, and todos"
```

---

## Task 10: Update TODO.md

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Mark item complete**

Change:

```
- [ ] *Render limited agent markdown* wip
```

to:

```
- [x] Render limited agent markdown
```

- [ ] **Step 2: Commit**

```bash
git add TODO.md
git commit -m "chore: mark Render limited agent markdown as done"
```

---

## Self-review

**Spec coverage check:**

- Surfaces table → Tasks 9 (TextBlock, SkillBlock, Agent prompt, TodoWrite items inline, ExitPlanMode plan). ✅
- "Kept as literal text" rule for images / raw HTML / unsafe links → Task 2 plugin + tests. ✅
- Headings semantic with no size bump → Tasks 3 (component override) + 8 (CSS). ✅
- Settings toggle persisted to localStorage → Task 5. ✅
- Native HTML Popover → Task 7. ✅
- `renderMarkdown=false` returns source verbatim → Task 3 short-circuit + test. ✅
- Snapshot test against single fixture → Task 3 + 4. ✅
- Out of scope (syntax highlighting, view modes, user-bubble markdown) → not in plan. ✅

No "TBD"/placeholder strings. All code blocks complete. Type names consistent: `Settings`, `SettingsProvider`, `useSettings`, `Markdown`, `remarkKeepDisallowed`, `remarkInlineOnly` used consistently across tasks.
