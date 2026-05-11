import { test, expect } from "bun:test"
import { buildPiItems } from "./buildPiItems"
import type { PiContent, PiParsedSession, PiThinkingContent, PiToolCallContent, PiTreeEntry } from "./types"

// Helpers
function mkToolCall(id: string, name: string, args: Record<string, unknown> = {}): PiToolCallContent {
  return { type: "toolCall", id, name, arguments: args }
}

function mkThinking(text: string): PiThinkingContent {
  return { type: "thinking", thinking: text }
}

function mkToolResultEntry(id: string, toolCallId: string): PiTreeEntry {
  return {
    type: "message",
    id,
    parentId: null,
    message: {
      role: "toolResult",
      toolCallId,
      toolName: "read",
      content: [],
    },
  }
}

function mkUserEntry(id: string, text: string): PiTreeEntry {
  return {
    type: "message",
    id,
    parentId: null,
    message: {
      role: "user",
      content: [{ type: "text", text }],
    },
  }
}

function mkAssistantEntry(id: string, content: PiContent[]): PiTreeEntry {
  return {
    type: "message",
    id,
    parentId: null,
    message: {
      role: "assistant",
      content,
    },
  }
}

function mkSession(activeEntries: PiTreeEntry[]): PiParsedSession {
  return {
    header: null,
    entries: [],
    activeEntries,
    hiddenBranchEntryCount: 0,
    orphanedEntryCount: 0,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("buildPiItems chat: 2+ consecutive toolCall blocks → one tool_group", () => {
  const tc1 = mkToolCall("t1", "read", { path: "a.ts" })
  const tc2 = mkToolCall("t2", "bash", { command: "ls" })
  const entry = mkAssistantEntry("m1", [tc1, tc2])
  const session = mkSession([entry])
  const { items } = buildPiItems(session, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(2)
})

test("buildPiItems chat: 3 consecutive toolCalls → tool_group with correct items.length", () => {
  const tc1 = mkToolCall("t1", "read", { path: "a.ts" })
  const tc2 = mkToolCall("t2", "bash", { command: "ls" })
  const tc3 = mkToolCall("t3", "edit", { path: "b.ts", edits: [] })
  const entry = mkAssistantEntry("m1", [tc1, tc2, tc3])
  const session = mkSession([entry])
  const { items } = buildPiItems(session, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(3)
})

test("buildPiItems chat: edit block with N edits → diffs.length === N", () => {
  const tc1 = mkToolCall("t1", "edit", {
    path: "src/foo.ts",
    edits: [
      { oldText: "x", newText: "y" },
      { oldText: "a", newText: "b" },
    ],
  })
  const tc2 = mkToolCall("t2", "bash", { command: "ls" })
  const entry = mkAssistantEntry("m1", [tc1, tc2])
  const session = mkSession([entry])
  const { items } = buildPiItems(session, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  if (groups[0].kind !== "tool_group") throw new Error()
  const item0 = groups[0].items[0]
  if (item0.kind !== "tool") throw new Error()
  expect(item0.diffs).toHaveLength(2)
  expect(item0.diffs[0]).toEqual({
    kind: "edit",
    filePath: "src/foo.ts",
    oldString: "x",
    newString: "y",
  })
  expect(item0.diffs[1]).toEqual({
    kind: "edit",
    filePath: "src/foo.ts",
    oldString: "a",
    newString: "b",
  })
})

test("buildPiItems chat: bash/read blocks → diffs.length === 0", () => {
  const tc1 = mkToolCall("t1", "bash", { command: "ls" })
  const tc2 = mkToolCall("t2", "read", { path: "a.ts" })
  const entry = mkAssistantEntry("m1", [tc1, tc2])
  const session = mkSession([entry])
  const { items } = buildPiItems(session, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  if (groups[0].kind !== "tool_group") throw new Error()
  const item0 = groups[0].items[0]
  const item1 = groups[0].items[1]
  if (item0.kind !== "tool" || item1.kind !== "tool") throw new Error()
  expect(item0.diffs).toHaveLength(0)
  expect(item1.diffs).toHaveLength(0)
})

test("buildPiItems chat: skipBlocks contains exactly the grouped tool indices", () => {
  const tc1 = mkToolCall("t1", "bash", { command: "ls" })
  const tc2 = mkToolCall("t2", "read", { path: "a.ts" })
  const tc3 = mkToolCall("t3", "bash", { command: "pwd" })
  const entry = mkAssistantEntry("m1", [tc1, tc2, tc3])
  const session = mkSession([entry])
  const { skipBlocks } = buildPiItems(session, { viewMode: "chat" })
  const skip = skipBlocks.get("m1")
  expect(skip).toBeDefined()
  // Indices 0, 1, 2 — all 3 tool calls are in the group
  expect(skip?.has(0)).toBe(true)
  expect(skip?.has(1)).toBe(true)
  expect(skip?.has(2)).toBe(true)
  expect(skip?.size).toBe(3)
})

test("buildPiItems chat: single toolCall → solo tool_group, skipBlocks entry exists", () => {
  const tc1 = mkToolCall("t1", "bash", { command: "ls" })
  const entry = mkAssistantEntry("m1", [tc1])
  const session = mkSession([entry])
  const { items, skipBlocks } = buildPiItems(session, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(1)
  expect(skipBlocks.has("m1")).toBe(true)
})

test("buildPiItems normal: zero tool_group and empty skipBlocks", () => {
  const tc1 = mkToolCall("t1", "bash", { command: "ls" })
  const tc2 = mkToolCall("t2", "read", { path: "a.ts" })
  const entry = mkAssistantEntry("m1", [tc1, tc2])
  const session = mkSession([entry])
  const { items, skipBlocks } = buildPiItems(session, { viewMode: "normal" })
  expect(items.filter((i) => i.kind === "tool_group")).toHaveLength(0)
  expect(skipBlocks.size).toBe(0)
})

test("buildPiItems chat: skipBlocks only contains grouped tool call indices, not text block indices", () => {
  const tc1 = mkToolCall("t1", "bash", { command: "ls" })
  const tc2 = mkToolCall("t2", "read", { path: "a.ts" })
  // Content: [text, toolCall, toolCall] — text at 0, tools at 1+2
  const entry: PiTreeEntry = {
    type: "message",
    id: "m1",
    parentId: null,
    message: {
      role: "assistant",
      content: [{ type: "text", text: "hello" }, tc1, tc2],
    },
  }
  const session = mkSession([entry])
  const { skipBlocks } = buildPiItems(session, { viewMode: "chat" })
  const skip = skipBlocks.get("m1")
  expect(skip).toBeDefined()
  // Only indices 1 and 2 (the tool calls)
  expect(skip?.has(0)).toBe(false) // text block not in skip
  expect(skip?.has(1)).toBe(true)
  expect(skip?.has(2)).toBe(true)
  expect(skip?.size).toBe(2)
})

// ---------------------------------------------------------------------------
// Cross-entry grouping tests (Pi emits one toolCall per assistant message)
// ---------------------------------------------------------------------------

test("buildPiItems chat: two assistant entries each with one toolCall, separated by toolResult → group of 2", () => {
  const tc1 = mkToolCall("t1", "edit", { path: "a.ts" })
  const tc2 = mkToolCall("t2", "edit", { path: "b.ts" })
  const session = mkSession([
    mkAssistantEntry("m1", [tc1]),
    mkToolResultEntry("r1", "t1"),
    mkAssistantEntry("m2", [tc2]),
  ])
  const { items } = buildPiItems(session, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(2)
  expect(groups[0].items[0].kind === "tool" && groups[0].items[0].call.id).toBe("t1")
  expect(groups[0].items[1].kind === "tool" && groups[0].items[1].call.id).toBe("t2")
})

test("buildPiItems chat: real user message between two single-tool assistant messages → two solo groups", () => {
  const tc1 = mkToolCall("t1", "read", { path: "a.ts" })
  const tc2 = mkToolCall("t2", "read", { path: "b.ts" })
  const session = mkSession([
    mkAssistantEntry("m1", [tc1]),
    mkUserEntry("u1", "please continue"),
    mkAssistantEntry("m2", [tc2]),
  ])
  const { items } = buildPiItems(session, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(2)
})

// ---------------------------------------------------------------------------
// Thinking absorption tests (new for errata)
// ---------------------------------------------------------------------------

test("buildPiItems chat: thinking + toolCall blocks → group emitted (relaxed threshold)", () => {
  const thinking = mkThinking("let me think")
  const tc1 = mkToolCall("t1", "read", { path: "a.ts" })
  const entry = mkAssistantEntry("m1", [thinking, tc1])
  const session = mkSession([entry])
  const { items } = buildPiItems(session, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(2)
  expect(groups[0].items[0].kind).toBe("thinking")
  expect(groups[0].items[1].kind).toBe("tool")
})

test("buildPiItems chat: 2 toolCalls + 1 thinking interleaved → group with 3 items", () => {
  const tc1 = mkToolCall("t1", "read", { path: "a.ts" })
  const thinking = mkThinking("still thinking")
  const tc2 = mkToolCall("t2", "bash", { command: "ls" })
  const entry = mkAssistantEntry("m1", [tc1, thinking, tc2])
  const session = mkSession([entry])
  const { items } = buildPiItems(session, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(3)
  expect(groups[0].items[0].kind).toBe("tool")
  expect(groups[0].items[1].kind).toBe("thinking")
  expect(groups[0].items[2].kind).toBe("tool")
})

test("buildPiItems chat: thinking block absorbed into skipBlocks", () => {
  const thinking = mkThinking("thinking")
  const tc1 = mkToolCall("t1", "read", { path: "a.ts" })
  // thinking at index 0, toolCall at index 1
  const entry = mkAssistantEntry("m1", [thinking, tc1])
  const session = mkSession([entry])
  const { skipBlocks } = buildPiItems(session, { viewMode: "chat" })
  const skip = skipBlocks.get("m1")
  expect(skip).toBeDefined()
  expect(skip?.has(0)).toBe(true)  // thinking block
  expect(skip?.has(1)).toBe(true)  // tool call
  expect(skip?.size).toBe(2)
})

test("buildPiItems chat: pure thinking block (no tools) → solo thinking-only group", () => {
  const thinking = mkThinking("just thoughts")
  const entry = mkAssistantEntry("m1", [thinking])
  const session = mkSession([entry])
  const { items } = buildPiItems(session, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(1)
  expect(groups[0].items[0].kind).toBe("thinking")
})

test("buildPiItems chat: thinking item has correct entry+blockIndex", () => {
  const thinking = mkThinking("pondering")
  const tc1 = mkToolCall("t1", "bash", { command: "ls" })
  const entry = mkAssistantEntry("m1", [thinking, tc1])
  const session = mkSession([entry])
  const { items } = buildPiItems(session, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  const thinkItem = groups[0].items[0]
  if (thinkItem.kind !== "thinking") throw new Error()
  expect(thinkItem.entry.id).toBe("m1")
  expect(thinkItem.blockIndex).toBe(0)
})

test("buildPiItems chat: thinking label is 'thinking' (lowercase)", () => {
  const thinking = mkThinking("think")
  const tc1 = mkToolCall("t1", "bash", { command: "ls" })
  const entry = mkAssistantEntry("m1", [thinking, tc1])
  const session = mkSession([entry])
  const { items } = buildPiItems(session, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  // Check that the PiGroupItem thinking kind has the right entry/blockIndex
  // (label is attached in PiToolGroupRow, not here)
  if (groups[0].kind !== "tool_group") throw new Error()
  const thinkItem = groups[0].items[0]
  expect(thinkItem.kind).toBe("thinking")
})
