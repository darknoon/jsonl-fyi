# Pi tools

Living doc — what each tool does, what it emits in transcripts, and
non-obvious wire behavior.

## What Pi is

Open-source TypeScript coding-agent CLI by Mario Zechner (badlogic). Powers
Armin Ronacher's "OpenClaw."

- Repo: https://github.com/earendil-works/pi
- Older mirror: https://github.com/badlogic/pi-mono

## Primary sources

- Core built-in zod schemas (TS):
  https://github.com/earendil-works/pi/tree/main/packages/coding-agent/src/core/tools
- No published JSON schema or `.d.ts` for the wire format — the zod files
  above are the source of truth.

## Tool catalog

Core ships only 7 tools. Everything else is an extension or third-party
skill pack.

### Core

- **`bash`** — runs a shell command.
- **`read`** — reads a file.
- **`write`** — writes a file (create or overwrite, indistinguishable on the
  wire).
- **`edit`** — string-replacement edit on an existing file. Pi's `edit` input
  carries an `edits[]` array, so a single call can perform multiple
  replacements on the same file (similar to Claude's `MultiEdit`).
- **`grep`** — content search.
- **`find`** — filename search (Pi's analog of `Glob`).
- **`ls`** — directory listing.

### Extensions / third-party (observed in fixtures, not in core)

- **`subagent`** — from Pi's example extension at
  `packages/coding-agent/examples/extensions/subagent/`. Pi explicitly notes
  "No sub-agents" in core; this is opt-in. Single tool that supports three
  call-time modes: `Single` (`{agent, task}`), `Parallel` (`{tasks: [...]}`),
  and `Chain` (`{chain: [...]}` with `{previous}` interpolation between
  steps). Each invocation spawns an isolated `pi` process that runs to
  completion. **No separate wait/message primitive** — interaction is
  declared up-front at the call boundary, so Pi has no `subagent_comm`
  analog to Claude's `SendMessage` or codex's `followup_task`.
- **`plan_tracker`** — from https://github.com/coctostan/pi-superpowers-plus,
  a third-party skill pack. Tracks task lists.

## Non-obvious shapes

- **No first-class web tools.** Web access happens via `bash` (curl/wget).
- **No skill-loading tool in transcripts.** Skills are loaded out-of-band
  (similar to codex `AGENTS.md`), so they never appear as tool calls.
- **`edit` `edits[]` array** — a single `edit` call may apply N
  replacements; counts as one logical edit on one file.
- **Lowercase names.** Unlike Claude (`Bash`, `Read`) and most codex tools.
