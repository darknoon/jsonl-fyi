import { test, expect } from "bun:test"
import { parsePiEntries } from "./parse"

const header = {
  type: "session",
  version: 3,
  id: "s1",
  timestamp: "2026-05-01T00:00:00.000Z",
  cwd: "/repo",
}

function msg(id: string, parentId: string | null, role: "user" | "assistant", text: string) {
  return {
    type: "message",
    id,
    parentId,
    timestamp: `2026-05-01T00:00:0${id.length}.000Z`,
    message: { role, content: [{ type: "text", text }] },
  }
}

test("parsePiEntries: preserves header and active linear branch", () => {
  const parsed = parsePiEntries([
    header,
    { type: "model_change", id: "m", parentId: null, timestamp: "t", provider: "openai", modelId: "gpt" },
    msg("u1", "m", "user", "hello"),
    msg("a1", "u1", "assistant", "hi"),
  ])
  expect(parsed.header?.id).toBe("s1")
  expect(parsed.entries.map((e) => e.id)).toEqual(["m", "u1", "a1"])
  expect(parsed.activeEntries.map((e) => e.id)).toEqual(["m", "u1", "a1"])
  expect(parsed.hiddenBranchEntryCount).toBe(0)
  expect(parsed.orphanedEntryCount).toBe(0)
})

test("parsePiEntries: active branch follows last non-session entry", () => {
  const parsed = parsePiEntries([
    header,
    msg("u1", null, "user", "start"),
    msg("a1", "u1", "assistant", "first"),
    msg("u2", "a1", "user", "old branch"),
    msg("a2", "u2", "assistant", "old answer"),
    msg("u3", "a1", "user", "new branch"),
    msg("a3", "u3", "assistant", "new answer"),
  ])
  expect(parsed.activeEntries.map((e) => e.id)).toEqual(["u1", "a1", "u3", "a3"])
  expect(parsed.hiddenBranchEntryCount).toBe(2)
})

test("parsePiEntries: missing parent starts an orphan path", () => {
  const parsed = parsePiEntries([header, msg("u1", "missing", "user", "orphan")])
  expect(parsed.activeEntries.map((e) => e.id)).toEqual(["u1"])
  expect(parsed.orphanedEntryCount).toBe(1)
})

test("parsePiEntries: keeps unknown tree entries with id", () => {
  const parsed = parsePiEntries([
    header,
    { type: "surprise", id: "x", parentId: null, timestamp: "2026-05-01T00:00:01.000Z", payload: { ok: true } },
  ])
  expect(parsed.entries.map((e) => e.type)).toEqual(["surprise"])
  expect(parsed.activeEntries.map((e) => e.id)).toEqual(["x"])
})

test("parsePiEntries: drops malformed objects without id", () => {
  const parsed = parsePiEntries([header, { type: "message", parentId: null }, null, "bad"])
  expect(parsed.entries).toHaveLength(0)
  expect(parsed.activeEntries).toHaveLength(0)
})
