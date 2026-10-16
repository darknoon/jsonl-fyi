import { test, expect } from "bun:test"
import { classifyJsonl, detectGrokCompanion } from "./classify"

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

test("classifyJsonl: Grok flat message and standalone result shapes", () => {
  expect(classifyJsonl([{ type: "system", content: "Maintain recipes" }])).toBe("grok")
  expect(
    classifyJsonl([
      { type: "user", content: [{ type: "text", text: "Make soup" }], prompt_index: 0 },
    ]),
  ).toBe("grok")
  expect(
    classifyJsonl([{ type: "assistant", content: "", model_id: "grok-test", tool_calls: [] }]),
  ).toBe("grok")
  expect(
    classifyJsonl([{ type: "tool_result", tool_call_id: "recipe-call", content: "Soup" }]),
  ).toBe("grok")
})

test("classifyJsonl: flat Claude system content keeps its Claude envelope", () => {
  for (const envelope of [
    { uuid: "synthetic" },
    { subtype: "notice" },
    { message: { content: "hello" } },
  ]) {
    expect(classifyJsonl([{ type: "system", content: "Notice", ...envelope }])).toBe("claude")
  }
})

test("classifyJsonl: later Codex/Pi evidence takes precedence over Grok in the ten-line window", () => {
  const grok = { type: "system", content: "Maintain recipes" }
  expect(classifyJsonl([grok, ...Array(8).fill(null), { type: "session_meta" }])).toBe("codex")
  expect(classifyJsonl([grok, { type: "model_change" }])).toBe("pi")
  expect(
    classifyJsonl([grok, { type: "session", version: 1, id: "synthetic", cwd: "/recipes" }]),
  ).toBe("pi")
  expect(classifyJsonl([grok, ...Array(9).fill(null), { type: "session_meta" }])).toBe("grok")
})

test("Grok companion detection requires xAI evidence inside an updates envelope", () => {
  const generic = {
    method: "session/update",
    timestamp: 0,
    params: { sessionId: "synthetic", update: { sessionUpdate: "tool_call" } },
  }
  expect(detectGrokCompanion([generic])).toBeNull()
  expect(detectGrokCompanion([{ ...generic, method: "_x.ai/session/update" }])).toBe(
    "updates.jsonl",
  )
  expect(
    detectGrokCompanion([
      {
        ...generic,
        params: {
          ...generic.params,
          update: { ...generic.params.update, _meta: { "x.ai/tool": { name: "read_file" } } },
        },
      },
    ]),
  ).toBe("updates.jsonl")
  expect(detectGrokCompanion([{ method: "_x.ai/session/update" }])).toBeNull()
})

test("Grok companion detection requires the distinctive turn_started envelope", () => {
  const event = {
    type: "turn_started",
    ts: "2000-01-01T00:00:00Z",
    schema_version: "1.0",
    session_id: "synthetic",
    model_id: "grok-test",
    turn_number: 1,
    conversation_message_count: 4,
    session_relationship: null,
    yolo_mode: false,
  }
  expect(detectGrokCompanion([event])).toBe("events.jsonl")
  expect(detectGrokCompanion([{ type: "turn_started", ts: event.ts }])).toBeNull()
  expect(
    detectGrokCompanion([{ type: "tool_completed", tool_call_id: "synthetic", duration_ms: 12 }]),
  ).toBeNull()
  expect(classifyJsonl([event])).toBe("unknown")
})

test("synthetic Grok fixtures classify history and detect both companions", async () => {
  const load = async (name: string): Promise<unknown[]> => {
    const text = await Bun.file(
      new URL(`../__fixtures__/grok/recipe-planner/${name}`, import.meta.url),
    ).text()
    return text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
  }
  expect(classifyJsonl(await load("chat_history.jsonl"))).toBe("grok")
  for (const name of ["events.jsonl", "updates.jsonl"] as const) {
    const lines = await load(name)
    expect(classifyJsonl(lines)).toBe("unknown")
    expect(detectGrokCompanion(lines)).toBe(name)
  }
})

test("Muse detection requires its session event envelope, not a filename or generic task", () => {
  const record = {
    schema_version: 1,
    id: "synthetic-record",
    stream: { kind: "session", id: "synthetic-session" },
    sequence: 1,
    recorded_at: 1_800_000_000_000_000,
    record_type: "event",
    payload_type: "run.model.configured",
    payload: { model_id: "synthetic-model" },
  }
  expect(classifyJsonl([record])).toBe("muse")
  expect(classifyJsonl([{ payload_type: "task.lifecycle.started", payload: {} }])).toBe("unknown")
  expect(classifyJsonl([{ ...record, stream: { kind: "task", id: "task" } }])).toBe("unknown")
  expect(classifyJsonl([{ ...record, payload_type: "unrelated.event" }])).toBe("unknown")
  expect(classifyJsonl([record, { type: "session_meta" }])).toBe("codex")
})

test("detects a durable Muse frame and direct session records without guessing dates", () => {
  const frame = {
    retained_frame: "session_permission_transaction",
    frame_schema_version: 1,
    children: [],
  }
  expect(classifyJsonl([frame])).toBe("muse")
  expect(classifyJsonl([{ ...frame, retained_frame: "unrelated" }])).toBe("unknown")
  expect(
    classifyJsonl([
      {
        schema_version: 1,
        id: "example",
        stream: { kind: "session", id: "example" },
        sequence: 1,
        record_type: "event",
        payload_type: "runtime.session",
        payload: {},
      },
    ]),
  ).toBe("muse")
  expect(classifyJsonl([frame, { type: "session_meta" }])).toBe("codex")
})
