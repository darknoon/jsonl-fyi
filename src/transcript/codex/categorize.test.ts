import { test, expect } from "bun:test"
import { categorizeCodexTool, summarizeCodexGroup } from "./categorize"
import type { CodexGroupItem } from "./buildCodexItems"
import type { CodexResponseItem } from "./types"

const cases: Array<[string, string]> = [
  ["shell", "command"],
  ["shell_command", "command"],
  ["exec_command", "command"],
  ["local_shell", "command"],
  ["write_stdin", "command"],
  ["view_image", "read"],
  ["update_plan", "todo"],
  ["spawn_agent", "subagent"],
  ["followup_task", "subagent_comm"],
  ["resume_agent", "subagent_comm"],
  ["send_input", "subagent_comm"],
  ["send_message", "subagent_comm"],
  ["close_agent", "subagent_comm"],
  ["wait_agent", "command"],
  ["list_agents", "command"],
  ["web_search", "web_search"],
  ["list_mcp_resources", "command"],
  ["list_mcp_resource_templates", "command"],
  ["read_mcp_resource", "command"],
  ["request_permissions", "command"],
  ["request_user_input", "command"],
  ["request_plugin_install", "command"],
]

for (const [name, cat] of cases) {
  test(`Codex: ${name} → ${cat}`, () => {
    expect(categorizeCodexTool(name)).toBe(cat as ReturnType<typeof categorizeCodexTool>)
  })
}

test("Codex: unknown tool name → command", () => {
  expect(categorizeCodexTool("totally_new_tool")).toBe("command")
})

test("Codex: mcp__namespaced → command (default)", () => {
  expect(categorizeCodexTool("mcp__playwright__browser_navigate")).toBe("command")
})

// summarizeCodexGroup
function fn(name: string): CodexGroupItem {
  return {
    kind: "tool",
    name,
    status: "success",
    diffs: [],
    entry: {
      type: "response_item",
      payload: { type: "function_call", name, arguments: "{}", call_id: "c1" },
    } as CodexResponseItem,
  }
}

function applyPatch(patch: string): CodexGroupItem {
  return {
    kind: "tool",
    name: "apply_patch",
    status: "success",
    diffs: [],
    entry: {
      type: "response_item",
      payload: {
        type: "custom_tool_call",
        name: "apply_patch",
        input: patch,
        call_id: "c1",
      },
    } as CodexResponseItem,
  }
}

function thinking(): CodexGroupItem {
  return { kind: "thinking", entry: {} as CodexResponseItem }
}

function v4a(files: Array<{ op: "add" | "update" | "delete"; path: string }>): string {
  const lines = ["*** Begin Patch"]
  for (const f of files) {
    if (f.op === "add") {
      lines.push(`*** Add File: ${f.path}`)
      lines.push("+content")
    } else if (f.op === "delete") {
      lines.push(`*** Delete File: ${f.path}`)
    } else {
      lines.push(`*** Update File: ${f.path}`)
      lines.push("@@")
      lines.push("-old")
      lines.push("+new")
    }
  }
  lines.push("*** End Patch")
  return lines.join("\n")
}

test("summarizeCodexGroup: simple tool tally", () => {
  const items = [fn("exec_command"), fn("exec_command"), fn("view_image")]
  const { counts, thinkingCount } = summarizeCodexGroup(items)
  expect(counts).toEqual({ command: 2, read: 1 })
  expect(thinkingCount).toBe(0)
})

test("summarizeCodexGroup: apply_patch mixed ops split across categories", () => {
  const patch = v4a([
    { op: "add", path: "a.ts" },
    { op: "update", path: "b.ts" },
    { op: "update", path: "c.ts" },
    { op: "delete", path: "d.ts" },
  ])
  const items = [applyPatch(patch)]
  const { counts } = summarizeCodexGroup(items)
  expect(counts).toEqual({ create: 1, edit: 2, delete: 1 })
})

test("summarizeCodexGroup: apply_patch single add → create", () => {
  const items = [applyPatch(v4a([{ op: "add", path: "new.ts" }]))]
  const { counts } = summarizeCodexGroup(items)
  expect(counts).toEqual({ create: 1 })
})

test("summarizeCodexGroup: apply_patch with delete-only → delete", () => {
  const items = [applyPatch(v4a([{ op: "delete", path: "gone.ts" }]))]
  const { counts } = summarizeCodexGroup(items)
  expect(counts).toEqual({ delete: 1 })
})

test("summarizeCodexGroup: counts thinking separately", () => {
  const items = [fn("exec_command"), thinking(), thinking()]
  const { counts, thinkingCount } = summarizeCodexGroup(items)
  expect(counts).toEqual({ command: 1 })
  expect(thinkingCount).toBe(2)
})

test("summarizeCodexGroup: unknown name falls back to command", () => {
  const items = [fn("brand_new_tool")]
  const { counts } = summarizeCodexGroup(items)
  expect(counts).toEqual({ command: 1 })
})
