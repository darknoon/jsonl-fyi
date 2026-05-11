import { test, expect } from "bun:test"
import { categorizeClaudeTool, summarizeClaudeGroup } from "./categorize"
import type { ClaudeGroupItem } from "../timing"
import type { ToolUseBlock } from "../../types"

// Cover every row in the spec's Claude table.
const cases: Array<[string, string]> = [
  ["Bash", "command"],
  ["Edit", "edit"],
  ["MultiEdit", "edit"],
  ["NotebookEdit", "edit"],
  ["Write", "create"],
  ["Read", "read"],
  ["Grep", "search"],
  ["Glob", "search"],
  ["WebFetch", "web_fetch"],
  ["WebSearch", "web_search"],
  ["Task", "subagent"],
  ["Agent", "subagent"],
  ["SendMessage", "subagent_comm"],
  ["TeamCreate", "command"],
  ["TeamDelete", "command"],
  ["TodoWrite", "todo"],
  ["TaskCreate", "todo"],
  ["TaskUpdate", "todo"],
  ["TaskList", "todo"],
  ["TaskGet", "todo"],
  ["TaskStop", "todo"],
  ["TaskOutput", "todo"],
  ["Skill", "skill"],
  ["EnterPlanMode", "command"],
  ["ExitPlanMode", "command"],
  ["EnterWorktree", "command"],
  ["ExitWorktree", "command"],
  ["AskUserQuestion", "command"],
  ["Mcp", "command"],
  ["ListMcpResources", "command"],
  ["ReadMcpResource", "command"],
  ["ToolSearch", "command"],
]

for (const [name, cat] of cases) {
  test(`Claude: ${name} → ${cat}`, () => {
    expect(categorizeClaudeTool(name)).toBe(cat as ReturnType<typeof categorizeClaudeTool>)
  })
}

test("Claude: unknown tool name → command", () => {
  expect(categorizeClaudeTool("SomethingNew")).toBe("command")
})

test("Claude: mcp__namespaced → command (default)", () => {
  expect(categorizeClaudeTool("mcp__playwright__browser_navigate")).toBe("command")
})

// summarizeClaudeGroup
function tool(name: string): ClaudeGroupItem {
  return {
    kind: "tool",
    name,
    status: "success",
    diffs: [],
    block: { type: "tool_use", id: "x", name, input: {} } as unknown as ToolUseBlock,
  }
}

function thinking(): ClaudeGroupItem {
  return { kind: "thinking" } as unknown as ClaudeGroupItem
}

test("summarizeClaudeGroup: tallies tool counts by category", () => {
  const items = [tool("Bash"), tool("Bash"), tool("Edit"), tool("Read"), tool("Write")]
  const { counts, thinkingCount } = summarizeClaudeGroup(items)
  expect(counts).toEqual({ command: 2, edit: 1, read: 1, create: 1 })
  expect(thinkingCount).toBe(0)
})

test("summarizeClaudeGroup: counts thinking separately", () => {
  const items = [tool("Bash"), thinking(), thinking(), tool("Edit")]
  const { counts, thinkingCount } = summarizeClaudeGroup(items)
  expect(counts).toEqual({ command: 1, edit: 1 })
  expect(thinkingCount).toBe(2)
})

test("summarizeClaudeGroup: empty input → empty counts and zero thinking", () => {
  const { counts, thinkingCount } = summarizeClaudeGroup([])
  expect(counts).toEqual({})
  expect(thinkingCount).toBe(0)
})
