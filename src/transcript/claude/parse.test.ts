import { test, expect } from "bun:test"
import { parseJsonl } from "./parse"

test("parseJsonl filters and counts entries from the real fixture", async () => {
  const text = await Bun.file(new URL("../../__fixtures__/sample.jsonl", import.meta.url)).text()
  const { entries, skipped } = parseJsonl(text)

  const typeCounts = new Map<string, number>()
  for (const e of entries) typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1)
  const types = [...typeCounts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join(" ")

  const summary = [`entries=${entries.length} skipped=${skipped}`, `types: ${types}`].join("\n")

  expect(summary).toMatchInlineSnapshot(`
    "entries=138 skipped=0
    types: assistant=71 system=12 user=55"
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
  const summary = `entries=${entries.length} skipped=${skipped} kept=${entries.map((e) => e.type).join(",")}`
  expect(summary).toMatchInlineSnapshot(`"entries=2 skipped=1 kept=user,assistant"`)
})
