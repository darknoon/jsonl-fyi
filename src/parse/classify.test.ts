import { test, expect } from "bun:test"
import { classifyJsonl } from "./classify"

test("classifyJsonl: codex from session_meta", () => {
  const lines = [
    { type: "session_meta", payload: { id: "x", cwd: "/" } },
    { type: "response_item", payload: { type: "message", role: "user", content: [] } },
  ]
  expect(classifyJsonl(lines)).toBe("codex")
})

test("classifyJsonl: codex from response_item alone", () => {
  expect(
    classifyJsonl([{ type: "response_item", payload: { type: "reasoning", summary: [] } }]),
  ).toBe("codex")
})

test("classifyJsonl: codex from turn_context", () => {
  expect(classifyJsonl([{ type: "turn_context", payload: { model: "gpt-5" } }])).toBe("codex")
})

test("classifyJsonl: codex from event_msg", () => {
  expect(
    classifyJsonl([{ type: "event_msg", payload: { type: "agent_message", message: "hi" } }]),
  ).toBe("codex")
})

test("classifyJsonl: claude from user/assistant + content array", () => {
  const lines = [
    { type: "user", uuid: "u1", message: { role: "user", content: "hi" } },
    {
      type: "assistant",
      uuid: "a1",
      message: { role: "assistant", content: [{ type: "text", text: "hello" }] },
    },
  ]
  expect(classifyJsonl(lines)).toBe("claude")
})

test("classifyJsonl: claude from system entries (turn_duration)", () => {
  expect(
    classifyJsonl([
      { type: "system", subtype: "turn_duration", parentUuid: "u1", durationMs: 100 },
    ]),
  ).toBe("claude")
})

test("classifyJsonl: pi from session header", () => {
  expect(
    classifyJsonl([
      {
        type: "session",
        version: 3,
        id: "019de507-1cf4-74ae-b5bc-907e992ba866",
        timestamp: "2026-05-01T19:32:21.877Z",
        cwd: "/Users/andrew/Developer/Prefix/jsonl-fyi",
      },
    ]),
  ).toBe("pi")
})

test("classifyJsonl: pi from model_change", () => {
  expect(
    classifyJsonl([
      {
        type: "model_change",
        id: "63ff15ff",
        parentId: null,
        timestamp: "2026-05-01T19:32:21.917Z",
        provider: "openai-codex",
        modelId: "gpt-5.5",
      },
    ]),
  ).toBe("pi")
})

test("classifyJsonl: pi from thinking_level_change", () => {
  expect(
    classifyJsonl([
      {
        type: "thinking_level_change",
        id: "4b424fab",
        parentId: "63ff15ff",
        timestamp: "2026-05-01T19:32:21.917Z",
        thinkingLevel: "medium",
      },
    ]),
  ).toBe("pi")
})

test("classifyJsonl: generic message role alone is unknown", () => {
  expect(
    classifyJsonl([
      {
        type: "message",
        id: "m1",
        parentId: null,
        timestamp: "2026-01-01T00:00:00.000Z",
        message: { role: "user", content: "hello" },
      },
    ]),
  ).toBe("unknown")
})

test("classifyJsonl: unknown when nothing matches", () => {
  expect(classifyJsonl([{ foo: "bar" }, "string", null, 42])).toBe("unknown")
})

test("classifyJsonl: empty input → unknown", () => {
  expect(classifyJsonl([])).toBe("unknown")
})

test("classifyJsonl: prefers codex when both signals present (defensive)", () => {
  expect(
    classifyJsonl([
      { type: "user", message: { role: "user", content: "hi" } },
      { type: "session_meta", payload: { id: "x" } },
    ]),
  ).toBe("codex")
})
