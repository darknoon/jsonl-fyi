import { test, expect } from "bun:test"
import { categorizePiTool, summarizePiGroup } from "./categorize"
import type { PiGroupItem } from "./buildPiItems"

const cases: Array<[string, string]> = [
  ["bash", "command"],
  ["edit", "edit"],
  ["write", "create"],
  ["read", "read"],
  ["grep", "search"],
  ["find", "search"],
  ["ls", "command"],
  ["subagent", "subagent"],
  ["plan_tracker", "todo"],
]

for (const [name, cat] of cases) {
  test(`Pi: ${name} → ${cat}`, () => {
    expect(categorizePiTool(name)).toBe(cat as ReturnType<typeof categorizePiTool>)
  })
}

test("Pi: unknown tool name → command", () => {
  expect(categorizePiTool("totally_made_up")).toBe("command")
})

function tool(name: string): PiGroupItem {
  return {
    kind: "tool",
    name,
    status: "success",
    diffs: [],
    call: { type: "tool-call", id: "x", name, arguments: {} } as unknown as PiGroupItem extends {
      kind: "tool"
      call: infer C
    }
      ? C
      : never,
  }
}

function thinking(): PiGroupItem {
  return { kind: "thinking" } as unknown as PiGroupItem
}

test("summarizePiGroup: tallies tool counts", () => {
  const items = [tool("bash"), tool("bash"), tool("edit"), tool("write")]
  const { counts, thinkingCount } = summarizePiGroup(items)
  expect(counts).toEqual({ command: 2, edit: 1, create: 1 })
  expect(thinkingCount).toBe(0)
})

test("summarizePiGroup: counts thinking separately", () => {
  const items = [tool("bash"), thinking(), thinking(), thinking()]
  const { counts, thinkingCount } = summarizePiGroup(items)
  expect(counts).toEqual({ command: 1 })
  expect(thinkingCount).toBe(3)
})
