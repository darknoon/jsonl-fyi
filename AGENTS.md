# Overview

This is a web viewer for `.jsonl` agent transcripts. Drag a file onto it and
it renders the conversation. The claude code and codex harnesses / formats
are supported.

## Directory structure (parallel by format)

```
src/parse/
  classify.ts       # classifyJsonl(lines) → "claude" | "codex" | "unknown"
  iter.ts           # iterJsonlLines(text) generator (format-agnostic)
src/transcript/
  ToolCard.tsx          # shared expandable card
  shared.tsx            # Header / Field / Output / Extras / hasOutput / ToolTitle
  EditDiff.tsx          # shared diff renderer
  Markdown.tsx          # shared markdown renderer
  ImageBlock.tsx        # shared image renderer
  ThinkingBlock.tsx     # shared reasoning block
  TranscriptHeader.tsx  # session header card
  TurnSeparator.tsx     # turn divider
  UnknownTool.tsx       # generic fallback
  claude/               # Claude Code rendering
    parse.ts            # raw lines → Entry[]
    ClaudeCodeTranscript.tsx
    EntryView.tsx
    Tool.tsx            # per-tool dispatcher (Bash/Read/Edit/...)
    SkillBlock.tsx
    TextBlock.tsx
    toolTypes.ts        # input/output type defs per known tool
    extractResult.ts    # ToolResult extraction
  codex/                # Codex rendering
    parse.ts            # raw lines → CodexEntry[]
    CodexTranscript.tsx
    EntryView.tsx
    Tool.tsx            # per-tool dispatcher (shell_command/exec_command/...)
    ApplyPatch.tsx
    CompactedMarker.tsx
    types.ts
    v4a.ts              # Codex V4A patch parser
src/settings.tsx        # user settings + provider
src/SettingsPopover.tsx # settings UI
```

The two format trees are siblings, not subclasses. They share building
blocks, not data shapes.

Bun tests should be written next to the relevant file, eg
v4a.ts
v4a.test.ts

## Format references

- `docs/research/claude-code-format.md` — pairing, dispatched tools,
  `ToolResult` shape.
- `docs/research/codex-format.md` — pairing, stream choice, dispatched
  tools, `<environment_context>` filtering.

Any scripts that may be needed eg for analyzing transcripts can be stored in `scripts/`.

## Where real transcripts live

When debugging or planning features, work from real sessions on disk rather than reading library source:

- Claude: `~/.claude/projects/<project>/*.jsonl`
- Codex: `~/.codex/sessions/**/rollout-*.jsonl`

Project fixtures live in `src/__fixtures__/` and `src/transcript/__fixtures__/`.

## Specs and research

- `docs/superpowers/specs/` — design docs per feature (numbered by date).
  Read the latest before working in an area.
- `docs/research/` — external behavior captures (Claude Code TUI rendering,
  Codex TUI rendering). Reference docs, not specs.
- `docs/codex-corpus-stats.md` — one-shot snapshot of format prevalence
  across the user's local Codex corpus as of 2026-04-29.

## Conventions

- Vite + React + TypeScript + Bun.
- Per-tool components destructure every input field and pass `...rest` to
  `assertExhaustive(rest)` (in `transcript/shared.tsx`) — this catches
  silent dropped fields when input types grow.

### Styling tokens

CSS values must reference tokens defined in `src/styles.css :root`:

- Colors → `var(--color-*)` (e.g. `--color-bg`, `--color-fg`,
  `--color-muted`, `--color-border`, `--color-card`, `--color-code-bg`,
  `--color-code-fg`, `--color-success`, `--color-error`, …)
- Font sizes → `var(--fs-base | --fs-sm | --fs-xs | --fs-mono)`
- Monospace font → `var(--font-mono)` (matches `@pierre/diffs` stack so
  inline code reads consistently with diff bodies)
- Border radii → `var(--radius-xs | sm | md | lg | xl | 2xl | pill)`
  (`--radius-pill` doubles as a circle on square elements)

If no token fits, add one — don't hardcode. Spacing is not yet
tokenized; literal px values are OK for now.

## Verification

UI verification happens via the `agent-browser` skill: start `bun dev`,
drive the page (drag in fixture files, click toggles, take screenshots),
read the captured output. Don't tell the user "please open the browser
and try X" — verify it yourself.

If you are targeting a specific case, eg certain tool calls or images, make sure you have specific .jsonl files ready you can use for verification before starting work, so you can verify you have done it correctly on real data.

At the end of an implementation Andrew will do a final spot-check, so
**leave the dev server running** when you finish a task. Kill any
previous server before launching a new one (don't pile them up), but
don't tear down on completion.

## Deployment

Hosted on Cloudflare Workers (Static Assets), not Pages. Config is
`wrangler.jsonc` — worker name `jsonl-fyi`, custom domains `jsonl.fyi`
and `www.jsonl.fyi`, SPA fallback via `not_found_handling`.

Deploys are triggered by Cloudflare's GitHub integration on every push
to `main` (no GH Actions workflow in this repo). Cloudflare records
each deploy as a GitHub Deployment (visible via `gh api repos/.../deployments`).

To check deploy status:

- `npx wrangler deployments list --name jsonl-fyi` — Workers deploy history
- `curl -sI https://jsonl.fyi/` — confirm the live site responds
