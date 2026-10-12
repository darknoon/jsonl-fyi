import { expect, test } from "bun:test"
import { loadSessionFile } from "./loadSessionFile"

function streamedFile(text: string, chunkSize = 31, size?: number): File {
  const bytes = new TextEncoder().encode(text)
  const file = new File([bytes], "session.jsonl")
  Object.defineProperties(file, {
    // This reproduces a file whose full-file text cannot be read successfully.
    text: {
      value: () => {
        throw new Error("Do not read the whole file as a string")
      },
    },
    stream: {
      value: () => {
        let offset = 0
        return new ReadableStream<Uint8Array>({
          pull(controller) {
            if (offset === bytes.length) {
              controller.close()
              return
            }
            const end = Math.min(offset + chunkSize, bytes.length)
            controller.enqueue(bytes.slice(offset, end))
            offset = end
          },
        })
      },
    },
    ...(size === undefined ? {} : { size: { value: size } }),
  })
  return file
}

const codexHeader = { type: "session_meta", payload: { id: "example", cwd: "/project" } }

test("loadSessionFile streams Codex calls and results while discarding duplicated event output", async () => {
  const call = {
    type: "response_item",
    timestamp: "2026-09-24T00:00:00Z",
    payload: {
      type: "function_call",
      call_id: "call-1",
      name: "exec_command",
      arguments: '{"cmd":"pwd"}',
    },
  }
  const output = {
    type: "response_item",
    payload: { type: "function_call_output", call_id: "call-1", output: "/project 🌿" },
  }
  const usage = { type: "event_msg", payload: { type: "token_count", info: null } }
  const duplicates = Array.from({ length: 12 }, () => ({
    type: "event_msg",
    payload: { type: "exec_command_end", aggregated_output: "duplicate" },
  }))
  const text = [codexHeader, ...duplicates, call, output, usage]
    .map((line) => JSON.stringify(line))
    .join("\n")
  const result = await loadSessionFile(streamedFile(text, 7))
  expect<unknown>(result.session).toEqual({
    format: "codex",
    entries: [codexHeader, call, output, usage],
  })
  expect(result.skipped).toBe(0)
  expect(result.text).toBe(text)
})

test("loadSessionFile filters Claude entries and preserves malformed-line counts", async () => {
  const user = { type: "user", message: { role: "user", content: "hello" } }
  const assistant = {
    type: "assistant",
    message: { role: "assistant", content: [{ type: "text", text: "hi" }] },
  }
  const text = [
    JSON.stringify(user),
    "",
    "invalid",
    '{"type":"file-history-snapshot"}',
    JSON.stringify(assistant),
    "{",
  ].join("\r\n")
  expect<unknown>(await loadSessionFile(streamedFile(text))).toEqual({
    session: { format: "claude", entries: [user, assistant] },
    skipped: 2,
    text,
  })
})

test("loadSessionFile preserves Pi branches for active-path selection", async () => {
  const header = {
    type: "session",
    version: 3,
    id: "session",
    cwd: "/project",
    timestamp: "2026-09-24T00:00:00Z",
  }
  const first = {
    type: "message",
    id: "one",
    parentId: null,
    message: { role: "user", content: "first" },
  }
  const oldBranch = {
    type: "message",
    id: "old",
    parentId: "one",
    message: { role: "user", content: "old branch" },
  }
  const active = {
    type: "message",
    id: "active",
    parentId: "one",
    message: { role: "user", content: "active branch" },
  }
  const result = await loadSessionFile(
    streamedFile([header, first, oldBranch, active].map((line) => JSON.stringify(line)).join("\n")),
  )
  expect<unknown>(result.session).toEqual({
    format: "pi",
    session: {
      header,
      entries: [first, oldBranch, active],
      activeEntries: [first, active],
      hiddenBranchEntryCount: 1,
      orphanedEntryCount: 0,
    },
  })
})

test("loadSessionFile classifies exactly the first ten parsed values", async () => {
  const user = { type: "user", message: { role: "user", content: "hello" } }
  const lines = [...Array.from({ length: 8 }, () => null), user, codexHeader]
  const result = await loadSessionFile(
    streamedFile(lines.map((line) => JSON.stringify(line)).join("\n")),
  )
  expect<unknown>(result.session).toEqual({ format: "codex", entries: [codexHeader] })

  const tooLate = [...Array.from({ length: 10 }, () => null), codexHeader]
  expect(
    (await loadSessionFile(streamedFile(tooLate.map((line) => JSON.stringify(line)).join("\n"))))
      .session,
  ).toBeNull()
})

test("loadSessionFile omits persisted text for files at or above the storage limit", async () => {
  const text = JSON.stringify(codexHeader)
  for (const size of [4_000_000, 804_145_891]) {
    const result = await loadSessionFile(streamedFile(text, 13, size))
    expect<unknown>(result).toEqual({
      session: { format: "codex", entries: [codexHeader] },
      skipped: 0,
    })
    expect("text" in result).toBe(false)
  }
})

test("loadSessionFile returns unknown for empty and unrelated data", async () => {
  for (const text of ["", '{"unrelated":true}\n']) {
    expect<unknown>(await loadSessionFile(streamedFile(text))).toEqual({
      session: null,
      skipped: 0,
      text,
    })
  }
})

test("loadSessionFile propagates read errors rather than reporting unknown format", async () => {
  const file = new File([], "unreadable.jsonl")
  const failure = new Error("File is no longer readable")
  Object.defineProperty(file, "stream", {
    value: () =>
      new ReadableStream({
        start(controller) {
          controller.error(failure)
        },
      }),
  })
  expect(await loadSessionFile(file).catch((error: unknown) => error)).toBe(failure)
})

test("loadSessionFile respects an already aborted load", async () => {
  const controller = new AbortController()
  const reason = new Error("A newer file was chosen")
  controller.abort(reason)
  expect(
    await loadSessionFile(streamedFile(JSON.stringify(codexHeader)), {
      signal: controller.signal,
    }).catch((error: unknown) => error),
  ).toBe(reason)
})

test("loadSessionFile pairs Grok calls across the first ten lines and later stream chunks", async () => {
  const lines = [
    { type: "system", content: "Help with recipe notes." },
    ...Array.from({ length: 8 }, () => ({
      type: "user",
      content: [{ type: "text", text: "Recipe context" }],
    })),
    {
      type: "assistant",
      content: "",
      model_id: "grok-test",
      tool_calls: [
        { id: "soup", name: "read_file", arguments: '{"target_file":"soup.md"}' },
        { id: "salad", name: "read_file", arguments: '{"target_file":"salad.md"}' },
      ],
    },
    { type: "tool_result", tool_call_id: "salad", content: "Salad result" },
    {
      type: "tool_result",
      tool_call_id: "soup",
      content: "Soup result",
      images: [{ type: "image", url: "data:image/png;base64,synthetic" }],
    },
    {
      type: "assistant",
      content: "Check the dessert too.",
      tool_calls: [{ id: "dessert", name: "read_file", arguments: '{"target_file":"dessert.md"}' }],
    },
    { type: "tool_result", tool_call_id: "dessert", content: "Dessert result" },
  ]
  const text = lines.map((line) => JSON.stringify(line)).join("\n")
  const result = await loadSessionFile(streamedFile(text, 7))
  expect(result.session?.format).toBe("grok")
  if (result.session?.format !== "grok") throw new Error("Expected Grok session")
  const tools = result.session.session.entries.filter((entry) => entry.kind === "tool")
  expect(
    tools.map((tool) => [tool.input.target_file, tool.hasResult, tool.output.content[0]]),
  ).toEqual([
    ["soup.md", true, { type: "text", text: "Soup result" }],
    ["salad.md", true, { type: "text", text: "Salad result" }],
    ["dessert.md", true, { type: "text", text: "Dessert result" }],
  ])
  expect(tools[0].output.content[1]).toEqual({
    type: "image",
    source: { type: "url", url: "data:image/png;base64,synthetic" },
  })
  expect(result.session.session.models).toEqual(["grok-test"])
  expect(result.text).toBe(text)
})

test("loadSessionFile detects Grok companions beyond the format sampling window", async () => {
  const companions = [
    [
      "events.jsonl",
      {
        type: "turn_started",
        ts: "2026-01-01T00:00:00Z",
        schema_version: "1.0",
        session_id: "recipe-example",
        model_id: "grok-test",
        turn_number: 1,
        conversation_message_count: 0,
        session_relationship: null,
        yolo_mode: false,
      },
    ],
    [
      "updates.jsonl",
      {
        method: "_x.ai/session/update",
        timestamp: 1,
        params: { sessionId: "recipe-example", update: { sessionUpdate: "turn_completed" } },
      },
    ],
  ] as const
  for (const [name, marker] of companions) {
    const text = [...Array.from({ length: 12 }, () => ({ unrelated: true })), marker]
      .map((line) => JSON.stringify(line))
      .join("\n")
    const result = await loadSessionFile(streamedFile(text, 5, 4_000_000))
    expect(result.session).toBeNull()
    expect(result.grokCompanion).toBe(name)
    expect(result.text).toBeUndefined()
  }
})
