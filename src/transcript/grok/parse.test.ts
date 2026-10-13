import { expect, test } from "bun:test"
import { parseGrokEntries } from "./parse"
import type { GrokToolEntry } from "./types"

const call = (
  id: string,
  name = "read_file",
  args: unknown = '{"target_file":"recipes/soup.md"}',
) => ({
  id,
  name,
  arguments: args,
})
const assistant = (calls: unknown[], content = "") => ({
  type: "assistant",
  content,
  tool_calls: calls,
})
const result = (id: string, content: unknown, images?: unknown) => ({
  type: "tool_result",
  tool_call_id: id,
  content,
  ...(images === undefined ? {} : { images }),
})
const toolEntries = (lines: unknown[]) =>
  parseGrokEntries(lines).entries.filter((entry): entry is GrokToolEntry => entry.kind === "tool")

test("pairs results by ID while keeping assistant text and call order", () => {
  const session = parseGrokEntries([
    assistant([call("first"), call("second")], "Reading both recipes."),
    result("second", "Second recipe"),
    result("first", "First recipe"),
  ])
  expect(session.entries.map((entry) => entry.kind)).toEqual(["message", "tool", "tool"])
  const tools = session.entries.filter((entry) => entry.kind === "tool")
  expect(tools.map((entry) => entry.output.content)).toEqual([
    [{ type: "text", text: "First recipe" }],
    [{ type: "text", text: "Second recipe" }],
  ])
  expect(tools.every((entry) => entry.hasResult)).toBe(true)
})

test("retains calls with no results and preserves unmatched and repeated results", () => {
  const session = parseGrokEntries([
    assistant([call("paired"), call("missing")]),
    result("paired", "First output"),
    result("paired", "Repeated output"),
    result("orphan", "Unmatched output"),
  ])
  expect(session.entries.map((entry) => entry.kind)).toEqual(["tool", "tool", "unknown", "unknown"])
  expect(session.entries[0]).toMatchObject({
    hasResult: true,
    output: { content: [{ text: "First output" }] },
  })
  expect(session.entries[1]).toMatchObject({ hasResult: false, output: { content: [] } })
  expect(session.entries[2]).toMatchObject({ raw: { content: "Repeated output" } })
  expect(session.entries[3]).toMatchObject({ raw: { tool_call_id: "orphan" } })
})

test("duplicate call IDs never share or ambiguously claim a result", () => {
  const session = parseGrokEntries([
    assistant([call("duplicate"), call("duplicate"), { name: "read_file", arguments: "{}" }]),
    result("duplicate", "Ambiguous output"),
    result("", "No matching ID"),
  ])
  const tools = session.entries.filter((entry) => entry.kind === "tool")
  expect(tools).toHaveLength(3)
  expect(tools.every((entry) => !entry.hasResult)).toBe(true)
  expect(new Set(session.entries.map((entry) => entry.id)).size).toBe(session.entries.length)
  expect(session.entries.filter((entry) => entry.kind === "unknown")).toHaveLength(2)
})

test("a result before its call is paired once", () => {
  const entries = parseGrokEntries([result("a", "Soup"), assistant([call("a")])]).entries
  expect(entries).toHaveLength(1)
  expect(entries[0]).toMatchObject({
    kind: "tool",
    hasResult: true,
    output: { content: [{ text: "Soup" }] },
  })
})

test("decodes arguments and preserves malformed, non-object, or missing arguments", () => {
  const args = [
    '{"target_file":"recipes/soup.md"}',
    { target_file: "recipes/menu.md" },
    "{bad",
    "null",
    "[]",
    "5",
    undefined,
  ]
  const tools = toolEntries([
    assistant(
      args.map((input, index) => ({ id: String(index), name: "read_file", arguments: input })),
    ),
  ])
  expect(tools.map((tool) => tool.input)).toEqual([
    { target_file: "recipes/soup.md" },
    { target_file: "recipes/menu.md" },
    { _raw: "{bad" },
    { _raw: "null" },
    { _raw: "[]" },
    { _raw: "5" },
    { _raw: undefined },
  ])
})

test("prompt_index zero marks a real user; context and system stay distinct", () => {
  const entries = parseGrokEntries([
    { type: "system", content: "Maintain recipes." },
    { type: "user", content: [{ type: "text", text: "<user_info>Recipe collection</user_info>" }] },
    {
      type: "user",
      synthetic_reason: "system_reminder",
      content: "<system-reminder>Use metric units</system-reminder>",
    },
    { type: "user", content: "Other context" },
    {
      type: "user",
      prompt_index: 0,
      content: [{ type: "text", text: "<user_query>\nMake soup.\n</user_query>" }],
    },
    {
      type: "user",
      prompt_index: 1,
      content: "Quote <user_query>literal markup</user_query> here.",
    },
  ]).entries
  expect(entries.map((entry) => entry.kind === "message" && entry.role)).toEqual([
    "system",
    "context",
    "context",
    "context",
    "user",
    "user",
  ])
  expect(entries[1]).toMatchObject({ label: "User info" })
  expect(entries[2]).toMatchObject({ label: "System reminder" })
  expect(entries[3]).toMatchObject({ label: "User context" })
  expect(entries[4]).toMatchObject({ text: "Make soup." })
  expect(entries[5]).toMatchObject({ text: "Quote <user_query>literal markup</user_query> here." })
})

test("blank assistant text makes no bubble and model IDs retain first-seen order", () => {
  const session = parseGrokEntries([
    { ...assistant([call("a")]), model_id: "model-a" },
    { ...assistant([], " \n"), model_id: "model-b" },
    { ...assistant([], "Done"), model_id: "model-a" },
  ])
  expect(session.entries.map((entry) => entry.kind)).toEqual(["tool", "message"])
  expect(session.models).toEqual(["model-a", "model-b"])
  expect(session.entries[1]).toMatchObject({ model: "model-a", text: "Done" })
})

test("keeps text then all images without changing their URLs; supports image-only results", () => {
  const images = [
    { type: "image", url: "data:image/png;base64,first" },
    { type: "image", url: "data:image/jpeg;base64,second" },
  ]
  const tools = toolEntries([
    assistant([call("a"), call("b", "custom_preview")]),
    result("a", "Recipe illustration", images),
    result("b", "", images),
  ])
  expect(tools[0]!.output.content).toEqual([
    { type: "text", text: "Recipe illustration" },
    { type: "image", source: { type: "url", url: images[0]!.url } },
    { type: "image", source: { type: "url", url: images[1]!.url } },
  ])
  expect(tools[1]!.output.content).toEqual(tools[0]!.output.content.slice(1))
})

test("terminal exit header supplies status and is stripped only for terminal tools", () => {
  const tools = toolEntries([
    assistant([
      call("a", "run_terminal_command"),
      call("b", "run_terminal_command"),
      call("c"),
      call("d", "run_terminal_command"),
    ]),
    result("a", "exit: 127\ncommand not found"),
    result("b", "exit: 0\r\nAll recipes checked"),
    result("c", "exit: 1\nA quoted recipe line"),
    result("d", "This recipe mentions an error.\nexit: 2"),
  ])
  expect(tools[0]).toMatchObject({
    exitCode: 127,
    output: { isError: true, content: [{ text: "command not found" }] },
  })
  expect(tools[1]).toMatchObject({
    exitCode: 0,
    output: { isError: false, content: [{ text: "All recipes checked" }] },
  })
  expect(tools[2]!.exitCode).toBeUndefined()
  expect(tools[2]!.output.content).toEqual([
    { type: "text", text: "exit: 1\nA quoted recipe line" },
  ])
  expect(tools[3]!.exitCode).toBeUndefined()
  expect(tools[3]!.output.isError).toBe(false)
})

test("reasoning summary precedes content at the original position", () => {
  const entries = parseGrokEntries([
    {
      type: "reasoning",
      summary: [{ text: "Compare recipes." }],
      content: [{ type: "text", text: "Both use lentils." }],
    },
    assistant([], "Choose soup."),
  ]).entries
  expect(entries[0]).toMatchObject({
    kind: "message",
    role: "reasoning",
    text: "Compare recipes.\nBoth use lentils.",
  })
  expect(entries[1]).toMatchObject({ role: "assistant", text: "Choose soup." })
})

test("unknown records, content, malformed calls and result images remain inspectable", () => {
  const unusualPart = { type: "future_part", payload: "kept" }
  const entries = parseGrokEntries([
    { type: "future_record", payload: [1, 2] },
    null,
    { type: "user", prompt_index: 0, content: [{ type: "text", text: "Soup" }, unusualPart] },
    assistant([null, { id: "invalid", arguments: "{}" }, call("a")]),
    result("a", { future: "result" }, [{ type: "future_image", data: "kept" }]),
    { type: "assistant", content: 42, tool_calls: "malformed" },
  ]).entries
  expect(entries.filter((entry) => entry.kind === "unknown").map((entry) => entry.raw)).toEqual([
    { type: "future_record", payload: [1, 2] },
    null,
    unusualPart,
    null,
    { id: "invalid", arguments: "{}" },
    { future: "result" },
    { type: "future_image", data: "kept" },
    42,
    "malformed",
  ])
})

test("synthetic fixture covers the actual tool and image shapes without private data", async () => {
  const source = await Bun.file(
    new URL("../../__fixtures__/grok/recipe-planner/chat_history.jsonl", import.meta.url),
  ).text()
  const lines: unknown[] = source
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
  const session = parseGrokEntries(lines)
  const tools = session.entries.filter((entry) => entry.kind === "tool")
  expect(tools).toHaveLength(10)
  expect(tools.every((tool) => tool.hasResult)).toBe(true)
  expect(
    tools.flatMap((tool) => tool.output.content).filter((part) => part.type === "image"),
  ).toHaveLength(2)
  expect(tools.filter((tool) => tool.output.isError)).toHaveLength(1)
  expect(session.entries.filter((entry) => entry.kind === "unknown")).toHaveLength(0)
  expect(
    session.entries.filter((entry) => entry.kind === "message" && entry.role === "assistant"),
  ).toHaveLength(4)
})
