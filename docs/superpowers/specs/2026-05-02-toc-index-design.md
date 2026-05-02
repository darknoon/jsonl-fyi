# Table of Contents / Message Index — design

Status: brainstorm captured, prototype not yet built.

## Goal

Make long transcripts navigable. Today the only way to find a moment is
to scroll. We want a lightweight always-on index that lets you jump to
"the part where I asked X."

## Decisions so far

- **What it indexes:** user turns only (one entry per user message).
  Snippet of the message text is the label.
  - Rationale: a transcript reads as a sequence of user requests +
    agent work; "what I asked for" is the natural mental model. Tool
    calls / assistant headings / subagent dispatches may earn entries
    later but are out of scope for v1.
- **Placement:** right sidebar, sticky, very minimal.
- **Behavior:** scrollspy — the entry for whichever user turn is
  currently in view auto-highlights as you scroll. Click to jump.
  Implement with `IntersectionObserver`.
- **Cross-format:** must work for Claude, Codex, and Pi transcripts.
  Each format's parse output already exposes user-message entries; the
  TOC reads from a small per-format adapter that returns
  `{ id, snippet, anchor }[]`.

## Open: minimal style

Two variants to prototype side-by-side and pick from:

- **A. Dots/ticks** — vertical column of small marks, one per user
  turn. Hover → tooltip with snippet. Click → jump. Most minimal.
- **B. Short text labels** — one truncated line per turn (~30 chars),
  always visible. Slightly louder, readable at a glance.

Build both on `/_design`, compare on real fixtures, then pick (or land
on a hybrid).

## Prototype plan

1. Add a tiny client-side route — no router lib, just check
   `location.pathname` in `App.tsx` and render a `DesignSandbox`
   component when `/_design`. Cloudflare SPA fallback already routes
   unknown paths to `index.html`.
2. `DesignSandbox` loads a fixture transcript from `src/__fixtures__/`
   (pick a long one) and renders the normal transcript view plus
   variants A and B of the TOC pinned right.
3. Implement the TOC as a standalone component that takes
   `{ entries: TocEntry[] }` and an `onJump(id)` callback. Scrollspy
   via `IntersectionObserver` keyed off DOM ids assigned to user-turn
   wrappers.
4. Iterate from there: pick a variant, then promote the chosen one
   into the real app behind whatever toggle/setting is appropriate
   (probably just on by default on wide screens).

## Out of scope for v1

- Indexing tool calls, subagents, compactions, errors.
- Heading-level outline derived from assistant markdown.
- Search / filter inside the TOC.
- Mobile / narrow-screen treatment beyond "hide it."
- Saved scroll position across reloads.

## Notes for the implementer

- User-turn detection per format:
  - Claude: `Entry` with `type === "user"` and human-authored content
    (filter out tool-result-only user entries — see existing parse
    code).
  - Codex: `CodexEntry` user message, similarly filter out
    `<environment_context>` and tool-result wrappers.
  - Pi: see `transcript/pi/parse.ts` — surface only the human input
    entries.
- Snippet: first ~60 chars of the first text block, single line,
  whitespace collapsed.
- Anchor: stable id per user turn (entry uuid where available).
