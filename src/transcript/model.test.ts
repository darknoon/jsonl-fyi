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
