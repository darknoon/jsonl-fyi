# Copy buttons on code/pre blocks

## Goal

Let the user copy code-like content out of a transcript with a single click.
Buttons live inside (or overlaid on) the rendered pre/code element itself —
in the same spirit as ChatGPT's code-fence copy button. Whole-message
copy and tool-card copy are explicitly out of scope for v1.

## Scope

**In:**
- Fenced code blocks rendered by `Markdown.tsx` (`<pre><code>`).
- Tool `<pre className="output">` blocks rendered by `Output` in
  `src/transcript/shared.tsx`.
- `Field` values (rendered as `<code>`) in `src/transcript/shared.tsx`.
- Edit diffs (overlay; pierre/diffs has no built-in copy).
- Other `<pre>` blocks emitted by per-tool dispatchers in `claude/Tool.tsx`,
  `codex/Tool.tsx`, `codex/ApplyPatch.tsx`.

**Deferred:**
- Whole-message copy (assistant text, user bubble, thinking blocks).
- Tool-card-level copy buttons (the card header is reserved for other UI
  including a Raw View toggle).
- Inline `<code>` (would be too noisy).

## Component

`src/transcript/CopyButton.tsx`

```ts
type Props = {
  text: string | (() => string)
  className?: string
  ariaLabel?: string  // default: "Copy"
}
```

Behavior:
- Click → resolve `text` (call thunk if function) → `navigator.clipboard.writeText`.
- On success: render checkmark icon, set `data-copied`, schedule revert in
  1500 ms (cleared on unmount).
- On failure: fall back to `document.execCommand("copy")` via a
  one-shot offscreen textarea. If that also fails, `console.warn` and
  leave the button untouched.
- Renders `<button type="button" className="copy-button [copied]">`.
  Positioning is the parent's job; the component does not own layout.
- Icons: inline Lucide-style SVG (copy + check). No new dependency.

Thunks are supported so callers like `EditDiff` can avoid building a
potentially large find/replace string on every render.

## Integration points

| Site | Copied text | Wrapper change |
|---|---|---|
| `Markdown.tsx` `pre` component | child code text (extracted from React children) | Make `<pre className="md-code-block">` `position: relative`; render `<CopyButton>` as last child |
| `shared.tsx` `Output` | `output.text` | `<pre className="output">` becomes `position: relative`; CopyButton overlay |
| `shared.tsx` `Field` | string form of `value` (only when value is a string or number) | `<dd>` becomes `position: relative`; CopyButton appears on hover of the row |
| `EditDiff.tsx` | thunk → `<<<<<<< OLD\n{oldString}\n=======\n{newString}\n>>>>>>> NEW\n` | Wrap `<FileDiff>` in `<div className="edit-diff-wrap">` (`position: relative`); overlay CopyButton |
| `claude/Tool.tsx`, `codex/Tool.tsx`, `codex/ApplyPatch.tsx` | per-tool — usually a single string field (command, contents, patch) | Apply CopyButton wherever a `<pre>` is emitted directly |

For `Markdown.tsx` we extract code text by walking children: in
react-markdown's `pre` renderer the child is a `<code>` element whose
`children` is the raw string (or array of strings). We collapse to a
single string.

## Diff copy format

We synthesize a string in conflict-marker form because both sides are
arbitrary text and a unified diff would require synthesizing line numbers
that have no meaning here:

```
<<<<<<< OLD
{oldString}
=======
{newString}
>>>>>>> NEW
```

Trailing newline always included.

## Visibility & touch behavior

- Default: `opacity: 0`.
- On the nearest hoverable parent (`:hover`) → `opacity: 1`, transition
  ~120 ms.
- `@media (hover: none)` → always `opacity: 1` (touch).
- `.copy-button--copied` stays opaque regardless of hover so the
  feedback is visible.
- `position: absolute; top: 6px; right: 6px;` by default.

## Styling tokens

Added to `src/styles.css :root` only if needed; otherwise reuse:

- Background: `var(--color-card)` with `var(--color-border)` 1px border.
- Icon color: `var(--color-muted)`; `--color-success` when copied.
- Radius: `var(--radius-sm)`.
- Font/icon size: `var(--fs-xs)` for any text; SVG sized in em.

No new tokens expected.

## Failure modes

- Clipboard rejected (insecure context / permissions): use legacy
  `execCommand("copy")` fallback; if that fails, `console.warn` once.
  No toast — silent UX failure is acceptable for a debug tool.
- Component unmounts during the 1500 ms revert: clear timer in cleanup.

## Tests

`src/transcript/CopyButton.test.tsx` (Bun):
1. Click invokes `navigator.clipboard.writeText` with the static string.
2. Thunk variant: thunk is NOT called until click; on click, returned
   value is what gets written.
3. State toggles to copied after click; reverts to copy after the timer
   advances (use Bun's fake timers).
4. Unmount before revert does not throw.

No DOM integration tests for individual placement sites — those are
verified visually via dev server with the agent-browser skill.

## Out of scope (deferred)

- Whole-message copy (user bubble, assistant prose, thinking).
- Tool-card-level copy.
- Inline `<code>` copy.
- Toast/notification on copy success.
- Settings toggle to disable copy buttons.
