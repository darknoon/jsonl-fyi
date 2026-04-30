import { test, expect } from "bun:test"
import { parseCodexEntries } from "./parse"

test("parseCodexEntries: keeps known top-level types, drops event_msg", () => {
  const lines: unknown[] = [
    { type: "session_meta", payload: { id: "abc", cwd: "/x" } },
    { type: "turn_context", payload: { model: "gpt-5.2-codex", cwd: "/x" } },
    { type: "event_msg", payload: { type: "agent_message", message: "hi" } },
    {
      type: "response_item",
      timestamp: "2026-01-01T00:00:00Z",
      payload: { type: "message", role: "user", content: [{ type: "input_text", text: "yo" }] },
    },
    {
      type: "response_item",
      payload: {
        type: "reasoning",
        summary: [{ type: "summary_text", text: "thinking..." }],
        encrypted_content: "...",
      },
    },
    {
      type: "response_item",
      payload: {
        type: "function_call",
        name: "shell_command",
        arguments: '{"command":"ls"}',
        call_id: "c1",
      },
    },
    { type: "compacted", payload: { message: null, replacement_history: null } },
  ]
  const entries = parseCodexEntries(lines)
  expect(entries.map((e) => e.type)).toEqual([
    "session_meta",
    "turn_context",
    "response_item",
    "response_item",
    "response_item",
    "compacted",
  ])
})

test("parseCodexEntries: skips unknown top-level types and malformed objects", () => {
  const lines: unknown[] = [
    { type: "session_meta", payload: { id: "x" } },
    { type: "totally_unknown", payload: {} },
    null,
    "not an object",
    { no_type_field: true },
    { type: "response_item", payload: { type: "message", role: "user", content: [] } },
  ]
  expect(parseCodexEntries(lines).map((e) => e.type)).toEqual(["session_meta", "response_item"])
})

test("parseCodexEntries: drops response_item lines whose payload is malformed", () => {
  const lines: unknown[] = [
    { type: "response_item", payload: null },
    { type: "response_item", payload: { type: "unknown_subtype" } },
    { type: "response_item", payload: { type: "message", role: "user", content: [] } },
  ]
  // Unknown subtypes pass through; only payloads missing the discriminator are dropped.
  expect(parseCodexEntries(lines).length).toBe(2)
})

test("parseCodexEntries: keeps event_msg rows of subtype token_count", () => {
  const lines = [
    {
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          last_token_usage: {
            input_tokens: 18872,
            cached_input_tokens: 6528,
            output_tokens: 158,
            reasoning_output_tokens: 0,
            total_tokens: 19030,
          },
          total_token_usage: {
            input_tokens: 18872,
            cached_input_tokens: 6528,
            output_tokens: 158,
            reasoning_output_tokens: 0,
            total_tokens: 19030,
          },
          model_context_window: 258400,
        },
      },
    },
  ]
  const out = parseCodexEntries(lines)
  expect(out).toHaveLength(1)
  expect(out[0].type).toBe("event_msg")
})

test("parseCodexEntries: drops other event_msg rows", () => {
  const lines = [
    { type: "event_msg", payload: { type: "task_started" } },
    { type: "event_msg", payload: { type: "token_count", info: null } },
  ]
  const out = parseCodexEntries(lines)
  expect(out).toHaveLength(1)
})
