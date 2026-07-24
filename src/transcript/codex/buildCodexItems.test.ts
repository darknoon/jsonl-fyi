import { test, expect } from "bun:test"
import { buildCodexItems } from "./buildCodexItems"
import type { CodexEntry, CodexResponseItem, CodexToolOutput } from "./types"

// Helpers to fabricate minimal CodexEntry values.
function functionCall(id: string, name: string, ts?: string): CodexResponseItem {
  return {
    type: "response_item",
    timestamp: ts,
    payload: { type: "function_call", name, arguments: "{}", call_id: id },
  }
}

function functionCallOutput(
  id: string,
  output: CodexToolOutput = "ok",
  ts?: string,
): CodexResponseItem {
  return {
    type: "response_item",
    timestamp: ts,
    payload: { type: "function_call_output", call_id: id, output },
  }
}

function customToolCall(id: string, name: string, input: string, ts?: string): CodexResponseItem {
  return {
    type: "response_item",
    timestamp: ts,
    payload: { type: "custom_tool_call", name, input, call_id: id },
  }
}

function customToolCallOutput(id: string, output: CodexToolOutput = "ok"): CodexResponseItem {
  return {
    type: "response_item",
    payload: { type: "custom_tool_call_output", call_id: id, output },
  }
}

function userMessage(text: string, ts?: string): CodexResponseItem {
  return {
    type: "response_item",
    timestamp: ts,
    payload: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text }],
    },
  }
}

function reasoning(text: string, ts?: string): CodexResponseItem {
  return {
    type: "response_item",
    timestamp: ts,
    payload: {
      type: "reasoning",
      summary: [{ type: "summary_text", text }],
    },
  }
}

function compacted(): CodexEntry {
  return { type: "compacted", payload: {} }
}

function eventMsg(subtype: string): CodexEntry {
  // event_msg shape is permissive; tests only exercise the "ignore" path.
  return { type: "event_msg", payload: { type: subtype } } as unknown as CodexEntry
}

// Minimal V4A patch string for a single file update.
function v4aPatch(filePath: string, oldLine: string, newLine: string): string {
  return [
    "*** Begin Patch",
    `*** Update File: ${filePath}`,
    "@@",
    `-${oldLine}`,
    `+${newLine}`,
    "*** End Patch",
  ].join("\n")
}

function v4aMultiFilePatch(
  files: Array<{ path: string; op: "update" | "add" | "delete"; old?: string; new?: string }>,
): string {
  const lines = ["*** Begin Patch"]
  for (const f of files) {
    if (f.op === "delete") {
      lines.push(`*** Delete File: ${f.path}`)
    } else if (f.op === "add") {
      lines.push(`*** Add File: ${f.path}`)
      if (f.new) lines.push(`+${f.new}`)
    } else {
      lines.push(`*** Update File: ${f.path}`)
      lines.push("@@")
      if (f.old) lines.push(`-${f.old}`)
      if (f.new) lines.push(`+${f.new}`)
    }
  }
  lines.push("*** End Patch")
  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("buildCodexItems: normalizes structured function output blocks", () => {
  const entries: CodexEntry[] = [
    functionCallOutput("c1", [
      { type: "input_text", text: "Exit code: 7\n" },
      { type: "input_image", image_url: "data:image/png;base64,abc" },
      { type: "output_text", text: "command failed" },
    ]),
  ]

  const { results } = buildCodexItems(entries)

  expect(results.get("c1")).toEqual({
    content: [
      { type: "text", text: "Exit code: 7\n" },
      {
        type: "image",
        source: { type: "url", url: "data:image/png;base64,abc" },
      },
      { type: "text", text: "command failed" },
    ],
    isError: true,
  })
})

test("buildCodexItems: normalizes recent structured custom output blocks", () => {
  const entries: CodexEntry[] = [
    customToolCallOutput("c1", [
      { type: "input_text", text: "Script completed\nOutput:\n" },
      { type: "input_text", text: '{"ok":true}' },
    ]),
    customToolCallOutput("c2", [
      { type: "input_text", text: '{"metadata":' },
      { type: "input_text", text: '{"exit_code":2}}' },
    ]),
  ]

  const { results } = buildCodexItems(entries)

  expect(results.get("c1")).toEqual({
    content: [
      { type: "text", text: "Script completed\nOutput:\n" },
      { type: "text", text: '{"ok":true}' },
    ],
    isError: false,
  })
  expect(results.get("c2")?.isError).toBe(true)
})

test("buildCodexItems chat: 2+ consecutive function_calls → one tool_group", () => {
  const fc1 = functionCall("c1", "read_file")
  const fc2 = functionCall("c2", "bash")
  const entries: CodexEntry[] = [fc1, fc2]
  const { items } = buildCodexItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(2)
  expect(groups[0].items[0].kind === "tool" && groups[0].items[0].entry).toBe(fc1)
  expect(groups[0].items[1].kind === "tool" && groups[0].items[1].entry).toBe(fc2)
})

test("buildCodexItems chat: 3 consecutive custom_tool_calls → one tool_group with items.length === 3", () => {
  const ct1 = customToolCall("c1", "apply_patch", "*** Begin Patch\n*** End Patch")
  const ct2 = customToolCall("c2", "apply_patch", "*** Begin Patch\n*** End Patch")
  const ct3 = customToolCall("c3", "read_file", "{}")
  const entries: CodexEntry[] = [ct1, ct2, ct3]
  const { items } = buildCodexItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(3)
})

test("buildCodexItems chat: apply_patch with multiple non-delete files → diffs per file", () => {
  const patch = v4aMultiFilePatch([
    { path: "/src/a.ts", op: "update", old: "old_a", new: "new_a" },
    { path: "/src/b.ts", op: "update", old: "old_b", new: "new_b" },
  ])
  const ct1 = customToolCall("c1", "apply_patch", patch)
  const ct2 = functionCall("c2", "bash")
  const entries: CodexEntry[] = [ct1, ct2]
  const { items } = buildCodexItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  const item0 = groups[0].items[0]
  if (item0.kind !== "tool") throw new Error()
  const diffs = item0.diffs
  expect(diffs).toHaveLength(2)
  expect(diffs[0]).toMatchObject({ kind: "patch", filePath: "/src/a.ts", op: "update" })
  expect(diffs[1]).toMatchObject({ kind: "patch", filePath: "/src/b.ts", op: "update" })
})

test("buildCodexItems chat: apply_patch delete file → filtered out from diffs", () => {
  const patch = v4aMultiFilePatch([
    { path: "/src/keep.ts", op: "update", old: "old", new: "new" },
    { path: "/src/gone.ts", op: "delete" },
  ])
  const ct1 = customToolCall("c1", "apply_patch", patch)
  const ct2 = functionCall("c2", "bash")
  const entries: CodexEntry[] = [ct1, ct2]
  const { items } = buildCodexItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  if (groups[0].kind !== "tool_group") throw new Error()
  const item0 = groups[0].items[0]
  if (item0.kind !== "tool") throw new Error()
  const diffs = item0.diffs
  // Only the update file, not the delete
  expect(diffs).toHaveLength(1)
  expect(diffs[0]).toMatchObject({ kind: "patch", filePath: "/src/keep.ts" })
})

test("buildCodexItems chat: single tool entry → solo tool_group", () => {
  const fc = functionCall("c1", "read_file")
  const entries: CodexEntry[] = [fc]
  const { items } = buildCodexItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(1)
})

test("buildCodexItems normal: no tool_group items regardless of consecutive tools", () => {
  const entries: CodexEntry[] = [
    functionCall("c1", "read_file"),
    functionCall("c2", "bash"),
    functionCall("c3", "write_file"),
  ]
  const { items } = buildCodexItems(entries, { viewMode: "normal" })
  expect(items.filter((i) => i.kind === "tool_group")).toHaveLength(0)
})

test("buildCodexItems chat: turn separator emits after the last entry in a grouped run", () => {
  // We need a user message to anchor a turn, then 2 function calls at the end of
  // the turn (so durations.get(lastIdx) is set).
  const user = userMessage("hello", "2026-01-01T00:00:00Z")
  const fc1 = functionCall("c1", "read_file", "2026-01-01T00:00:01Z")
  const fc2 = functionCall("c2", "bash", "2026-01-01T00:00:02Z")
  // Next user message to close the turn
  const user2 = userMessage("done", "2026-01-01T00:00:03Z")
  const entries: CodexEntry[] = [user, fc1, fc2, user2]
  const { items } = buildCodexItems(entries, { viewMode: "chat" })
  // tool_group should be present
  expect(items.some((i) => i.kind === "tool_group")).toBe(true)
  // separator should follow the tool_group (or appear in items)
  expect(items.some((i) => i.kind === "separator")).toBe(true)
})

test("buildCodexItems: compacted entry still emits a compacted item", () => {
  const entries: CodexEntry[] = [compacted()]
  const { items } = buildCodexItems(entries, { viewMode: "chat" })
  expect(items.some((i) => i.kind === "compacted")).toBe(true)
})

test("buildCodexItems chat: apply_patch add file → diffs include the added file", () => {
  const patch = v4aMultiFilePatch([
    { path: "/src/new.ts", op: "add", new: "content" },
  ])
  const ct1 = customToolCall("c1", "apply_patch", patch)
  const ct2 = functionCall("c2", "bash")
  const entries: CodexEntry[] = [ct1, ct2]
  const { items } = buildCodexItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  if (groups[0].kind !== "tool_group") throw new Error()
  const item0 = groups[0].items[0]
  if (item0.kind !== "tool") throw new Error()
  expect(item0.diffs[0]).toMatchObject({
    kind: "patch",
    filePath: "/src/new.ts",
    op: "add",
  })
})

// ---------------------------------------------------------------------------
// Reasoning (thinking) absorption tests (new for errata)
// ---------------------------------------------------------------------------

test("buildCodexItems chat: reasoning between two function_calls → group of 3 with thinking in middle", () => {
  const fc1 = functionCall("c1", "read_file")
  const r = reasoning("thinking about it")
  const fc2 = functionCall("c2", "bash")
  const entries: CodexEntry[] = [fc1, r, fc2]
  const { items } = buildCodexItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(3)
  expect(groups[0].items[0].kind).toBe("tool")
  expect(groups[0].items[1].kind).toBe("thinking")
  expect(groups[0].items[2].kind).toBe("tool")
  // The reasoning entry should NOT appear as a standalone entry
  expect(items.some((i) => i.kind === "entry" && i.entry === r)).toBe(false)
})

test("buildCodexItems chat: reasoning-led run followed by 2 function_calls → group", () => {
  const r = reasoning("planning")
  const fc1 = functionCall("c1", "read_file")
  const fc2 = functionCall("c2", "bash")
  const entries: CodexEntry[] = [r, fc1, fc2]
  const { items } = buildCodexItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(3)
  expect(groups[0].items[0].kind).toBe("thinking")
  expect(groups[0].items[1].kind).toBe("tool")
  expect(groups[0].items[2].kind).toBe("tool")
})

test("buildCodexItems chat: 1 function_call + 1 reasoning → group (relaxed threshold)", () => {
  const fc1 = functionCall("c1", "read_file")
  const r = reasoning("thinking")
  const entries: CodexEntry[] = [fc1, r]
  const { items } = buildCodexItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(2)
})

// ---------------------------------------------------------------------------
// Run-extender transparency: outputs and event_msgs between tool calls
// ---------------------------------------------------------------------------

test("buildCodexItems chat: function_call_output between two function_calls → single group", () => {
  // Regression: previously function_call_output terminated the run, producing
  // two adjacent groups instead of one.
  const fc1 = functionCall("c1", "exec_command")
  const out1 = functionCallOutput("c1")
  const fc2 = functionCall("c2", "exec_command")
  const out2 = functionCallOutput("c2")
  const entries: CodexEntry[] = [fc1, fc2, out1, out2]
  const { items } = buildCodexItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  // Outputs don't produce run items — only the 2 calls
  expect(groups[0].items).toHaveLength(2)
})

test("buildCodexItems chat: event_msg between consecutive tool calls → single merged group", () => {
  // Regression: codex interleaves event_msg entries (token_count,
  // exec_command_end) which previously terminated the run and produced
  // back-to-back groups (e.g. "exec_command ×2" then "write_stdin ×2").
  const fc1 = functionCall("c1", "exec_command")
  const fc2 = functionCall("c2", "exec_command")
  const out1 = functionCallOutput("c1")
  const out2 = functionCallOutput("c2")
  const tokenCount = eventMsg("token_count")
  const execEnd = eventMsg("exec_command_end")
  const fc3 = functionCall("c3", "write_stdin")
  const fc4 = functionCall("c4", "write_stdin")
  const entries: CodexEntry[] = [fc1, fc2, out1, out2, tokenCount, execEnd, fc3, fc4]
  const { items } = buildCodexItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(4)
  expect(groups[0].items.map((it) => it.kind === "tool" && it.name)).toEqual([
    "exec_command",
    "exec_command",
    "write_stdin",
    "write_stdin",
  ])
})

test("buildCodexItems chat: web_search_call entries group as web_search tools", () => {
  // Regression: web_search arrives as response_item payload type
  // web_search_call (not function_call) and was previously bypassing
  // grouping, rendering as individual entries with the green dot.
  const ws1: CodexResponseItem = {
    type: "response_item",
    payload: { type: "web_search_call", status: "completed", action: { type: "search", query: "a" } } as unknown as CodexResponseItem["payload"],
  }
  const ws2: CodexResponseItem = {
    type: "response_item",
    payload: { type: "web_search_call", status: "completed", action: { type: "search", query: "b" } } as unknown as CodexResponseItem["payload"],
  }
  const entries: CodexEntry[] = [ws1, ws2]
  const { items } = buildCodexItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(2)
  expect(groups[0].items.map((it) => it.kind === "tool" && it.name)).toEqual([
    "web_search",
    "web_search",
  ])
  expect(groups[0].summary).toEqual({ web_search: 2 })
})

test("buildCodexItems chat: assistant text between tool runs DOES flush", () => {
  // Assistant messages are visible content and intentionally terminate runs.
  const fc1 = functionCall("c1", "exec_command")
  const fc2 = functionCall("c2", "exec_command")
  const assistantMsg: CodexResponseItem = {
    type: "response_item",
    payload: {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "checking next" }],
    },
  }
  const fc3 = functionCall("c3", "write_stdin")
  const fc4 = functionCall("c4", "write_stdin")
  const entries: CodexEntry[] = [fc1, fc2, assistantMsg, fc3, fc4]
  const { items } = buildCodexItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(2)
})

test("buildCodexItems chat: pure reasoning sequence (no tools) → single thinking-only group", () => {
  const r1 = reasoning("step 1")
  const r2 = reasoning("step 2")
  const r3 = reasoning("step 3")
  const entries: CodexEntry[] = [r1, r2, r3]
  const { items } = buildCodexItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(3)
  expect(groups[0].items.every((it) => it.kind === "thinking")).toBe(true)
})
