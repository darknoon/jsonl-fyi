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

## Session data: what may be committed

This repository is public. Reading real sessions locally is fine; putting
anything from them in the repo is not, unless it is on the allowed list.
"Anything" includes prose: a format doc, spec, fixture README or test name
can disclose a session as completely as the session file can.

Allowed:

- **Synthetic sessions**, written for the test, with invented prompts,
  output, paths, identifiers, model labels and timestamps. This is the
  default. Put a README beside them saying so, like
  `src/__fixtures__/grok/recipe-planner/README.md`.
- **Andrew's own sessions working on jsonl-fyi**, under their original
  filename, only after Andrew approves that file. Check it first for
  secrets and for content pulled in from other projects.
- **Sessions that are already public**, or that their author supplied for
  this purpose (for example attached to a GitHub issue), with the source
  noted.

Not allowed, in any form:

- Sessions from paid or company work: evaluations, benchmark runs, client
  projects, or anything from another project's bb thread storage
  (`~/.bb/thread-storage/`). A clean credential scan does not make a
  session publishable, and a trimmed or redacted one is still that session.
- Sessions from Andrew's other projects.
- Where a sample came from: the agent or model being evaluated, benchmark,
  dataset, task or client names, per-sample counts and statistics, run
  dates, local paths and thread ids.

"In any form" covers fixtures, `docs/research/` notes, specs and plans,
fixture READMEs, test names and strings, scripts and their default paths,
example sessions in `src/examples.ts`, commit messages, PR titles,
descriptions and comments, and PR screenshots.

When private sessions taught you a format:

- Document structure only: record and field names, types, enum values and
  how records join. Every example is invented.
- Do not describe the samples themselves, not even "one private benchmark
  run". Keep provenance notes and audit output in thread storage.
- Write the fixture from scratch. Do not reuse the samples' prompts,
  subjects, file names or identifiers.
- Ask Andrew to read the docs, fixture and PR text before the first push.
  Then search the diff for paths and thread ids, and for every model,
  benchmark, task and client name in your brief or the samples:

  ```sh
  git diff origin/main... | grep -nE '/Users/|/home/|thread-storage|thr_[a-z0-9]{10}'
  ```

A pushed commit cannot be fully withdrawn. GitHub keeps it reachable by
hash until GitHub Support purges it, and PR description edits keep their
history. When unsure, ask before committing.

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

UI verification happens via the `agent-browser` skill: first check whether
there is already a dev server running for the current workspace. If working
in a worktree, use that worktree's dev server; if working in the main
workspace, use the normal port 3000 server. If no appropriate server is
running, start `bun dev` on the appropriate port, then drive the page (drag
in fixture files, click toggles, take screenshots), read the captured output.
Don't tell the user "please open the browser and try X" — verify it yourself.

If you are targeting a specific case, eg certain tool calls or images, make sure you have specific .jsonl files ready you can use for verification before starting work, so you can verify you have done it correctly on real data.

At the end of an implementation Andrew will do a final spot-check, so
**leave the dev server running** when you finish a task. If you are working
in the main workspace, reuse port 3000 and avoid piling up duplicate main
servers. If you are working in a worktree, **do not kill or replace the main
workspace dev server on port 3000**; start the worktree dev server on a
different port such as 3001 and verify against that URL instead. Do not tear
down the relevant dev server on completion.

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

## Development process

### Features

_You be starting in a new session part way though this process_

1. When instructed take a TODO from TODO.md and interview user about how it should be spec'd
2. Write spec using /brainstorming skill
3. User reviews spec
4. Write plan
5. User reviews plan. may request changes
6. We start working on it
   1. we always use sub-agent-driven development
   2. sometimes we use worktrees (ask me)

### Brainstorming

NO: "Some of what we're working on might be easier to explain if I can show it to you in a web browser"
YES:"I want to show you this potential design for X, I have 2 options I can show you in a web browser"

### Quick design tweaks

Don't need a whole spec/ plan/ process, but you should consider the approach and consult the user before editing the code.

### Worktrees

In ./.worktrees/ to avoid conflicts with other agents running concurrently.
Default to worktrees for feature work.

Hard rules:

- The repository root (`/Users/andrew/Developer/Prefix/jsonl-fyi`) is the main
  workspace. Do **not** check out feature branches, start rebases, cherry-pick
  feature commits, or resolve feature conflicts there.
- Before any `git checkout`, `git switch`, `git rebase`, `git merge`, or
  `git cherry-pick`, run `pwd` and `git rev-parse --show-toplevel`. If the
  top-level path is the main workspace, stop unless the user explicitly asked
  you to operate on main.
- Feature branch integration/rebase work must happen in a separate worktree
  under `.worktrees/`, e.g. `.worktrees/<feature-name>`.
- Never create merge commits for feature integration. Rebase/cherry-pick to a
  linear branch, verify, then check with Andrew before updating `main`.
- If you accidentally put the main workspace into a rebase/merge/conflict
  state, stop immediately and ask before running more git commands.
