# Normal (non-verbose) tool row — viewer spec

Audience: building a **web transcript viewer** that should **match Claude Code’s compact inline tool presentation** before expansion.

This document describes **what the user sees**, not implementation. Values like line counts are fixed behaviors to mirror unless you deliberately differ.

---

## Shared chrome (most tools)

- **Leading indicator**
  - **Queued** (waiting to run): dim **bullet** (●).
  - **Running**: animated loading state using the same bullet position.
  - **Finished**: solid bullet; **green** tint if OK, **red** if this tool ended in error.

- **Title**
  - **Bold tool label** — the friendly name (often not the raw API identifier).
  - **Subtitle in parentheses** (optional): appears only when there is short inline detail. If omitted, there are **no** empty parentheses.

- **Below the row** while in progress  
  Messages such as **“Running…”**, **“Waiting…”**, permission/classifier wording, etc., may appear on separate lines beneath the header when applicable.

---

## Bash

### Header / subtitle

- Label is usually **Bash** (or **SandboxedBash** when the sandbox badge applies).
- Subtitle shows the command, with:
  - **At most 2 lines** of command text; then
  - **At most 160 characters** total; excess ends with an **ellipsis (…)**.
- Some sessions use a **short human label** from the command instead (same **160** char cap with ellipsis).
- Certain **in-place file edits via shell** are shown like file edits: subtitle is the **display path** only.

### Collapsed body

- **While running**
  - If there is no output yet: **Running…** plus an elapsed timer when available.
  - If there is output: **last 5 lines** of streamed output (ANSI stripped), dim.
  - Optional status next to it: approximate **line count** (`~N lines`), or **`+N lines`** when only a tail is shown, sometimes with **size** (e.g. formatted bytes).

- **When finished**
  - **Stdout** and **stderr** are separate blocks when both exist.
  - Each block: by default **up to 3 wrapped lines** of content; if more remain, a dim line like **… +N lines** and a hint to expand (e.g. ctrl+o), unless the host UI suppresses that hint.
  - Very long single lines are wrapped to terminal width; truncation math uses a small padding from full width.
  - **No output:** one dim line — e.g. **Done**, **(No output)**, a short **return-code** explanation, or **Running in the background** with a manage hint when applicable.
  - Optional **cwd reset** or **timeout** lines when present.

### Errors

- Red bullet when the tool ended in error.
- Error text: up to **10 lines** shown; remainder summarized as **… +N lines** with expand hint.
- Plain **“Invalid tool parameters”** when the payload was invalid in a recognizable way.

---

## Read

### Header / subtitle

- Label: **Read**, **Reading Plan** (plan files under the plan directory), or **Read agent output** (special task output paths).
- Subtitle: path (short display form). May include **`· pages N`**, **line ranges** in verbose-style transcripts, **`@taskId`** for agent output reads; plan/agent variants may omit redundant parentheses content.

### Collapsed body

- One compact line only, for example:
  - **Read *N* line(s)** (text files)
  - **Read *N* cell(s)** (notebook)
  - **Read PDF (size)** / **Read image (size)**
  - **Read *N* page(s)** (multipart PDF)
  - **Unchanged since last read**

### Errors (compact)

- **File not found** (when indicated by cwd note markers).
- **Error reading file** when a tagged tool error string is present.
- Otherwise generic error formatting (same **10-line** cap pattern as Bash errors).

---

## Edit (single editor tool)

The product exposes one primary **Edit** tool; some transcripts may use another name (e.g. historical aliases) — normalize in your viewer if needed.

### Header / subtitle

- Label: **Create**, **Update**, or **Updated plan** depending on inputs.
- Subtitle is usually the file path link; plan updates may omit extra parentheses content.

### Collapsed body

- **Summarized edits:** **Added *N* line(s)** / **Removed *N* line(s)** (both when relevant).
- **Full diff preview** appears in default (non-subagent-constrained) view: structured diff rendered at **terminal width minus a fixed gutter** (~12 cols).
- **Plan files:** in the default view, sometimes only a dim hint like **`/plan to preview`** instead of an inline diff. In **condensed** (e.g. nested) context the diff may still appear with the counts line only or full diff depending on mode.

### Errors (compact)

- **File must read first** (dim) when that condition is signaled.
- **File not found** / **Error editing file** for other tagged failures.
- Otherwise generic capped error strip.

---

## Write

### Header / subtitle

- Label: **Write** or **Updated plan**.
- Subtitle: path link; plan writes may omit redundant parentheses text.

### Collapsed body

- **Creating a file:** a line **Wrote *N* lines to *path*** plus a **syntax-highlighted snippet of the content — first 10 lines**; if longer, **`… +K lines`** and expand hint.
- **Updating:** same pattern as **Edit** (counts + structured diff).

### Errors

Same family as Edit (Tagged short messages vs generic strip).

---

## Search (Glob + Grep)

Both use the **same** friendly label (**Search**) in the UI though the underlying tool may differ.

### Header / subtitle

- **Search** then **`pattern: "..."`**, and optionally **`path: "..."`** (paths shown in shortened form unless verbose).

### Collapsed body

- One summary line depending on mode, e.g.
  - **Found *N* files**
  - **Found *N* lines** across content mode
  - **Found *N* matches** across *M* files
- Non-verbose: if **`N > 0`**, append **expand shortcut hint** beside the summary.
- Verbose transcripts: extra lines with indent and gutter for listing.

### Errors (compact)

- **File not found** / **Error searching files** vs generic error strip.

---

## Fetch (HTTP)

### Header / subtitle

- Label **Fetch**.
- Non-verbose subtitle: plain **URL**.
- Verbose: `url: "..."`, optional **`prompt:`** field.

### While running

- One dim line: **Fetching…**.

### Collapsed body (success)

- One line: **Received *&lt;formatted size&gt;* (*status code status text*)**.  
- **Fetched body text is omitted** when not verbose.

---

## Web Search

### Header / subtitle

- Label **Web Search**.
- Subtitle: **`"&lt;query&gt;"`**; verbose may append allowed/blocked domain clauses.

### While running / streaming

- **Searching: *&lt;query&gt;***
- Optional: **Found *N* results for "&lt;query&gt;"**

### Collapsed body (success)

- One line: **Did *N* search(es) in *&lt;time&gt;*** (`ms` if under ~1 second, otherwise `s` rounded).

---

## Agent / Task (subagents)

Historical transcripts may say **Task**; current primary name may be **Agent**.

### Header / subtitle

- Label **Agent** by default; **worker** subtype may still display as **Agent**; **other subagent kinds** often show **their subtype name** instead.
- Subtitle usually the **assistant-provided description** when both description and prompt exist; optional dim **model** tag after the header if it differs from the main model.

### Collapsed progress

- Typical: **Initializing…**.
- Normally **latest few nested tool rows** (about **three** logical lines) reflecting child activity; surplus summarized as **`+N more tool uses`**.
- On very tall terminals alternate **condensed stats** (**tool use count**, tokens, expand hint).

### Collapsed completion

- Embedded compact completion line resembling: **Done (*tool uses* · *tokens* · *duration*)** (exact joiner is **middle dot**).
- Optional **expand** hint on the interactive client.

### Errors

- Progress block retained; then standard **truncated multi-line error** strip.

---

## Todo write

### Assistant row

- **No assistant tool-use row.** The friendly label is intentionally **empty**, so nothing appears where **Bash** / **Read** would show bold tool name plus optional parentheses subtitle.

*(You may still show the raw **`tool_use`** payload in an advanced / JSON pane; the canonical Claude Code transcript strip skips this banner.)*

### User / **`tool_result` row (canonical TUI)**

- **No inline block.** Successful completion does not mount a dedicated “tool success” renderer for this tool; checklist changes are reflected elsewhere (session todo UI), not as a prose strip under the turn.

### Model-facing **`tool_result` text**

- The shipped mapping sends **plain prose**, roughly:

  `Todos have been modified successfully. Ensure that you continue to use the todo list to track your progress. Please proceed with the current tasks if applicable`

- Rarely (heuristic gated on product analytics), success may **append an extra NOTE** urging a **verification** sub-agent when several tasks closed without any verification-themed item—the exact wording evolves with prompts; parity viewers should paste the **`tool_result` string verbatim** rather than guessing.

*(If your viewer distinguishes “assistant chip” vs “model echo”, place the prose in the latter only.)*

---

## Plan mode enter / exit

### Assistant row

- **None** — same silent pattern as Todo write (**empty friendly label** ⇒ no Bash-style **`tool_use`** header row).

### Enter plan mode — what renders after acceptance

- **Bullet** tinted like other **plan-mode** cues.
- Same line as bullet: **`Entered plan mode`**
- **Indented dim line:** `Claude is now exploring and designing an implementation approach.`

### Enter plan mode — declined

- **Bullet** at default/neutral cue color.
- Same line as bullet: **`User declined to enter plan mode`**

### Exit plan mode — variants

Roughly stacked like other **MessageResponse**-style tails (narrow gutter indent in the terminal; your web viewer can mimic with a muted left accent).

| Situation | First line(s) | Follow-up |
|-----------|---------------|-----------|
| Empty / no substantive plan body | **`Exited plan mode`** only | — |
| Submitted while awaiting reviewer | **`Plan submitted for team lead approval`** | Dim **`Plan file:`** *relative display path* (if any); dim **`Waiting for team lead to review and approve…`** |
| User approved returned plan body | **`User approved Claude's plan`** | Dim **Plan saved to:** *display path* **·**/plan **to edit** (middle dot separates path from the **`/plan`** slash command hint); Markdown body follows |

**Rejected approval** flows use a distinct **“rejected plan”** composition (human-facing copy varies; retain error/rejection framing rather than the short bullets above).

### Decorative sketch

```text
● Entered plan mode
    Claude is now exploring and designing an implementation approach.

● User declined to enter plan mode

● Exited plan mode

● Plan submitted for team lead approval
  Plan file: plans/….
  Waiting for team lead to review and approve…

● User approved Claude's plan
  Plan saved to: plans/…. · /plan to edit

  # Title from markdown …
  …Markdown body continues…
```

*(Paths mirror **display-only** truncation (e.g. homedir elision)—do not insist on literals from this doc.)*

---

## Notebook edit

### Header / subtitle

- Label **Edit Notebook**.
- Subtitle: path **@&lt;cell id&gt;**; verbose may add first **30** characters of new source and metadata.

### Collapsed body

- **Success:** **Updated cell *&lt;id&gt;*:** plus **full new cell source** in a code block (no separate line cap found for the spec beyond normal terminal wrap).

### Errors

- **Error editing notebook** for tagged failures; or the **raw error string** from the tool result when returned in the payload.

---

## Skill

### Header / subtitle

- Label **Skill**.
- Subtitle: skill name, or **`/&lt;name&gt;`** for legacy slash-command style.

### Collapsed progress

- **Initializing…** or up to about **three** recent nested progress lines; **`+N more tool uses`** when applicable.

### Collapsed result

- Short **byline** style line, e.g. **Successfully loaded skill**, optional **tool count** and **model** mention; forked execution may show **Done** only.

### Errors

- Same progress tail + standard error strip.

---

## Tool search (discover deferred tools)

### Assistant row

- **No assistant tool header** — **empty friendly name** ⇒ no Bash-style **`tool_use`** chip or parentheses subtitle.

### User / **`tool_result` strip (canonical TUI)**

- **Usually nothing.** There is **no wired result renderer** for success — the transcript row remains visually empty while the session may load deferred tools behind the scenes.

### Model-facing **`tool_result` shapes**

- **Hits:** **`tool_result` content uses tool-reference items** listing deferred tools to expand (opaque to prose-only viewers; preserve references or annotate as “references *N* tools” depending on fidelity goals).

- **No hits:** **`tool_result` is plain prose**, starting exactly with **`No matching deferred tools found`**.
  - Optionally continues (same paragraph): **`Some MCP servers are still connecting: … Their tools will become available shortly — try searching again.`** when connection lag is signaled (server identifiers appear only in this sentence).

---

## MCP and unknown tools

### Unknown tool name (not in local registry)

- The inline assistant row may be **omitted** entirely in the real client (with a log on the client side). For a **viewer**, choose: hide, or show a generic **Unknown tool: &lt;name&gt;** row.

### MCP tools

### Header / subtitle

- When input is JSON-like: **`key:`** snippets joined with commas & spaces.
- Inline values may be shortened to roughly **80** characters with ellipsis when “rich MCP output” styling is active.

### While running

- **Running…**; or labeled **progress message** plus **percentage** bar; or **Processing… *&lt;n&gt;***.

### Collapsed body

- Same pipeline as shell text: **wrapped + ~3 logical lines**, overflow **… +N lines** + expand hint; optional **large-response warning** (human-readable token-ish estimate threshold in the tens of thousands).
- Special-case **slack send** compact one-liner in non-verbose when payload matches.

### Errors

- Default to the same **truncated error** presentation as Bash.

---

## Constants worth centralizing in your viewer

| Behavior | Value |
|----------|--------|
| Bash command subtitle max lines | **2** |
| Bash command subtitle max chars | **160** |
| Bash streaming tail lines | **5** |
| Default text block lines (shell-like output) | **3** (with a special case when “only 1 extra line”) |
| Error strip default lines | **10** |
| Write snippet lines | **10** |
| Notebook verbose header snippet | **30** chars |

---

## Version note

Derived from Claude Code terminal (Normal / non-verbose) behavior. Labels and thresholds can change in future releases; re-check against the live app if fidelity is critical.
