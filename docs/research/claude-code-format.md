# Claude Code transcript format — reference

Quick facts about how the viewer consumes Claude Code `.jsonl` transcripts.

## Pairing

Tool calls are paired to results by `tool_use_id`. The pre-pass in
`claude/ClaudeCodeTranscript.tsx` indexes results by id; per-tool components
look up the matching `ToolResult`.

## Tools dispatched in `claude/Tool.tsx`

`Bash`, `Read`, `Edit`, `MultiEdit`, `Write`, `Glob`, `Grep`, `WebFetch`,
`WebSearch`, `Task` / `Agent`, `TodoWrite`, `EnterPlanMode`, `ExitPlanMode`,
`NotebookEdit`, `ToolSearch`, `Skill`. Unknown names fall through to
`UnknownTool`.

## `ToolResult` shape

In `src/types.ts`:

```ts
type ToolResult = {
  text: string
  images: ImageSource[]
  toolRefs: string[]
  isError: boolean
  injectedText?: string  // currently only Skill — full skill markdown body
                         // (with YAML frontmatter at top) injected as a
                         // sibling user message right after the tool_result
}
```

## Where to find real transcripts

`~/.claude/projects/<project>/*.jsonl`
