import { test, expect } from "bun:test"
import type { CodexEntry } from "./types"
import { buildCodexModelLabels } from "./modelLabeling"

function ctx(model: string, effort?: string): CodexEntry {
  return { type: "turn_context", payload: { model, effort } }
}
function asst(): CodexEntry {
  return {
    type: "response_item",
    payload: { type: "message", role: "assistant", content: [] },
  }
}

test("buildCodexModelLabels: single (model, effort) → models has one entry, no per-turn labels", () => {
  const entries: CodexEntry[] = [ctx("gpt-5.5", "high"), asst(), asst()]
  const sepIndices = new Set([1, 2])
  const out = buildCodexModelLabels(entries, sepIndices)
  expect(out.models).toEqual([{ label: "GPT 5.5/high", raw: "gpt-5.5" }])
  expect(out.byIndex.size).toBe(0)
})

test("buildCodexModelLabels: model change → every separator carries its turn's pair", () => {
  const entries: CodexEntry[] = [
    ctx("gpt-5.5", "high"),
    asst(),
    ctx("gpt-5.2-codex", "high"),
    asst(),
  ]
  const sepIndices = new Set([1, 3])
  const out = buildCodexModelLabels(entries, sepIndices)
  expect(out.models).toEqual([
    { label: "GPT 5.5/high", raw: "gpt-5.5" },
    { label: "GPT 5.2 codex/high", raw: "gpt-5.2-codex" },
  ])
  expect(out.byIndex.get(1)?.raw).toBe("gpt-5.5")
  expect(out.byIndex.get(3)?.raw).toBe("gpt-5.2-codex")
})

test("buildCodexModelLabels: effort change with same model still triggers multi-mode", () => {
  const entries: CodexEntry[] = [
    ctx("gpt-5.5", "high"),
    asst(),
    ctx("gpt-5.5", "medium"),
    asst(),
  ]
  const sepIndices = new Set([1, 3])
  const out = buildCodexModelLabels(entries, sepIndices)
  expect(out.models).toEqual([
    { label: "GPT 5.5/high", raw: "gpt-5.5" },
    { label: "GPT 5.5/medium", raw: "gpt-5.5" },
  ])
  expect(out.byIndex.get(1)?.label).toBe("GPT 5.5/high")
  expect(out.byIndex.get(3)?.label).toBe("GPT 5.5/medium")
})

test("buildCodexModelLabels: separator with no preceding turn_context has no label and is excluded from models", () => {
  const entries: CodexEntry[] = [asst(), ctx("gpt-5.5", "high"), asst()]
  const sepIndices = new Set([0, 2])
  const out = buildCodexModelLabels(entries, sepIndices)
  expect(out.models).toEqual([{ label: "GPT 5.5/high", raw: "gpt-5.5" }])
  expect(out.byIndex.has(0)).toBe(false)
  // Single-config session → no per-turn label
  expect(out.byIndex.has(2)).toBe(false)
})

test("buildCodexModelLabels: toggling back and forth lists every distinct pair once", () => {
  const entries: CodexEntry[] = [
    ctx("gpt-5.5", "high"),
    asst(),
    ctx("gpt-5.5", "medium"),
    asst(),
    ctx("gpt-5.5", "high"),
    asst(),
  ]
  const sepIndices = new Set([1, 3, 5])
  const out = buildCodexModelLabels(entries, sepIndices)
  expect(out.models.map((m) => m.label)).toEqual([
    "GPT 5.5/high",
    "GPT 5.5/medium",
  ])
  expect(out.byIndex.get(1)?.label).toBe("GPT 5.5/high")
  expect(out.byIndex.get(3)?.label).toBe("GPT 5.5/medium")
  expect(out.byIndex.get(5)?.label).toBe("GPT 5.5/high")
})
