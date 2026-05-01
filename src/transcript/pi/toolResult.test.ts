import { expect, test } from "bun:test"
import { extractPiToolResult } from "./toolResult"
import type { PiToolResultMessage } from "./types"

function result(overrides: Partial<PiToolResultMessage>): PiToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: "call-1",
    toolName: "read",
    content: [],
    isError: false,
    ...overrides,
  }
}

test("extractPiToolResult: preserves text blocks", () => {
  const out = extractPiToolResult(
    result({
      content: [
        { type: "text", text: "hello" },
        { type: "text", text: "world" },
      ],
    }),
  )
  expect(out.content).toEqual([
    { type: "text", text: "hello" },
    { type: "text", text: "world" },
  ])
  expect(out.isError).toBe(false)
})

test("extractPiToolResult: preserves mixed text/image order", () => {
  const out = extractPiToolResult(
    result({
      content: [
        { type: "text", text: "before" },
        { type: "image", data: "abc", mimeType: "image/png" },
        { type: "text", text: "after" },
      ],
    }),
  )
  expect(out.content).toEqual([
    { type: "text", text: "before" },
    { type: "image", source: { type: "base64", media_type: "image/png", data: "abc" } },
    { type: "text", text: "after" },
  ])
})

test("extractPiToolResult: preserves isError", () => {
  expect(extractPiToolResult(result({ isError: true })).isError).toBe(true)
})
