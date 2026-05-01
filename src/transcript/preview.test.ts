import { describe, expect, test } from "bun:test"
import { tailLines, headLines, parseFrontmatter } from "./preview"

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

describe("parseFrontmatter", () => {
  test("parses simple key/value frontmatter", () => {
    const text = `---
name: brainstorming
description: Help turn ideas into designs
---

# Body
`
    expect(parseFrontmatter(text)).toEqual({
      name: "brainstorming",
      description: "Help turn ideas into designs",
    })
  })

  test("joins folded multi-line description into one string", () => {
    const text = `---
name: foo
description: Use this when starting any conversation - establishes how
  to find and use skills, requiring tool invocation before any response
---
body`
    const fm = parseFrontmatter(text)
    expect(fm?.description).toContain("starting any conversation")
    expect(fm?.description).toContain("requiring tool invocation")
    expect(fm?.description).not.toContain("\n")
  })

  test("returns undefined when no frontmatter block", () => {
    expect(parseFrontmatter("just body, no fences")).toBeUndefined()
  })

  test("returns undefined when fences are not closed", () => {
    expect(parseFrontmatter("---\nname: x\nbody without close")).toBeUndefined()
  })

  test("handles empty input", () => {
    expect(parseFrontmatter("")).toBeUndefined()
  })
})
