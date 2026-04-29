import { test, expect } from "bun:test"
import { shortPath } from "./toolMeta"

test("shortPath collapses deep paths but preserves shallow ones", () => {
  const summary = ["/a", "a/b", "a/b/c", "a/b/c/d/e", ""]
    .map(p => `${JSON.stringify(p)} -> ${JSON.stringify(shortPath(p))}`)
    .join("\n")
  expect(summary).toMatchInlineSnapshot(`
    ""/a" -> "/a"
    "a/b" -> "a/b"
    "a/b/c" -> ".../b/c"
    "a/b/c/d/e" -> ".../d/e"
    "" -> """
  `)
})
