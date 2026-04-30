import { test, expect } from "bun:test"
import { formatTokens } from "./usage"

test("formatTokens: under 1k shows the literal integer", () => {
  expect(formatTokens(0)).toBe("0")
  expect(formatTokens(6)).toBe("6")
  expect(formatTokens(165)).toBe("165")
  expect(formatTokens(999)).toBe("999")
})

test("formatTokens: 1k–999k uses k with one decimal, trailing .0 kept", () => {
  expect(formatTokens(1000)).toBe("1.0k")
  expect(formatTokens(1500)).toBe("1.5k")
  expect(formatTokens(29_000)).toBe("29.0k")
  expect(formatTokens(29_050)).toBe("29.1k") // round, not floor
  expect(formatTokens(999_499)).toBe("999.5k")
})

test("formatTokens: ≥1M uses M with one decimal", () => {
  expect(formatTokens(1_000_000)).toBe("1.0M")
  expect(formatTokens(1_200_000)).toBe("1.2M")
  expect(formatTokens(58_300_000)).toBe("58.3M")
})

test("formatTokens: handles 999_500 boundary correctly (rounds up to 1.0M)", () => {
  // 999_500 / 1000 = 999.5 → "999.5k" — stays in k bucket because < 1_000_000
  expect(formatTokens(999_500)).toBe("999.5k")
  expect(formatTokens(999_999)).toBe("1000.0k")
  expect(formatTokens(1_000_000)).toBe("1.0M")
})

test("formatTokens: negative or NaN falls back to '0'", () => {
  expect(formatTokens(-1)).toBe("0")
  expect(formatTokens(Number.NaN)).toBe("0")
})

import { extractClaudeTurnUsage } from "./usage"
import type { MessageEntry } from "../types"

function claudeAssistant(usage: Record<string, number> | undefined): MessageEntry {
  return {
    type: "assistant",
    uuid: "u",
    message: {
      role: "assistant",
      content: [],
      ...(usage ? { usage } : {}),
    } as MessageEntry["message"],
  }
}

test("extractClaudeTurnUsage: input sums input_tokens + cache_creation_input_tokens", () => {
  // Cache-creation tokens are tokens the model freshly processed this turn
  // (and stored for later reuse). Bucketing them with input_tokens keeps the
  // ↑ arrow meaningful — otherwise every cache-write turn shows ↑1.
  const entry = claudeAssistant({
    input_tokens: 6,
    cache_creation_input_tokens: 28960,
    cache_read_input_tokens: 0,
    output_tokens: 165,
  })
  expect(extractClaudeTurnUsage(entry)).toEqual({
    input: 28966,
    output: 165,
    cacheRead: 0,
  })
})

test("extractClaudeTurnUsage: cache-read goes to its own slot, not into input", () => {
  const entry = claudeAssistant({
    input_tokens: 1,
    cache_creation_input_tokens: 525,
    cache_read_input_tokens: 29267,
    output_tokens: 96,
  })
  expect(extractClaudeTurnUsage(entry)).toEqual({
    input: 526,
    output: 96,
    cacheRead: 29267,
  })
})

test("extractClaudeTurnUsage: handles missing cache fields", () => {
  const entry = claudeAssistant({ input_tokens: 10, output_tokens: 20 })
  expect(extractClaudeTurnUsage(entry)).toEqual({
    input: 10,
    output: 20,
    cacheRead: 0,
  })
})

test("extractClaudeTurnUsage: returns null when usage missing", () => {
  expect(extractClaudeTurnUsage(claudeAssistant(undefined))).toBeNull()
})

test("extractClaudeTurnUsage: returns null for user entries", () => {
  const entry: MessageEntry = {
    type: "user",
    uuid: "u",
    message: { role: "user", content: "hi" },
  }
  expect(extractClaudeTurnUsage(entry)).toBeNull()
})

import { extractCodexTurnUsage } from "./usage"
import type { CodexEventMsgTokenCount } from "./codex/types"

function tokenCountEvent(last: Record<string, number>): CodexEventMsgTokenCount {
  return {
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        last_token_usage: last,
        total_token_usage: last,
      },
    },
  }
}

test("extractCodexTurnUsage: maps last_token_usage", () => {
  const ev = tokenCountEvent({
    input_tokens: 18872,
    cached_input_tokens: 6528,
    output_tokens: 158,
  })
  expect(extractCodexTurnUsage(ev)).toEqual({
    input: 18872 - 6528, // fresh-only input — matches Claude semantics
    output: 158,
    cacheRead: 6528,
  })
})

test("extractCodexTurnUsage: tolerates missing fields", () => {
  const ev: CodexEventMsgTokenCount = {
    type: "event_msg",
    payload: { type: "token_count", info: null },
  }
  expect(extractCodexTurnUsage(ev)).toBeNull()
})

test("extractCodexTurnUsage: zero cache means input passes through unchanged", () => {
  const ev = tokenCountEvent({
    input_tokens: 100,
    cached_input_tokens: 0,
    output_tokens: 50,
  })
  expect(extractCodexTurnUsage(ev)).toEqual({
    input: 100,
    output: 50,
    cacheRead: 0,
  })
})

test("extractCodexTurnUsage: never returns negative input if cached > input (defensive)", () => {
  const ev = tokenCountEvent({
    input_tokens: 5,
    cached_input_tokens: 10,
    output_tokens: 1,
  })
  const u = extractCodexTurnUsage(ev)
  expect(u?.input).toBe(0)
})
