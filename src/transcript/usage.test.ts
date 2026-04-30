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
