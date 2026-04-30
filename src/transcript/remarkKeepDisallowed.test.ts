import { test, expect } from "bun:test"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkStringify from "remark-stringify"
import { remarkKeepDisallowed } from "./remarkKeepDisallowed"

function transform(md: string): string {
  // Round-trip through the plugin: parse → keep-disallowed → stringify.
  // Disallowed nodes are replaced with text nodes containing their literal
  // source, so re-stringifying produces text (no markdown syntax) for those
  // pieces.
  const tree = unified()
    .use(remarkParse)
    .use(remarkKeepDisallowed)
    .use(remarkStringify)
    .processSync(md)
  return String(tree).trimEnd()
}

test("image → literal alt-image syntax", () => {
  expect(transform("before ![alt](https://x/i.png) after")).toBe(
    "before !\\[alt]\\(https://x/i.png) after",
  )
})

test("javascript: link → literal", () => {
  expect(transform("[click](javascript:alert(1))")).toBe("\\[click]\\(javascript:alert(1))")
})

test("http link kept as link", () => {
  expect(transform("[ok](https://example.com)")).toBe("[ok](https://example.com)")
})

test("raw html block kept as text", () => {
  expect(transform("<div>hi</div>")).toBe("\\<div>hi</div>")
})

test("mailto link kept as link", () => {
  expect(transform("[me](mailto:a@b.c)")).toBe("[me](mailto:a@b.c)")
})
