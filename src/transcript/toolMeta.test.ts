import { test, expect } from "bun:test"
import { toolLabel, toolTitle, shortPath } from "./toolMeta"

test("toolLabel covers known tools and falls back for unknown ones", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["Read", { file_path: "/Users/example/Developer/example/project/src/foo/bar.ts" }],
    ["Edit", { file_path: "src/foo.ts" }],
    ["Write", { file_path: "newfile.md" }],
    ["MultiEdit", { file_path: "deep/nested/path/x.ts" }],
    ["Bash", { command: "npm install --save-dev typescript" }],
    ["Bash", {}],
    ["Grep", { pattern: "TODO" }],
    ["Glob", { pattern: "**/*.ts" }],
    ["WebFetch", { url: "https://example.com" }],
    ["TodoWrite", {}],
    ["mcp__custom__SomeTool", { title: "x" }],
  ]
  const summary = cases
    .map(
      ([name, input]) =>
        `${name}\t${toolLabel(name, toolTitle({ name, input }))}`,
    )
    .join("\n")
  expect(summary).toMatchInlineSnapshot(`
    "Read	Read .../foo/bar.ts
    Edit	Edited src/foo.ts
    Write	Wrote newfile.md
    MultiEdit	Edited .../path/x.ts
    Bash	npm install --save-dev typescript
    Bash	Done
    Grep	Searched code TODO
    Glob	Searched files **/*.ts
    WebFetch	Fetched ...//example.com
    TodoWrite	Updated todos
    mcp__custom__SomeTool	Ran mcp__custom__SomeTool"
  `)
})

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
