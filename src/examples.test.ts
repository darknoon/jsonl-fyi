import { test, expect } from "bun:test"
import { exampleStats, formatBytes } from "./examples"

test("formatBytes uses bytes / KB / MB with one decimal", () => {
  expect(formatBytes(0)).toBe("0 B")
  expect(formatBytes(512)).toBe("512 B")
  expect(formatBytes(1024)).toBe("1.0 KB")
  expect(formatBytes(2048)).toBe("2.0 KB")
  expect(formatBytes(1536)).toBe("1.5 KB")
  expect(formatBytes(1024 * 1024)).toBe("1.0 MB")
  expect(formatBytes(1_500_000)).toBe("1.4 MB")
})

test("exampleStats counts turn_duration entries when present", () => {
  const lines = [
    `{"type":"user","message":{"role":"user","content":"hi"}}`,
    `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hello"}]}}`,
    `{"type":"system","subtype":"turn_duration","durationMs":1000,"parentUuid":"a"}`,
    `{"type":"user","message":{"role":"user","content":"again"}}`,
    `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"sure"}]}}`,
    `{"type":"system","subtype":"turn_duration","durationMs":2000,"parentUuid":"b"}`,
  ]
  const content = lines.join("\n")
  const stats = exampleStats(content)
  expect(stats.turns).toBe(2)
  expect(stats.sizeBytes).toBe(content.length)
})

test("exampleStats falls back to user-typed message count when no turn_duration", () => {
  const lines = [
    `{"type":"user","message":{"role":"user","content":"hello"}}`,
    `{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"x","name":"Read","input":{}}]}}`,
    `{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"x","content":"ok"}]}}`,
    `{"type":"user","message":{"role":"user","content":"thanks"}}`,
  ]
  const content = lines.join("\n")
  const stats = exampleStats(content)
  expect(stats.turns).toBe(2)
})

test("exampleStats ignores malformed lines", () => {
  const content = [
    `{"type":"user","message":{"role":"user","content":"hi"}}`,
    `not json`,
    ``,
  ].join("\n")
  expect(exampleStats(content).turns).toBe(1)
})
