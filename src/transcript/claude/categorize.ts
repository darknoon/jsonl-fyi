import type { Category, SummaryCounts } from "../groupSummary"
import type { ClaudeGroupItem } from "../timing"

// On-wire `tool_use.name` strings → category.
// See docs/superpowers/specs/2026-05-11-prose-tool-summary.md for the table.
const CLAUDE_CATEGORIES: Record<string, Category> = {
  Bash: "command",
  Edit: "edit",
  MultiEdit: "edit",
  NotebookEdit: "edit",
  Write: "create",
  Read: "read",
  Grep: "search",
  Glob: "search",
  WebFetch: "web_fetch",
  WebSearch: "web_search",
  Task: "subagent",
  Agent: "subagent",
  SendMessage: "subagent_comm",
  TeamCreate: "command",
  TeamDelete: "command",
  TodoWrite: "todo",
  TaskCreate: "todo",
  TaskUpdate: "todo",
  TaskList: "todo",
  TaskGet: "todo",
  TaskStop: "todo",
  TaskOutput: "todo",
  Skill: "skill",
  EnterPlanMode: "command",
  ExitPlanMode: "command",
  EnterWorktree: "command",
  ExitWorktree: "command",
  AskUserQuestion: "command",
  Mcp: "command",
  ListMcpResources: "command",
  ReadMcpResource: "command",
  ToolSearch: "command",
}

export function categorizeClaudeTool(name: string): Category {
  return CLAUDE_CATEGORIES[name] ?? "command"
}

export function summarizeClaudeGroup(items: ClaudeGroupItem[]): {
  counts: SummaryCounts
  thinkingCount: number
} {
  const counts: SummaryCounts = {}
  let thinkingCount = 0
  for (const it of items) {
    if (it.kind === "thinking") {
      thinkingCount++
      continue
    }
    const cat = categorizeClaudeTool(it.name)
    counts[cat] = (counts[cat] ?? 0) + 1
  }
  return { counts, thinkingCount }
}
