import { test, expect } from "bun:test"
import { parseV4A } from "./v4a"

test("parseV4A: single-file Update with one hunk", () => {
  const patch = [
    "*** Begin Patch",
    "*** Update File: /a/b.json",
    "@@",
    '-  "name": "old",',
    '+  "name": "new",',
    "*** End Patch",
  ].join("\n")
  const result = parseV4A(patch)
  expect("error" in result).toBe(false)
  if ("error" in result) return
  expect(result.files).toHaveLength(1)
  const f = result.files[0]
  expect(f.op).toBe("update")
  expect(f.path).toBe("/a/b.json")
  expect((f as { unifiedDiff: string }).unifiedDiff).toMatchInlineSnapshot(`
    "--- a/a/b.json
    +++ b/a/b.json
    @@ -1,1 +1,1 @@
    -  "name": "old",
    +  "name": "new",
    "
  `)
})

test("parseV4A: Update with context and multiple hunks", () => {
  const patch = [
    "*** Begin Patch",
    "*** Update File: /x.py",
    "@@",
    " def foo():",
    "-    return 1",
    "+    return 2",
    "@@",
    " def bar():",
    "-    pass",
    "+    return 3",
    "*** End Patch",
  ].join("\n")
  const result = parseV4A(patch)
  expect("error" in result).toBe(false)
  if ("error" in result) return
  expect(result.files).toHaveLength(1)
  expect((result.files[0] as { unifiedDiff: string }).unifiedDiff).toMatchInlineSnapshot(`
    "--- a/x.py
    +++ b/x.py
    @@ -1,2 +1,2 @@
     def foo():
    -    return 1
    +    return 2
    @@ -1,2 +1,2 @@
     def bar():
    -    pass
    +    return 3
    "
  `)
})

test("parseV4A: Add File", () => {
  const patch = [
    "*** Begin Patch",
    "*** Add File: /new.txt",
    "+line one",
    "+line two",
    "*** End Patch",
  ].join("\n")
  const result = parseV4A(patch)
  expect("error" in result).toBe(false)
  if ("error" in result) return
  expect(result.files[0].op).toBe("add")
  expect(result.files[0].path).toBe("/new.txt")
  expect((result.files[0] as { unifiedDiff: string }).unifiedDiff).toMatchInlineSnapshot(`
    "--- /dev/null
    +++ b/new.txt
    @@ -1,0 +1,2 @@
    +line one
    +line two
    "
  `)
})

test("parseV4A: Delete File (no body)", () => {
  const patch = ["*** Begin Patch", "*** Delete File: /gone.txt", "*** End Patch"].join("\n")
  const result = parseV4A(patch)
  expect("error" in result).toBe(false)
  if ("error" in result) return
  expect(result.files).toEqual([{ op: "delete", path: "/gone.txt" }])
})

test("parseV4A: Move (Update with rename)", () => {
  const patch = [
    "*** Begin Patch",
    "*** Update File: /old.txt",
    "*** Move to: /new.txt",
    "@@",
    "-old",
    "+new",
    "*** End Patch",
  ].join("\n")
  const result = parseV4A(patch)
  expect("error" in result).toBe(false)
  if ("error" in result) return
  expect(result.files[0].op).toBe("update")
  expect((result.files[0] as { movedTo?: string }).movedTo).toBe("/new.txt")
})

test("parseV4A: hunk anchor lines (e.g. '@@ class Foo') are accepted and dropped", () => {
  const patch = [
    "*** Begin Patch",
    "*** Update File: /x.py",
    "@@ class Foo",
    "-    return 1",
    "+    return 2",
    "*** End Patch",
  ].join("\n")
  const result = parseV4A(patch)
  expect("error" in result).toBe(false)
  if ("error" in result) return
  expect((result.files[0] as { unifiedDiff: string }).unifiedDiff).toContain("@@ -1,1 +1,1 @@")
})

test("parseV4A: multiple files in one patch", () => {
  const patch = [
    "*** Begin Patch",
    "*** Update File: /a.txt",
    "@@",
    "-old",
    "+new",
    "*** Add File: /b.txt",
    "+content",
    "*** End Patch",
  ].join("\n")
  const result = parseV4A(patch)
  expect("error" in result).toBe(false)
  if ("error" in result) return
  expect(result.files.map((f) => f.op)).toEqual(["update", "add"])
})

test("parseV4A: malformed patch (missing Begin Patch)", () => {
  const patch = "*** Update File: /x\n@@\n-a\n+b\n*** End Patch"
  const result = parseV4A(patch)
  expect("error" in result).toBe(true)
})

test("parseV4A: malformed patch (Update with no @@)", () => {
  const patch = "*** Begin Patch\n*** Update File: /x\n*** End Patch"
  const result = parseV4A(patch)
  expect("error" in result).toBe(true)
})

test("parseV4A: tolerates *** End of File marker inside an Update", () => {
  const patch = [
    "*** Begin Patch",
    "*** Update File: /x.txt",
    "@@",
    "-old",
    "+new",
    "*** End of File",
    "*** End Patch",
  ].join("\n")
  const result = parseV4A(patch)
  expect("error" in result).toBe(false)
})
