#!/usr/bin/env bun
import { iterJsonlLines } from "../src/parse/iter"
import { classifyJsonl } from "../src/parse/classify"
import { parseCodexEntries } from "../src/transcript/codex/parse"

const path = process.argv[2] ?? "/Users/andrew/.codex/sessions/2026/04/29/rollout-2026-04-29T17-56-12-019ddb3e-1472-7010-9751-927dc6eed3fc.jsonl"
const text = await Bun.file(path).text()

const all: unknown[] = []
for (const v of iterJsonlLines(text)) all.push(v)
console.log("total lines:", all.length)
console.log("classification:", classifyJsonl(all.slice(0, 10)))

const entries = parseCodexEntries(all)
console.log("parsed entries:", entries.length)

const counts = new Map<string, number>()
for (const e of entries) {
  if (e.type === "response_item") {
    const k = `response_item.${e.payload.type}`
    counts.set(k, (counts.get(k) ?? 0) + 1)
  } else {
    counts.set(e.type, (counts.get(e.type) ?? 0) + 1)
  }
}
const toolNames = new Map<string, number>()
for (const e of entries) {
  if (e.type === "response_item" && (e.payload.type === "function_call" || e.payload.type === "custom_tool_call")) {
    toolNames.set(e.payload.name, (toolNames.get(e.payload.name) ?? 0) + 1)
  }
}
console.log("\ntype counts:")
for (const [k, v] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`)
console.log("\ntool names:")
for (const [k, v] of [...toolNames].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`)

// Show first 3 message entries to see content shape
console.log("\nfirst 3 messages:")
let shown = 0
for (const e of entries) {
  if (shown >= 3) break
  if (e.type === "response_item" && e.payload.type === "message") {
    console.log(JSON.stringify(e.payload).slice(0, 200))
    shown++
  }
}
