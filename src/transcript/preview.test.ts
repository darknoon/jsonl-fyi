import { describe, expect, test } from "bun:test"
import { tailLines, headLines } from "./preview"

describe("tailLines", () => {
  test("returns last n lines and remaining count", () => {
    expect(tailLines("a\nb\nc\nd", 2)).toEqual({ text: "c\nd", remaining: 2 })
  })

  test("returns full text when n exceeds line count", () => {
    expect(tailLines("a\nb", 5)).toEqual({ text: "a\nb", remaining: 0 })
  })

  test("handles empty string", () => {
    expect(tailLines("", 3)).toEqual({ text: "", remaining: 0 })
  })

  test("strips trailing newline before counting", () => {
    expect(tailLines("a\nb\n", 1)).toEqual({ text: "b", remaining: 1 })
  })
})

describe("headLines", () => {
  test("returns first n lines and remaining count", () => {
    expect(headLines("a\nb\nc\nd", 2)).toEqual({ text: "a\nb", remaining: 2 })
  })

  test("returns full text when n exceeds line count", () => {
    expect(headLines("a\nb", 5)).toEqual({ text: "a\nb", remaining: 0 })
  })

  test("handles empty string", () => {
    expect(headLines("", 3)).toEqual({ text: "", remaining: 0 })
  })

  test("strips trailing newline before counting", () => {
    expect(headLines("a\nb\n", 1)).toEqual({ text: "a", remaining: 1 })
  })
})
