import { test, expect } from "bun:test"
import { renderProseSummary, type SummaryCounts } from "./groupSummary"

// Single-category, singular vs plural
test("command singular", () => {
  expect(renderProseSummary({ command: 1 }, 0)).toBe("Ran 1 command")
})

test("command plural", () => {
  expect(renderProseSummary({ command: 3 }, 0)).toBe("Ran 3 commands")
})

test("edit singular", () => {
  expect(renderProseSummary({ edit: 1 }, 0)).toBe("Edited 1 file")
})

test("create plural", () => {
  expect(renderProseSummary({ create: 2 }, 0)).toBe("Created 2 files")
})

test("delete plural", () => {
  expect(renderProseSummary({ delete: 4 }, 0)).toBe("Deleted 4 files")
})

test("read singular", () => {
  expect(renderProseSummary({ read: 1 }, 0)).toBe("Read 1 file")
})

test("search singular uses time (not once)", () => {
  expect(renderProseSummary({ search: 1 }, 0)).toBe("Searched 1 time")
})

test("search plural", () => {
  expect(renderProseSummary({ search: 5 }, 0)).toBe("Searched 5 times")
})

test("web_fetch singular", () => {
  expect(renderProseSummary({ web_fetch: 1 }, 0)).toBe("Fetched 1 URL")
})

test("web_fetch plural", () => {
  expect(renderProseSummary({ web_fetch: 3 }, 0)).toBe("Fetched 3 URLs")
})

test("web_search singular", () => {
  expect(renderProseSummary({ web_search: 1 }, 0)).toBe("Searched the web 1 time")
})

test("web_search plural", () => {
  expect(renderProseSummary({ web_search: 2 }, 0)).toBe("Searched the web 2 times")
})

test("subagent singular", () => {
  expect(renderProseSummary({ subagent: 1 }, 0)).toBe("Started 1 subagent")
})

test("subagent_comm plural", () => {
  expect(renderProseSummary({ subagent_comm: 3 }, 0)).toBe("Messaged 3 subagents")
})

test("todo singular", () => {
  expect(renderProseSummary({ todo: 1 }, 0)).toBe("Updated 1 todo item")
})

test("todo plural", () => {
  expect(renderProseSummary({ todo: 7 }, 0)).toBe("Updated 7 todo items")
})

test("skill singular", () => {
  expect(renderProseSummary({ skill: 1 }, 0)).toBe("Loaded 1 skill")
})

// Pairs and joins
test("two categories joined with 'and'", () => {
  expect(renderProseSummary({ command: 3, edit: 1 }, 0)).toBe(
    "Ran 3 commands and edited 1 file",
  )
})

test("three categories: comma + final 'and' (no Oxford)", () => {
  expect(renderProseSummary({ command: 3, edit: 3, create: 1 }, 0)).toBe(
    "Ran 3 commands, edited 3 files and created 1 file",
  )
})

test("four categories preserves fixed spec order", () => {
  expect(
    renderProseSummary({ command: 3, edit: 3, create: 1, read: 2 }, 0),
  ).toBe("Ran 3 commands, edited 3 files, created 1 file and read 2 files")
})

test("fixed order: input order is irrelevant", () => {
  const a = renderProseSummary({ read: 2, command: 3 } as SummaryCounts, 0)
  const b = renderProseSummary({ command: 3, read: 2 } as SummaryCounts, 0)
  expect(a).toBe(b)
  expect(a).toBe("Ran 3 commands and read 2 files")
})

// Thinking standalone (capitalized "Thought")
test("thinking only, N=1 → 'Thought'", () => {
  expect(renderProseSummary({}, 1)).toBe("Thought")
})

test("thinking only, N>1 → 'Thought N times'", () => {
  expect(renderProseSummary({}, 4)).toBe("Thought 4 times")
})

// Thinking appended (lowercase "thought")
test("thinking appended with single category", () => {
  expect(renderProseSummary({ command: 2 }, 3)).toBe(
    "Ran 2 commands and thought 3 times",
  )
})

test("thinking appended with multiple categories, N=1 → 'and thought'", () => {
  expect(renderProseSummary({ command: 1, edit: 1 }, 1)).toBe(
    "Ran 1 command, edited 1 file and thought",
  )
})

test("spec example renders verbatim", () => {
  expect(
    renderProseSummary({ command: 3, edit: 3, create: 1 }, 3),
  ).toBe("Ran 3 commands, edited 3 files, created 1 file and thought 3 times")
})

// All-zero
test("empty counts + zero thinking → null", () => {
  expect(renderProseSummary({}, 0)).toBeNull()
})

test("zero-valued buckets are omitted, not rendered as N=0", () => {
  expect(renderProseSummary({ command: 0, edit: 2 } as SummaryCounts, 0)).toBe(
    "Edited 2 files",
  )
})

test("all-zero with explicit zeros + zero thinking → null", () => {
  expect(
    renderProseSummary(
      { command: 0, edit: 0, create: 0 } as SummaryCounts,
      0,
    ),
  ).toBeNull()
})
