import { test, expect } from "bun:test"
import {
  exampleHref,
  findExampleByPath,
  formatBytes,
  type Example,
} from "./examples"

const stub: Example = {
  name: "demo",
  fileName: "sample.jsonl",
  turns: 0,
  sizeBytes: 0,
  load: async () => "",
}

test("formatBytes uses bytes / KB / MB with one decimal", () => {
  expect(formatBytes(0)).toBe("0 B")
  expect(formatBytes(512)).toBe("512 B")
  expect(formatBytes(1024)).toBe("1.0 KB")
  expect(formatBytes(2048)).toBe("2.0 KB")
  expect(formatBytes(1536)).toBe("1.5 KB")
  expect(formatBytes(1024 * 1024)).toBe("1.0 MB")
  expect(formatBytes(1_500_000)).toBe("1.4 MB")
})

test("exampleHref maps an example to a stable jsonl route", () => {
  expect(exampleHref(stub)).toBe("/examples/sample.jsonl")
})

test("findExampleByPath returns bundled examples for example routes", () => {
  expect(findExampleByPath("/examples/sample.jsonl")?.fileName)
    .toBe("sample.jsonl")
})

test("findExampleByPath ignores non-example and unknown example routes", () => {
  expect(findExampleByPath("/")).toBeNull()
  expect(findExampleByPath("/examples/missing.jsonl")).toBeNull()
})
