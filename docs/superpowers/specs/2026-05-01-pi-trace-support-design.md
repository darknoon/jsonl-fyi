# Pi Trace Support Design

## Goal

Add read-only support for pi session JSONL files to jsonl.fyi. Users can drag a local pi `.jsonl` session file into the browser and inspect the active transcript path with useful rendering for pi messages and tools. Hugging Face or URL import is out of scope for this first pass.

## Source Format

Pi stores sessions as JSONL under:

```text
~/.pi/agent/sessions/--<cwd-with-slashes-replaced>--/<timestamp>_<uuid>.jsonl
```

The first line is a session header:

```json
{"type":"session","version":3,"id":"...","timestamp":"...","cwd":"..."}
```

Subsequent entries are append-only tree entries with `id`, `parentId`, and `timestamp`. Message entries contain normalized pi messages under `message`:

- `role: "user"`
- `role: "assistant"`
- `role: "toolResult"`
- extended roles such as `bashExecution`, `custom`, `branchSummary`, and `compactionSummary`

Assistant content can include `text`, `thinking`, and `toolCall` blocks. Tool results use `toolCallId`/`toolName` and optional tool-specific `details`.

Pi tools are pi-defined, not model-specific. Built-in tools are `read`, `bash`, `edit`, `write`, `grep`, `find`, and `ls`. Extensions can register arbitrary tools with `pi.registerTool()`, so the renderer must include a generic fallback for custom or unknown tools such as `plan_tracker` and `subagent`.

## Architecture

Add a dedicated pi transcript sibling beside the existing Claude and Codex trees:

```text
src/transcript/pi/
  types.ts
  parse.ts
  PiTranscript.tsx
  EntryView.tsx
  Tool.tsx
```

Update shared app entry points:

- `src/parse/classify.ts` — add `"pi"` format detection.
- `src/App.tsx` — load pi entries and render `PiTranscript`.
- `src/FileIcon.tsx` — add a pi icon/label case.

This keeps pi-specific tree traversal and message shapes isolated while reusing shared transcript building blocks such as `ToolCard`, `Markdown`, `ThinkingBlock`, `ImageBlock`, `EditDiff`, and `UnknownTool`.

As part of the shared renderer contract, `ToolResult` should use one canonical ordered `content` list for text/image output. This is not pi-specific: Claude, Codex, pi, MCP, and extension tools can all produce mixed text/image results where normalization must not move all images after all text. Avoid duplicate normalized fields such as both `images` and `content` containing the same image data.

## Parsing and Branch Selection

`classifyJsonl()` should return `"pi"` only when the first lines contain pi-specific evidence, for example:

- `type: "session"` with numeric `version`, string `id`, and string `cwd`
- `type: "model_change"`
- `type: "thinking_level_change"`

Do not classify pi from `type: "message"` with `message.role` alone; that shape is too generic and appears in multiple agent formats. Message entries can be used as supporting evidence only after a pi-specific header or entry type has been seen.

`parsePiEntries(lines)` should:

1. Preserve the `session` header separately.
2. Keep known pi entry types and tolerate unknown future/custom entries.
3. Index all non-header tree entries by `id`.
4. Choose the active leaf as the last non-`session` entry in file order, matching pi reload behavior.
5. Walk `parentId` from leaf to root, reverse the path, and render only that active path.
6. Compute `hiddenBranchEntryCount = totalTreeEntries - activeEntries.length`.

If hidden entries exist, `PiTranscript` should show a small footnote/banner explaining that entries on other branches are not shown. Full tree UI is a future feature.

If a parent link is missing, parsing should not fail. Treat the orphan path as starting at that orphan and surface the skipped/orphaned count in a non-fatal footnote or extras area.

## Rendering

`PiTranscript` renders the session header first, then active branch entries in order.

Entry rendering:

- `session` header: cwd, session id, timestamp, and `parentSession` when present.
- `model_change` / `thinking_level_change`: compact metadata rows or turn separators.
- `message.role === "user"`: user message block.
- `message.role === "assistant"`: assistant text/thinking/tool blocks.
- `message.role === "toolResult"`: normally paired to a prior tool call; otherwise orphan result fallback.
- `compaction`, `branch_summary`, `custom`, `custom_message`, `label`, and `session_info`: render compactly or with generic fallback where appropriate.

Content block rendering:

- `text` → shared `Markdown`
- `thinking` → shared `ThinkingBlock`
- `image` → shared `ImageBlock`
- `toolCall` → `pi/Tool.tsx`
- any unexpected content block type → shared integrated fallback block, but this is defensive only; pi's expected extensibility point is unknown tool calls, not arbitrary content block types

## Tool Rendering

Pair assistant tool calls with later `toolResult` messages on the active branch using `toolCall.id === toolResult.toolCallId`. Render one expandable `ToolCard` per call. If a result exists without a visible call, render an orphan result fallback.

Tool result normalization should use a shared ordered content list:

```ts
type ToolResultContent =
  | { type: "text"; text: string }
  | { type: "image"; source: ImageSource }
```

`ToolResult` should make `content` the canonical representation rather than storing duplicate `text` or `images` summaries. Shared helpers can derive plain text previews or image counts from `content` when existing UI needs summaries. Claude and Codex should be updated to populate this shared field; pi support should use it from the start.

Known first-pass tools:

- `bash`: command title and shell-style text output.
- `read`: path/line title and output text/image.
- `edit`: path title and `details.diff` through shared `EditDiff` when available.
- `write`: path and content/result summary.
- `grep`, `find`, `ls`: query/path title and text output.
- `plan_tracker`: compact task/status rendering, with text fallback.
- `subagent`: agent/mode summary and final text output, with details available in extras/fallback.

Unknown extension/custom tools use the generic `UnknownTool` path with name, JSON arguments, text/image result content, and optional details extras. The fallback should be format-agnostic and visually integrated with the rest of the transcript: a normal card/header, a short human-readable summary when possible, and raw JSON only in an expandable details area.

## Fixture Strategy

Use a real pi session trace, not a hand-authored fixture. Copy a representative local file from:

```text
~/.pi/agent/sessions/--Users-andrew-Developer-Prefix-jsonl-fyi--/
```

into:

```text
src/transcript/__fixtures__/
```

Keep the original filename, for example:

```text
2026-05-01T19-32-21-877Z_019de507-1cf4-74ae-b5bc-907e992ba866.jsonl
```

Choose the smallest real trace that still covers representative pi behavior, especially tool calls and at least one extension tool if available.

## Tests

Add tests next to the relevant files:

- `src/parse/classify.test.ts`
  - detects pi sessions
  - does not misclassify Claude or Codex fixtures
- `src/transcript/pi/parse.test.ts`
  - active branch reconstruction from `id`/`parentId`
  - hidden branch count
  - missing parent tolerance
  - unknown entry tolerance
- Tool result and pairing tests near `pi/Tool.tsx` or parser helpers
  - converts pi tool results to shared `ToolResult`
  - preserves ordered mixed text/image output
  - pairs calls/results by `id`/`toolCallId`
  - handles missing results
  - handles orphan results

## Error Handling

- Malformed JSON remains handled by existing `iterJsonlLines()` skipped count.
- Unknown entry types and message roles render generically instead of crashing.
- Unexpected content block types are defensive-only. Pi's expected content block types are `text`, `thinking`, `image`, and `toolCall`; unknown tools inside `toolCall` are the normal extensibility case.
- Missing tool result renders the call as having no result.
- Orphan tool result renders as a generic result card.
- Missing parent links do not abort parsing.

## UI Verification

Reuse the existing dev server on port `3000`; do not start another server.

Use browser automation against:

```text
http://localhost:3000
```

Load the real pi fixture and verify:

- file classifies as pi
- header shows pi session metadata
- active branch renders in conversation order
- known tool cards render correctly
- extension/custom tools use polished or generic fallback
- hidden branch footnote appears when applicable
- existing Claude and Codex fixture loading still works

Leave the existing dev server running after verification.

## Future Work

- Full pi tree viewer with selectable branches.
- URL/Hugging Face dataset import.
- More specialized renderers for extension tools.
- Better labels/session name rendering once real traces with those entries are available.
