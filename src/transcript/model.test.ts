import { test, expect } from "bun:test"
import { formatClaudeModel } from "./model"

test("formatClaudeModel: family-major-minor renders 'Family M.m'", () => {
  expect(formatClaudeModel("claude-opus-4-7")).toEqual({
    label: "Opus 4.7",
    raw: "claude-opus-4-7",
  })
  expect(formatClaudeModel("claude-sonnet-4-6")).toEqual({
    label: "Sonnet 4.6",
    raw: "claude-sonnet-4-6",
  })
  expect(formatClaudeModel("claude-opus-4-5-20251101")).toEqual({
    label: "Opus 4.5",
    raw: "claude-opus-4-5-20251101",
  })
  expect(formatClaudeModel("claude-haiku-4-5-20251001")).toEqual({
    label: "Haiku 4.5",
    raw: "claude-haiku-4-5-20251001",
  })
})

test("formatClaudeModel: family-major-<date> with no minor renders 'Family M'", () => {
  expect(formatClaudeModel("claude-sonnet-4-20250514")).toEqual({
    label: "Sonnet 4",
    raw: "claude-sonnet-4-20250514",
  })
})

test("formatClaudeModel: future major bump matches the regex", () => {
  expect(formatClaudeModel("claude-opus-5-0")).toEqual({
    label: "Opus 5.0",
    raw: "claude-opus-5-0",
  })
})

test("formatClaudeModel: non-matching id falls back to raw label", () => {
  expect(formatClaudeModel("claude-something-else")).toEqual({
    label: "claude-something-else",
    raw: "claude-something-else",
  })
  expect(formatClaudeModel("not-a-claude-id")).toEqual({
    label: "not-a-claude-id",
    raw: "not-a-claude-id",
  })
})

import { formatCodexModel } from "./model"

test("formatCodexModel: brand and version separated by space", () => {
  expect(formatCodexModel("gpt-5.5")).toEqual({
    label: "GPT 5.5",
    raw: "gpt-5.5",
  })
})

test("formatCodexModel: suffix preserved with space", () => {
  expect(formatCodexModel("gpt-5.2-codex")).toEqual({
    label: "GPT 5.2 codex",
    raw: "gpt-5.2-codex",
  })
})

test("formatCodexModel: effort joined with /", () => {
  expect(formatCodexModel("gpt-5.5", "high")).toEqual({
    label: "GPT 5.5/high",
    raw: "gpt-5.5",
  })
  expect(formatCodexModel("gpt-5.2-codex", "medium")).toEqual({
    label: "GPT 5.2 codex/medium",
    raw: "gpt-5.2-codex",
  })
})

test("formatCodexModel: empty effort omitted", () => {
  expect(formatCodexModel("gpt-5.5", undefined).label).toBe("GPT 5.5")
  expect(formatCodexModel("gpt-5.5", "").label).toBe("GPT 5.5")
})

test("formatCodexModel: non-matching id falls back to raw", () => {
  expect(formatCodexModel("o1-pro")).toEqual({ label: "o1-pro", raw: "o1-pro" })
})

import { isSyntheticClaudeModel } from "./model"

test("isSyntheticClaudeModel: matches the literal <synthetic> token", () => {
  expect(isSyntheticClaudeModel("<synthetic>")).toBe(true)
})

test("isSyntheticClaudeModel: real ids return false", () => {
  expect(isSyntheticClaudeModel("claude-opus-4-7")).toBe(false)
  expect(isSyntheticClaudeModel("")).toBe(false)
  expect(isSyntheticClaudeModel("synthetic")).toBe(false)
})
