# Grok Build Session Support Design

Status: prototype reviewed and approved on 2026-10-12. Single-file scope
confirmed; timing is follow-up work. These notes document the implementation.
Harbor ATIF is outside this work.

## Goal and evidence

Read a Grok Build CLI `chat_history.jsonl` dropped onto jsonl.fyi. Render the
conversation, tool calls, results and embedded images using the existing
viewer controls. Keep the parsing and preprocessing functions portable to
another app, with no React, DOM or application imports.

The format reference is `docs/research/grok-build-format.md`. It describes
one real, private headless session; interactive sessions, multiple prompts,
compaction and reasoning records have not been observed.

Rechecked against the current branch on 2026-10-12 by running the private
history through the existing classifier and Claude parser:

- It classifies as `claude`.
- All 143 records survive parsing, but `getBlocks` returns no content for
  any of them because they have no nested `message`.
- The history contains 1 system record, 3 user records, 40 assistant
  records, 99 tool calls/results and 4 result images.

The initial check confirmed the old parser failure. The prototype has since
been browser-verified with the synthetic fixture and the private history:
99 real tool calls render and all 4 embedded images load and enlarge.
No private screenshots were captured.

After Andrew's image-discoverability feedback, browser checks confirmed
both synthetic images and all 4 private-session images appear immediately
in Default and Chat, outside collapsed groups. Synthetic previews enlarge
with one click, fit on mobile, and retain Compact expansion behavior.

## Approved behavior

Approved: accept `chat_history.jsonl` alone in the first release, update
file-location instructions, and add companion-file timing support in a
follow-up. No new timing-data button or multi-file drop in this release.

The prototype review approved the following copy.

1. **Wrong-file guidance.** Recognize the companion streams and suggest the
   right file. Copy:

   > Drop chat_history.jsonl from the same folder.

   Use for either recognized companion stream, `updates.jsonl` or
   `events.jsonl`. This wording is present in the prototype.

2. **Landing page.** Updating the file-location help is required, as Andrew
   requested on 2026-10-12; see the directory layout and proposed instructions
   below. The prototype adds "Grok Build CLI" to the rotating agent names and
   the accessible list of supported agents. Keep the existing `.jsonl`
   drop text and picker types. Do not add a public example as part of this
   proposal. A dev-only synthetic example provides a direct prototype link.

Use `grok` in code. Single-file v1 has no timestamps, tool durations, token
totals or explicit per-tool outcomes. Terminal failure can still be inferred
from a non-zero `exit:` result line. The follow-up can enrich a history with
timing from `events.jsonl`; its import interaction is not decided here.

## Session directory and file-location instructions

The captured session has this layout. Folder names below are placeholders;
no private session identifiers or working-directory names are included.

```text
~/.grok/sessions/
├── session_search.sqlite             # search index
└── <encoded-project-path>/           # working-directory path; / becomes %2F
    ├── prompt_history.jsonl          # prompts across sessions in this project
    └── <session-id>/
        ├── chat_history.jsonl        # conversation, tool calls/results, images
        ├── updates.jsonl             # UI updates, display diffs, some timing/usage
        ├── events.jsonl              # lifecycle events, tool timings/outcomes
        ├── summary.json              # session title, model, project metadata
        ├── usage.json                # token totals
        ├── rewind_points.jsonl       # file snapshots
        ├── system_prompt.txt
        ├── tool_definitions.json
        ├── prompt_context.json
        ├── resources_state.json
        ├── signals.json
        ├── title_refresh_idx
        ├── terminal/                 # command output logs
        │   └── call-<id>-<n>.log
        └── *.lock
```

Add a `Grok Build CLI` section under "How do I find the .jsonl on my computer?"
with this proposed copy and the existing copyable command component:

> Grok Build CLI saves several files for each session in ~/.grok/sessions/.

```sh
open ~/.grok/sessions/
```

1. Open the folder for your project. Its name is the project path with
   characters encoded, for example `/home/sam/recipes` becomes
   `%2Fhome%2Fsam%2Frecipes`.
2. Open the session folder inside it.
3. Drop `chat_history.jsonl` onto jsonl.fyi. It contains the conversation,
   tool calls, results and embedded images.

Show a compact directory example in the help, highlighting
`<encoded-project-path>/<session-id>/chat_history.jsonl` and distinguishing
it from `updates.jsonl`, `events.jsonl` and the project-level
`prompt_history.jsonl`.

Explain the first release's limitation:

> Timestamps, durations and token usage are stored in other files and won't appear in this view.

This explains the file to choose before an incorrect drop. The wrong-file
message remains a second way to guide users.

## Scope

- Content-based detection, a new Grok sibling tree, and app integration.
- System/context cards, user and assistant text, tool cards and images.
- Normal, Compact and Chat modes using the existing shared components.
- Synthetic fixtures and local verification against the private session.

No ATIF or whole-document JSON intake, folder/multiple-file drop, companion
stream rendering, session metadata import, new persistence behavior, or
unrelated changes to the other format trees.

## Detection and intake

Extend `FormatLabel`, `LoadedSession` and `FileIconFormat` with `grok`.
The session loader preserves streaming file reads and the existing
malformed-line count. A Grok match calls the new parser and renders
`GrokTranscript`; restored text sessions use the same format detection.

Inspect up to the existing first 10 parsed records. Preserve the current
Codex/Pi precedence across that window; Grok evidence must not return early
and mask a later Codex or Pi record. Prefer Grok over the broad Claude
fallback when a record matches either shape:

- `type: "tool_result"` with a string `tool_call_id`; or
- `type: "system" | "user" | "assistant"` with top-level string or array
  `content`, and none of `message`, `uuid`, or `subtype`.

This is a structural heuristic, not a unique Grok signature. Claude system
records can have top-level `content`, which is why the envelope exclusions
matter. Keep the existing Claude fallback. Check the proposed detector
against repository fixtures and local Claude/Codex session headers before
accepting it; report aggregate counts only, with no private content.

Recognize wrong-file hints separately from supported transcript formats.
Check these only after normal classification returns `unknown`. Require
Grok-specific structural evidence rather than filenames or generic ACP
`session/update` records alone:

- Updates: the observed ACP envelope plus xAI-specific method or tool
  metadata, such as `_x.ai/session/update` or `_meta["x.ai/tool"]`.
- Events: the observed `turn_started` envelope with `ts`, `schema_version`,
  `session_id`, `model_id`, `turn_number`, `conversation_message_count`,
  `session_relationship` and `yolo_mode`.

If a truncated or unrelated stream lacks that evidence, retain the ordinary
unsupported-file error. A renamed valid history still loads. A valid
Claude/Codex/Pi transcript named `events.jsonl` still loads normally.

Add Grok Build to the existing generic unsupported-file message.
Do not call these companion streams supported formats.

## Portable data layer

`src/transcript/grok/types.ts` and `parse.ts` own the portable data layer,
including normalized text/image output. They import only format-local pure
code, with no React, DOM or app dependencies. `GrokTranscript.tsx` and
`Tool.tsx` handle rendering, grouping and tool categorization, adapting the
parsed values to shared UI contracts such as `ToolResult` and `ToolDiff`.

Wire shapes:

| Record                   | Fields used                                                     |
| ------------------------ | --------------------------------------------------------------- |
| `system`                 | `content`                                                       |
| `user`                   | `content`, optional `prompt_index`, optional `synthetic_reason` |
| `assistant`              | `content`, optional `model_id`, optional `tool_calls[]`         |
| Tool call                | `id`, `name`, JSON-encoded `arguments`                          |
| `tool_result`            | `tool_call_id`, `content`, optional `images[]`                  |
| Image                    | `type: "image"`, `url`                                          |
| `reasoning` (unobserved) | optional `summary[]` and `content[]` text parts                 |

Parse strings and arrays of text parts without dropping unknown record
types. Preserve unknown records/parts for an expandable generic fallback.
Unexpected field types must not crash the entire transcript. Raw input is
retained for fallback display.

Decode tool argument strings once. If decoding fails or produces something
other than an object, keep the original under `_raw` and use a generic
tool card. Accept already-decoded objects defensively.

Pair results by `tool_call_id` to call `id`, never array position. Display
calls in assistant order even when results arrive in another order. Keep
calls without results and render unmatched results as generic cards. Do
not silently overwrite repeated results or attach one result to multiple
calls with duplicate IDs; retain unmatched/ambiguous records as fallbacks.

Normalize each result once: text content, then its images in array order.
Keep image URLs intact without decoding or duplicating base64 payloads.
Preprocessing must not depend on view mode settings in the app.

## Rendering behavior

| Record                                            | Display                                                                                                                             |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| System                                            | Collapsed `system` card with the complete content on expansion                                                                      |
| User with numeric `prompt_index` (including zero) | User message; remove only an exact outer `<user_query>` wrapper                                                                     |
| User without `prompt_index`                       | Collapsed context card, titled by a recognized leading `user_info` or `system-reminder` tag; otherwise a generic user-context title |
| Assistant                                         | Non-whitespace text, followed by its tool calls                                                                                     |
| Paired result                                     | Inside its tool card                                                                                                                |
| Unmatched result                                  | Generic result card                                                                                                                 |
| Reasoning                                         | Shared `ThinkingBlock` at its position in the conversation                                                                          |
| Unknown record                                    | Expandable generic fallback                                                                                                         |

The unobserved reasoning shape follows the existing research: summary text
parts followed by content text parts. Only synthetic tests can verify it
for now; do not claim real-session reasoning support was browser-tested.

The header shows available `model_id` values in first-seen order. Make
`TranscriptHeader.startTimestamp` optional, omit the date and adjacent
separator punctuation when absent, and leave dated headers unchanged.
Do not fabricate timestamps, duration/usage separators or zero usage.
`TurnSeparator` needs no change for this feature.

Chat mode groups consecutive tool/thinking items with the shared grouped
row. Visible assistant prose, user/context entries, image-bearing calls and
generic fallbacks break groups. Paired result records do not break a group or render twice.
Edits use the shared diff renderer when the group is expanded, matching
the current group behavior.

## Tool cards

Six known tools cover 97 of 99 calls in the observed session:

| Tool                   | Display and category                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `run_terminal_command` | Command, description, optional `block_until_ms`, and output; command category        |
| `read_file`            | Target path, optional offset/limit, numbered text and images; read category          |
| `search_replace`       | Path, old/new text through `EditDiff`, optional `replace_all`, result; edit category |
| `write`                | Path, written content and result; create category                                    |
| `grep`                 | Pattern, glob, optional head limit, result; search category                          |
| `list_dir`             | Target directory and result; command category                                        |

Each known tool destructures its complete input type and passes `...rest`
to `assertExhaustive`. Other tools, including `search_tool` and
`get_command_or_subagent_output`, use a generic card that retains all
arguments and output.

For terminal results only, recognize an initial `exit: <integer>` line;
show the exit code in status/detail and remove that line from the output
body. Non-zero means error. Without that line, preserve the output and do
not infer failure from arbitrary prose. Missing outcomes remain unknown
in the parsed data; the file cannot prove other calls succeeded.

Keep grep output intact in v1, including its `<workspace_result>` wrapper,
so wrapper removal cannot discard scope or other attributes.

## Images and shared components

Andrew requested that image calls be easy to find while scanning a session.
In Normal and Chat views, image results show inline previews immediately,
using `ImageBlock` with click-to-enlarge. Image-bearing calls stay outside
collapsed Chat groups, including known tools such as `read_file`. Compact
view retains its existing tool expansion behavior.
Use the same preview behavior for known and generic Grok tools; shared
`UnknownTool` behavior stays unchanged. Reuse the existing image lightbox
from `origin/main` so embedded data URLs support enlargement and actual-size
viewing instead of opening a blank browser tab.

Reuse existing tool, markdown, diff and image components. Use styling
tokens for any added CSS and the existing file-icon system for Grok.
No new icon asset or external branding dependency is needed.

## Fixtures and privacy

Create a synthetic `src/__fixtures__/grok/recipe-planner/chat_history.jsonl`
from invented material. Document its origin in the fixture README. Include
the observed record structures, all six known tools, both observed fallback
tools, out-of-order results, an empty assistant message, a terminal failure
and tiny invented embedded images. Unit cases separately cover malformed
arguments, unknown records, missing/duplicate IDs and reasoning.

Use synthetic `updates.jsonl` and `events.jsonl` snippets for wrong-file
guidance. Do not copy identifiers, times, paths, prose, code or images from
the private session. The existing anonymization script is insufficient.

The private session may be read and loaded locally for shape checks and
browser verification. It never enters the repository, public examples,
PRs, issues or shared attachments. Use only synthetic content in screenshots
intended for review. Do not push, open a PR, update main or deploy without
Andrew's go-ahead.

## Verification and acceptance

Use neighboring Bun tests to cover detection precedence/regressions,
parsing and pairing, fallback preservation, error inference, grouping,
diffs, images and optional header dates. Verify that the pure data layer
has no React/app imports. Run the existing suite, `bun run check` and
`bun run build`.

With `agent-browser`, use this worktree's dev server on a port other than
the main workspace's 3000 server; leave it running for Andrew's spot-check.

- Drop the synthetic history and inspect Normal, Compact and Chat modes.
- Verify messages, context expansion, paired tool output, edits and images.
- Confirm images appear without expansion in Normal and Chat views,
  including a generic tool result with an image; verify enlargement.
- Confirm Chat image calls remain visible between collapsed tool groups,
  and Compact images appear when their individual tool cards expand.
- Verify both companion-file hints and ordinary unsupported input.
- Verify the file-location help explains the project/session nesting and
  identifies `chat_history.jsonl`; verify rotating agent names if approved.
- Load existing Claude, Codex and Pi examples and inspect for regressions.
- Load the private history locally: confirm Grok classification, 40
  assistant records accounted for, 99 tool calls/results, and all 4 images
  visible without expanding read cards in Normal and Chat. Whitespace-only assistant
  text must not create empty bubbles.
- Report browser errors and responsive interaction from the actual run.

Report separately what passed in unit checks, synthetic browser checks
and the real private session. Do not claim browser results from source
inspection or parser counts.

The prototype was built with sub-agents for the parser, renderer and existing
image viewer integration, then approved after a browser review.
