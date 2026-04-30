# Limited Agent Markdown — Design

Status: draft
Date: 2026-04-29

## Goal

Render a curated subset of Markdown in transcript surfaces that contain
agent-authored prose. Anything we don't render keeps its original
characters as literal text — we never silently drop content. The behavior
is gated by a user-toggleable setting in the gear menu so a transcript can
always be viewed as raw text.

## Surfaces

| Surface | Mode | Component (today) |
| --- | --- | --- |
| Assistant text | Block | `claude/TextBlock.tsx` (role ≠ user branch) |
| `ExitPlanMode` plan | Block | tool card for `ExitPlanMode` |
| Skill body | Block | `claude/SkillBlock.tsx` |
| `Agent` / `Task` tool `prompt` field | Block | tool card for `Agent` / `Task` |
| `TodoWrite` item `content` | Inline-only | tool card for `TodoWrite` |
| User text bubble | Off | `claude/TextBlock.tsx` (role === user branch) |
| Tool outputs (Bash, Read, generic `<pre>`) | Off | `transcript/shared.tsx` `Output` |
| EditDiff bodies | Off | `transcript/EditDiff.tsx` |

"Block" means full block-level rendering: paragraphs, lists, headings,
fenced code blocks, blockquotes, GFM tables, GFM task lists, GFM
strikethrough, autolinks. "Inline-only" means a constrained set:
emphasis, strong, inline code, links, line breaks. Block constructs
inside inline-only surfaces render as their literal source text.

## Feature set

Rendered:

- Paragraphs and soft/hard breaks
- `**strong**`, `*emphasis*`, `~~strike~~`
- Inline `` `code` `` and fenced code blocks (no syntax highlighting yet;
  fence info string is preserved as `data-lang` on the `<code>` element
  for future use)
- Unordered and ordered lists, including GFM task list items
- Block quotes
- Headings `h1`–`h6` (see "Headings" below)
- Thematic breaks (`---`)
- GFM tables
- Links with `http`, `https`, `mailto` schemes — opened in a new tab
  (`target="_blank" rel="noreferrer noopener"`)
- Autolinks (GFM)

Not rendered — kept as literal source text:

- Images (`![alt](src)`)
- Raw inline or block HTML
- Links with any other URL scheme (e.g. `javascript:`, `data:`,
  `file:`)

"Kept as literal source text" means: the user sees exactly the
characters that appeared in the JSONL, with no formatting applied.
Nothing is silently dropped.

## Headings

Headings render with their semantic tag (`<h1>`–`<h6>`) but no visual
size or weight differentiation between levels and no extra vertical
margin. CSS scoped to `.md-content`:

```css
.md-content h1,
.md-content h2,
.md-content h3,
.md-content h4,
.md-content h5,
.md-content h6 {
  font-size: inherit;
  font-weight: bold;
  margin: 0;
}
```

This gives a single bold line that flows in normal paragraph rhythm.
Existing in-app headings (e.g. `<h1>jsonl.fyi</h1>` in the app header)
are outside `.md-content` and unaffected.

## Renderer module

New file `src/transcript/Markdown.tsx` exporting one component:

```tsx
<Markdown source={text} />          // block mode (default)
<Markdown source={text} inline />   // inline-only mode
```

Built on `react-markdown` + `remark-gfm`.

A small custom remark plugin, `remark-keep-disallowed`, walks the AST
before render and converts unsupported nodes back into text nodes
containing their original Markdown source:

- `image` → text node `![alt](src)` (alt and title preserved)
- `html` → text node containing the raw HTML string
- `link` whose URL scheme is not `http`/`https`/`mailto` → text node
  `[text](url)`

`react-markdown` is configured with `urlTransform` defaulting to
identity for the allowed schemes; the plugin handles the disallowed
ones up-front so we never render an `<a>` with an unsafe `href`.

In inline mode, `disallowedElements` excludes block-level tags (`h1`
through `h6`, `ul`, `ol`, `li`, `pre`, `code` block, `blockquote`,
`table`, `thead`, `tbody`, `tr`, `th`, `td`, `hr`). The rendered
output unwraps their children. The literal source for those
constructs (e.g. a `# heading` line) is preserved by a second pass of
`remark-keep-disallowed` configured for inline mode, which converts
the disallowed AST nodes to text rather than letting react-markdown
silently strip them.

All rendered elements receive class names prefixed `md-` (`md-list`,
`md-code`, `md-heading`, `md-link`, `md-table`, ...) so styling is
scoped via `.md-content` in `styles.css`.

## Settings

State lives in a `SettingsContext` defined in `src/settings.tsx`:

```ts
type Settings = { renderMarkdown: boolean }
```

Default: `{ renderMarkdown: true }`. Persisted to `localStorage` under
the key `jsonl-fyi:settings` as a single JSON blob, so future settings
can be added without a migration.

The gear button in the app header opens a dropdown popover anchored
beneath it. Uses the native HTML Popover API: the gear button gets
`popovertarget="settings-popover"` and the popover is a `<div
id="settings-popover" popover>` element. The browser handles
light-dismiss (outside click, Escape) and focus management for free,
so no custom click-outside handler or escape-key listener is needed.
Positioning is via CSS anchor positioning (`anchor-name` on the gear
button, `position-anchor` on the popover) with a `top`/`bottom`
fallback for browsers that don't yet support anchor positioning.
Contents (for now):

```
[✓] Render markdown
```

A single checkbox row. Toggling flips `renderMarkdown` and writes
through to `localStorage` immediately. Keyboard accessibility comes
from the native popover behavior (gear toggles open/closed, focus
moves into the popover, Escape closes).

When `renderMarkdown === false`, `<Markdown>` short-circuits to:

- Block mode: `<div className="assistant-text" style={{whiteSpace:"pre-wrap"}}>{source}</div>`
- Inline mode: `<>{source}</>`

i.e. exactly today's behavior. The toggle is a real on/off switch.

## Call site changes

- `claude/TextBlock.tsx` — assistant branch renders `<Markdown source={text} />`. User branch unchanged.
- `claude/SkillBlock.tsx` — body renders `<Markdown source={body} />`.
- Tool card for `ExitPlanMode` — `plan` renders `<Markdown source={plan} />`.
- Tool card for `Agent` / `Task` — `prompt` renders `<Markdown source={prompt} />`. Other fields (`description`, `subagent_type`, `model`, etc.) stay as today.
- Tool card for `TodoWrite` — each item's `content` renders `<Markdown source={content} inline />`. `activeForm` and `status` unchanged.

Tool outputs, Bash output, Read content, EditDiff bodies, and user
text bubbles continue to render exactly as today.

## Dependencies

Adds `react-markdown` and `remark-gfm` to `dependencies`. Bundle cost
~40 KB gzipped combined. No other new dependencies — sanitization is
handled by react-markdown's allowlist plus the custom plugin, not by
DOMPurify.

## Testing

Unit tests:

- `remark-keep-disallowed`: round-trip image, raw HTML, and
  non-http/https/mailto link nodes back to literal text containing
  the original Markdown source.
- `<Markdown>` inline mode: `# heading\n- item` renders as literal
  text (no `<h1>`, no `<ul>`); inline `**bold**` and inline code
  still render.
- `<Markdown>` with `renderMarkdown: false` returns the source
  verbatim in both modes.
- Heading levels `h1`–`h6` all render with the semantic tag.

Snapshot test against a single fixture
(`src/transcript/__fixtures__/markdown-sample.md`) exercising
emphasis, strong, strikethrough, inline code, fenced code block (with
language tag), nested unordered list, ordered list, task list,
headings, blockquote, GFM table, a safe `https://` link, an image, a
`javascript:` link, and raw HTML. Two snapshots are taken — block
mode and inline mode — so regressions in either mode show up.

The block-mode snapshot covers the three "kept as literal" rules in
one line:

```html
<p>A <a class="md-link" href="https://example.com" target="_blank"
rel="noreferrer noopener">safe link</a>, an
![image](https://ex.com/i.png), a [bad link](javascript:alert(1)),
and some &lt;b&gt;raw HTML&lt;/b&gt;.</p>
```

The image, the `javascript:` link, and the raw HTML round-trip back
to their original Markdown source as text content; only the safe
link becomes an `<a>`. The inline-mode snapshot additionally shows
that headings, lists, code blocks, blockquotes, and tables in the
same fixture appear as literal source lines.

Manual:

- Load `src/__fixtures__/sample.jsonl`, toggle "Render markdown" in the
  settings popover, confirm assistant prose changes between rendered
  and raw views.
- Confirm Edit diffs, Bash outputs, and user bubbles do not change
  with the toggle.
- Reload the page and confirm the toggle persists.

## Out of scope (deferred)

- Syntax highlighting in fenced code blocks (separate TODO).
- View mode dropdown — Compact / Normal / Expanded / Raw (separate
  TODO; the settings popover is built so it can host this control
  later).
- Markdown rendering in user text bubbles.
- Sanitizing or rendering the small subset of HTML that appears in
  some agent outputs (e.g. `<details>`); for now it stays as literal
  text per the rule above.
