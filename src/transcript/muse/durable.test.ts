import { describe, expect, test } from "bun:test"
import { parseMuseDurableEntries } from "./durable"
import type { MuseEntry, MuseToolEntry } from "./types"

type Obj = Record<string, unknown>
const epoch = Date.UTC(2024, 0, 1) * 1000
const record = (sequence: number, type: string, payload: Obj, options: Obj = {}) => ({
  schema_version: 1,
  payload_schema_version: 1,
  id: `record-${sequence}`,
  stream: { kind: "session", id: "example-session" },
  sequence,
  recorded_at: epoch + sequence * 1_000_000,
  record_type: "event",
  durability: "durable",
  causation_id: null,
  payload_type: type,
  payload,
  ...options,
})
const runEvent = (sequence: number, event: Obj, run = "example-run", options: Obj = {}) =>
  record(sequence, "runtime.session", { kind: "run", run_id: run, event }, options)
const callEvent = (
  sequence: number,
  call = "example-call",
  args: unknown = '{"path":"recipe.md"}',
  run = "example-run",
) =>
  runEvent(
    sequence,
    {
      kind: "assistant_tool_calls_committed",
      message_id: `message-${sequence}`,
      tool_calls: [{ id: `provider-${call}`, call_id: call, name: "read_file", args }],
    },
    run,
  )
const resultEvent = (
  sequence: number,
  call = "example-call",
  text = "Recipe text",
  run = "example-run",
) =>
  runEvent(
    sequence,
    {
      kind: "tool_result_batch_committed",
      batch_id: `batch-${sequence}`,
      results: [{ tool_call_id: call, tool_call_index: 0, text }],
    },
    run,
  )
const parse = (rows: unknown[]) => parseMuseDurableEntries(rows)
const entries = (rows: unknown[]) => parse(rows).runs.flatMap((run) => run.entries)
const tools = (values: MuseEntry[]): MuseToolEntry[] =>
  values.filter((entry): entry is MuseToolEntry => entry.kind === "tool")
const frame = (children: unknown[], version = 1) => ({
  retained_frame: "session_permission_transaction",
  frame_schema_version: version,
  outer_log_ordinal: 0,
  transaction_id: "example-transaction",
  content_sha256: "example-checksum",
  children: children.map((value, child_index) => ({
    child_index,
    record_json: JSON.stringify(value),
  })),
  extra_frame_metadata: { retained: true },
})

describe("durable Muse record decoding", () => {
  test("reads framed and direct records while retaining the original frame", () => {
    const first = runEvent(1, { kind: "started", prompt: "Read the recipe" })
    const source = frame([first])
    const parsed = parse([source, callEvent(2), resultEvent(3)])
    expect(parsed.runs).toHaveLength(1)
    expect(parsed.runs[0]!.prompt).toBe("Read the recipe")
    expect(parsed.runs[0]!.records?.[0]).toBe(source)
    expect(tools(parsed.runs[0]!.entries)[0]!.output).toBe("Recipe text")
  })
  test("does not unwrap an unsupported frame version", () => {
    const source = frame([callEvent(1)], 2)
    const parsed = parse([source])
    expect(tools(parsed.runs[0]!.entries)).toHaveLength(0)
    expect(parsed.runs[0]!.entries[0]).toMatchObject({
      kind: "unknown",
      label: "Unsupported retained frame",
      raw: source,
    })
  })
  test("retains malformed children without losing valid siblings", () => {
    const source = frame([callEvent(1)])
    source.children.push({ child_index: 1, record_json: "{invalid" })
    const parsed = parse([source, resultEvent(2)])
    expect(tools(parsed.runs.flatMap((run) => run.entries))[0]!.output).toBe("Recipe text")
    expect(
      parsed.runs
        .flatMap((run) => run.entries)
        .some(
          (entry) => entry.kind === "unknown" && entry.label === "Malformed retained frame JSON",
        ),
    ).toBe(true)
    expect(parsed.runs.every((run) => run.records?.includes(source))).toBe(true)
  })
  test("retains omissions and source-only metadata without inventing a run", () => {
    const marker = {
      retained_marker: "omitted_live_only",
      schema_version: 1,
      stream: { kind: "session", id: "example-session" },
      position: { id: "omission", sequence: 1 },
      omitted_record: { payload_type: "runtime.session", omission_class: "live_only" },
    }
    const parsed = parse([marker, runEvent(2, { kind: "started", prompt: "" })])
    expect(parsed.runs[0]).toMatchObject({ isContext: true, records: [marker] })
    expect(parsed.runs[1]).toMatchObject({ isContext: false, prompt: "" })
    expect(parsed.runs[0]!.entries[0]).toMatchObject({ kind: "diagnostic", raw: [marker] })
  })
  test("gates envelope and payload versions before interpreting content", () => {
    for (const options of [
      { schema_version: 2 },
      { payload_schema_version: 2 },
      { record_type: undefined },
      { durability: "future" },
    ]) {
      const row = runEvent(
        1,
        { kind: "assistant_message_committed", message_id: "message", text: "Unsupported content" },
        "example-run",
        options,
      )
      const parsed = entries([row])
      expect(parsed.some((entry) => entry.kind === "message")).toBe(false)
      expect(parsed.some((entry) => entry.kind === "unknown" && entry.raw === row)).toBe(true)
    }
  })
  test("deduplicates identical envelope identities and preserves conflicting records", () => {
    const first = runEvent(1, {
      kind: "assistant_message_committed",
      message_id: "message",
      text: "First text",
    })
    const conflict = runEvent(1, {
      kind: "assistant_message_committed",
      message_id: "message",
      text: "Conflicting text",
    })
    const parsed = entries([first, first, conflict])
    expect(parsed.filter((entry) => entry.kind === "message")).toHaveLength(1)
    expect(
      parsed.some((entry) => entry.kind === "unknown" && entry.label === "Conflicting record ID"),
    ).toBe(true)
  })
})

describe("durable Muse tool pairing", () => {
  test("pairs by call_id, preserves committed order and decodes original arguments", () => {
    const parsed = tools(
      entries([
        callEvent(1, "first", '{"path":"recipe.md"}'),
        callEvent(2, "second", '{"path":"shopping-list.md"}'),
        resultEvent(3, "second", "Shopping list"),
        resultEvent(4, "first", "Recipe"),
        resultEvent(5, "provider-first", "Must stay unpaired"),
      ]),
    )
    expect(parsed.map((tool) => [tool.callId, tool.output, tool.input])).toEqual([
      ["first", "Recipe", { path: "recipe.md" }],
      ["second", "Shopping list", { path: "shopping-list.md" }],
    ])
    expect(
      entries([callEvent(1), resultEvent(2, "provider-example-call")]).some(
        (entry) => entry.kind === "unknown" && entry.label === "Unpaired tool result",
      ),
    ).toBe(true)
  })
  test("does not pair across runs or sessions", () => {
    const first = callEvent(1)
    const wrongRun = resultEvent(2, "example-call", "Other run", "other-run")
    const wrongSession = { ...resultEvent(3), stream: { kind: "session", id: "other-session" } }
    const parsed = entries([first, wrongRun, wrongSession])
    expect(tools(parsed)[0]!.output).toBe("")
    expect(
      parsed.filter((entry) => entry.kind === "unknown" && entry.label === "Unpaired tool result"),
    ).toHaveLength(2)
  })
  test("keeps ambiguous results and duplicate calls separate", () => {
    const duplicatedResults = entries([callEvent(1), resultEvent(2), resultEvent(3)])
    expect(tools(duplicatedResults)[0]!.output).toBe("")
    expect(duplicatedResults.filter((entry) => entry.kind === "unknown")).toHaveLength(2)
    const duplicatedCalls = entries([callEvent(1), callEvent(2), resultEvent(3)])
    expect(tools(duplicatedCalls).map((tool) => tool.output)).toEqual(["", ""])
    expect(
      duplicatedCalls.some(
        (entry) => entry.kind === "unknown" && entry.label === "Unpaired tool result",
      ),
    ).toBe(true)
  })
  test("gives each unpaired result in a batch a distinct display identity", () => {
    const parsed = entries([
      runEvent(1, {
        kind: "tool_result_batch_committed",
        results: [
          { tool_call_id: "a", text: "A" },
          { tool_call_id: "b", text: "B" },
        ],
      }),
    ])
    expect(new Set(parsed.map((entry) => entry.id)).size).toBe(parsed.length)
  })
  test("preserves missing, malformed and null arguments distinctly", () => {
    const missing = runEvent(1, {
      kind: "assistant_tool_calls_committed",
      tool_calls: [{ id: "provider-a", call_id: "a", name: "read_file" }],
    })
    const parsed = tools(entries([missing, callEvent(2, "b", "{bad"), callEvent(3, "c", "null")]))
    expect(Object.hasOwn(parsed[0]!, "input")).toBe(false)
    expect(parsed[1]!.input).toBe("{bad")
    expect(parsed[2]!.input).toBeNull()
  })
  test("uses explicit nested tool failure and retains unfamiliar source fields", () => {
    const effect = record(3, "tool_batch.effect.terminal", {
      kind: "tool_batch_effect",
      run_id: "example-run",
      record: {
        call_id: "example-call",
        task_id: "task",
        outcome: {
          kind: "completed",
          task_completion: {
            kind: "terminal",
            terminal: { kind: "failed", reason: "Recipe check failed" },
          },
        },
        future_metadata: { retained: true },
      },
    })
    const parsed = parse([callEvent(1), resultEvent(2), effect])
    expect(tools(parsed.runs[0]!.entries)[0]).toMatchObject({
      status: "error",
      reason: "Recipe check failed",
      taskId: "task",
    })
    expect(parsed.runs[0]!.records).toContain(effect)
  })
  test("does not render lifecycle output a second time", () => {
    const task = (sequence: number, event: Obj) =>
      record(sequence, "runtime.session", {
        kind: "task",
        run_id: "example-run",
        task_id: "task",
        event: { task_id: "task", ...event },
      })
    const parsed = entries([
      callEvent(1),
      task(2, { kind: "scheduled", idempotency_key: "tool:example-call" }),
      task(3, { kind: "output", chunk: "Recipe text" }),
      task(4, { kind: "completed" }),
      resultEvent(5),
    ])
    expect(parsed).toHaveLength(1)
    expect(tools(parsed)[0]).toMatchObject({ output: "Recipe text", status: "success" })
  })
})

describe("durable Muse conversation content", () => {
  test("preserves assistant and tool ordering across followup runs", () => {
    const parsed = parse([
      runEvent(1, { kind: "started", prompt: "Read the recipe" }),
      runEvent(2, {
        kind: "assistant_message_committed",
        message_id: "before",
        text: "Reading the recipe.",
      }),
      callEvent(3),
      resultEvent(4),
      runEvent(5, {
        kind: "assistant_message_committed",
        message_id: "after",
        text: "The recipe serves two.",
      }),
      runEvent(6, { kind: "started", prompt: "" }, "followup"),
      runEvent(
        7,
        {
          kind: "assistant_message_committed",
          message_id: "followup-message",
          text: "The check finished.",
        },
        "followup",
      ),
    ])
    expect(parsed.runs.map((run) => run.prompt)).toEqual(["Read the recipe", ""])
    expect(parsed.runs[0]!.entries.map((entry) => entry.kind)).toEqual([
      "message",
      "tool",
      "message",
    ])
    expect(parsed.runs[1]!.terminal).toBeUndefined()
  })
  test("prefers committed reasoning summaries and avoids duplicate text", () => {
    const parsed = entries([
      runEvent(1, {
        kind: "reasoning_committed",
        message_id: "thought",
        text: "",
        encrypted_content: "opaque-example",
      }),
      runEvent(2, {
        kind: "reasoning_summary_delta",
        message_id: "thought",
        summary_index: 0,
        text: "Read the recipe.",
      }),
      runEvent(3, {
        kind: "reasoning_summary_delta",
        message_id: "thought",
        summary_index: 1,
        text: "Check the quantities.",
      }),
      runEvent(4, {
        kind: "reasoning_summary_committed",
        message_id: "thought",
        text: "Read the recipe.\n\nCheck the quantities.",
      }),
      runEvent(5, {
        kind: "reasoning_summary_committed",
        message_id: "thought",
        text: "Read the recipe.\n\nCheck the quantities.",
      }),
    ])
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({
      kind: "thinking",
      text: "Read the recipe.\n\nCheck the quantities.",
    })
  })
  test("assembles partial summaries by paragraph and preserves conflicting commits", () => {
    const deltas = [
      runEvent(1, {
        kind: "reasoning_summary_delta",
        message_id: "thought",
        summary_index: 0,
        text: "Read ",
      }),
      runEvent(2, {
        kind: "reasoning_summary_delta",
        message_id: "thought",
        summary_index: 0,
        text: "recipe.",
      }),
      runEvent(3, {
        kind: "reasoning_summary_delta",
        message_id: "thought",
        summary_index: 1,
        text: "Check quantities.",
      }),
    ]
    expect(entries(deltas)[0]).toMatchObject({
      kind: "thinking",
      text: "Read recipe.\n\nCheck quantities.",
    })
    const conflicting = entries([
      runEvent(4, { kind: "reasoning_summary_committed", message_id: "thought", text: "First" }),
      runEvent(5, { kind: "reasoning_summary_committed", message_id: "thought", text: "Second" }),
    ])
    expect(
      conflicting.some(
        (entry) => entry.kind === "unknown" && entry.label === "Conflicting reasoning summary",
      ),
    ).toBe(true)
  })
  test("does not turn opaque reasoning into readable text", () => {
    const row = runEvent(1, {
      kind: "reasoning_committed",
      message_id: "thought",
      text: "",
      encrypted_content: "opaque-example",
    })
    const parsed = parse([row])
    expect(parsed.runs[0]!.entries.some((entry) => entry.kind === "thinking")).toBe(false)
    expect(parsed.runs[0]!.records).toContain(row)
  })
  test("attaches embedded images and preserves unknown image parts", () => {
    const image = {
      kind: "image",
      media_type: "image/png",
      base64_data: "aW52ZW50ZWQ=",
      path: "recipe.png",
    }
    const row = runEvent(3, {
      kind: "tool_result_model_visible_content",
      call_id: "example-call",
      content: [image, { kind: "future", payload: "unknown content" }],
    })
    const parsed = parse([callEvent(1), resultEvent(2), row])
    expect(tools(parsed.runs[0]!.entries)[0]!.images).toEqual([
      { mediaType: "image/png", data: "aW52ZW50ZWQ=" },
    ])
    expect(
      parsed.runs[0]!.entries.some(
        (entry) => entry.kind === "unknown" && entry.label === "Unrecognized model-visible content",
      ),
    ).toBe(true)
    expect(parsed.runs[0]!.records).toContain(row)
  })
})

describe("durable Muse model and timing metadata", () => {
  test("does not interpret model data under an unknown payload kind", () => {
    const row = record(1, "runtime.session.metadata", {
      kind: "future_metadata",
      record: { model_id: "example/model" },
    })
    const parsed = parse([row])
    expect(parsed.models).toEqual([])
    expect(parsed.runs[0]!.entries[0]).toMatchObject({ kind: "unknown", raw: row })
  })
  test("enriches session model labels from configured run metadata", () => {
    const parsed = parse([
      record(1, "runtime.session.metadata", {
        kind: "metadata",
        record: { model_id: "example/model" },
      }),
      record(2, "run.model.configured", {
        kind: "run_model",
        record: {
          model_id: "example/model",
          display_label: "Example model",
          run_stream: { kind: "run", id: "example-run" },
        },
      }),
    ])
    expect(parsed.models).toEqual([{ raw: "example/model", label: "Example model" }])
    expect(parsed.runs[0]!.isContext).toBe(true)
    expect(parsed.runs[1]!.model).toEqual(parsed.models[0])
  })
  test("uses explicit run duration instead of subtracting recorded timestamps", () => {
    const parsed = parse([
      runEvent(1, { kind: "started", prompt: "Read" }),
      runEvent(3, { kind: "terminal", terminal: "completed", turn_duration_ms: 1250 }),
    ])
    expect(parsed.startTimestamp).toBe("2024-01-01T00:00:01.000Z")
    expect(parsed.runs[0]!.durationMs).toBe(1250)
    const missing = parse([
      runEvent(1, { kind: "started", prompt: "Read" }),
      runEvent(3, { kind: "terminal", terminal: "completed" }),
    ])
    expect(missing.runs[0]!.durationMs).toBeUndefined()
  })
  test("suppresses invalid clocks while keeping explicit durations", () => {
    for (const recorded_at of [undefined, 17, epoch - 1]) {
      const parsed = parse([
        runEvent(1, { kind: "started", prompt: "Read" }),
        runEvent(
          2,
          { kind: "terminal", terminal: "completed", turn_duration_ms: 500 },
          "example-run",
          { recorded_at },
        ),
      ])
      expect(parsed.startTimestamp).toBeUndefined()
      expect(parsed.runs[0]!.timestamp).toBeUndefined()
      expect(parsed.runs[0]!.durationMs).toBe(500)
      expect(parsed.timingIssue).toBeUndefined()
    }
  })
})
