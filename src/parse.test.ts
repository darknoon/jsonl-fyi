import { test, expect } from "bun:test"
import { parseJsonl } from "./parse"

test("parseJsonl summarizes a real session correctly", async () => {
  const text = await Bun.file(
    new URL("./__fixtures__/sample.jsonl", import.meta.url),
  ).text()
  const { entries, skipped } = parseJsonl(text)

  // Build a single concise summary string covering: total kept, skipped count,
  // top-level types (sorted), and the sequence of block types per entry.
  const typeCounts = new Map<string, number>()
  for (const e of entries) typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1)
  const types = [...typeCounts.entries()]
    .sort()
    .map(([k, v]) => `${k}=${v}`)
    .join(" ")

  const blockSeq = entries
    .map(e => {
      const c = e.message?.content
      if (!c) return `${e.type}:-`
      if (typeof c === "string") return `${e.type}:str`
      const blocks = c.map(b => {
        if (b.type === "tool_use") return `tool_use(${b.name})`
        if (b.type === "tool_result") return `tool_result`
        return b.type
      })
      return `${e.type}:[${blocks.join(",")}]`
    })
    .join("\n")

  const summary = [
    `entries=${entries.length} skipped=${skipped}`,
    `types: ${types}`,
    `blocks:\n${blockSeq}`,
  ].join("\n")

  expect(summary).toMatchInlineSnapshot(`
    "entries=25 skipped=0
    types: assistant=15 user=10
    blocks:
    user:[image,text]
    assistant:[thinking]
    assistant:[tool_use(ToolSearch)]
    user:[tool_result]
    assistant:[tool_use(mcp__project__RenameChat)]
    user:[tool_result]
    assistant:[tool_use(Agent)]
    user:[tool_result]
    assistant:[tool_use(Read)]
    user:[tool_result]
    assistant:[tool_use(Read)]
    user:[tool_result]
    assistant:[thinking]
    assistant:[text]
    assistant:[tool_use(Edit)]
    user:[tool_result]
    assistant:[tool_use(Edit)]
    user:[tool_result]
    assistant:[text]
    assistant:[tool_use(Edit)]
    user:[tool_result]
    assistant:[text]
    assistant:[tool_use(Read)]
    user:[tool_result]
    assistant:[text]"
  `)
})

test("malformed lines increment skipped, valid lines keep parsing", () => {
  const text = [
    `{"type":"user","message":{"role":"user","content":"hi"}}`,
    `not json`,
    ``,
    `{"type":"file-history-snapshot"}`,
    `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hello"}]}}`,
  ].join("\n")
  const { entries, skipped } = parseJsonl(text)
  const summary = `entries=${entries.length} skipped=${skipped} kept=${entries.map(e => e.type).join(",")}`
  expect(summary).toMatchInlineSnapshot(`"entries=2 skipped=1 kept=user,assistant"`)
})
