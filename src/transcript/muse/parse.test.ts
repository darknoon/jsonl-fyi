import { describe, expect, test } from "bun:test"
import { parseMuseEntries } from "./parse"
import type { MuseEntry, MuseToolEntry } from "./types"

type Row = Record<string, any>
const epoch = Date.UTC(2024, 0, 1) * 1000
function record(sequence: number, payload_type: string, payload: Row = {}, options: Row = {}): Row {
  return {
    schema_version: 1,
    payload_schema_version: 1,
    id: `event-${sequence}`,
    stream: { kind: "session", id: "session" },
    sequence,
    recorded_at: epoch + sequence * 1_000_000,
    record_type: "event",
    durability: "durable",
    causation_id: "run",
    payload_type,
    payload: { command_id: "run", run_stream: { kind: "run", id: "run" }, ...payload },
    ...options,
  }
}
function task(
  sequence: number,
  kind: string,
  taskId: string,
  extra: Row = {},
  options: Row = {},
): Row {
  return record(
    sequence,
    `task.lifecycle.${kind}`,
    {
      task_id: taskId,
      task_stream: { kind: "task", id: taskId },
      event: { kind, task_id: taskId, ...extra },
    },
    options,
  )
}
function result(
  sequence: number,
  call: string,
  text: string,
  facts: Row = { tool_name: "bash", outcome: "success" },
): Row {
  return record(sequence, "tool.result", { call_id: call, text, correlation_facts: facts })
}
const tools = (entries: MuseEntry[]): MuseToolEntry[] =>
  entries.filter((entry): entry is MuseToolEntry => entry.kind === "tool")
const entries = (rows: Row[]) => parseMuseEntries(rows).runs[0]!.entries
function pair(id: string, start = 1): Row[] {
  return [
    task(start, "proposed", id, { task_kind: "tool.bash" }),
    task(start + 1, "scheduled", id, { idempotency_key: `tool:call-${id}` }),
  ]
}

describe("Muse Code identity and pairing", () => {
  test("joins interleaved tasks by scheduled call IDs, preserving proposal order", () => {
    const rows = [
      ...pair("first", 1),
      ...pair("second", 3),
      result(5, "call-second", "second output"),
      result(6, "call-first", "first output"),
    ]
    const parsed = tools(entries([rows[5]!, rows[1]!, rows[3]!, rows[0]!, rows[4]!, rows[2]!]))
    expect(parsed.map((tool) => [tool.taskId, tool.output])).toEqual([
      ["first", "first output"],
      ["second", "second output"],
    ])
  })
  test("folds repeated lifecycle output into a single canonical result", () => {
    const rows = [
      ...pair("a"),
      task(3, "output", "a", { chunk: "hello", final_result: true }),
      task(4, "completed", "a"),
      result(5, "call-a", "hello"),
    ]
    expect(entries(rows)).toHaveLength(1)
    expect(tools(entries(rows))[0]!.output).toBe("hello")
  })
  test("keeps differing lifecycle output as evidence", () => {
    const parsed = entries([
      ...pair("a"),
      task(3, "output", "a", { chunk: "partial", final_result: true }),
      result(4, "call-a", "final"),
    ])
    expect(tools(parsed)[0]!.output).toBe("final")
    expect(parsed.find((entry) => entry.kind === "diagnostic")).toBeDefined()
    expect(JSON.stringify(parsed)).toContain("partial")
  })
  test("does not guess adjacent missing or ambiguous joins", () => {
    const parsed = entries([
      task(1, "proposed", "missing", { task_kind: "tool.bash" }),
      result(2, "orphan", "unmatched"),
      ...pair("a", 3),
      task(5, "proposed", "b", { task_kind: "tool.bash" }),
      task(6, "scheduled", "b", { idempotency_key: "tool:call-a" }),
      result(7, "call-a", "ambiguous"),
    ])
    expect(tools(parsed).map((tool) => tool.output)).toEqual(["", "", ""])
    expect(parsed.filter((entry) => entry.kind === "unknown")).toHaveLength(2)
  })
  test("keeps repeated results instead of choosing one silently", () => {
    const parsed = entries([...pair("a"), result(3, "call-a", "one"), result(4, "call-a", "two")])
    expect(tools(parsed)[0]!.output).toBe("")
    expect(parsed.filter((entry) => entry.kind === "unknown")).toHaveLength(2)
  })
  test("deduplicates record IDs within session only and preserves conflicts", () => {
    const first = record(1, "run.output.delta", { text: "A" })
    const otherSession = { ...first, stream: { kind: "session", id: "other" } }
    const conflicting = { ...first, payload: { ...first.payload, text: "different" } }
    const parsed = parseMuseEntries([first, first, otherSession, conflicting])
    expect(parsed.runs).toHaveLength(2)
    expect(
      parsed.runs.map((run) => run.entries.find((entry) => entry.kind === "message")),
    ).toMatchObject([{ text: "A" }, { text: "A" }])
    expect(
      parsed.runs[0]!.entries.some(
        (entry) => entry.kind === "unknown" && entry.label === "Conflicting record ID",
      ),
    ).toBe(true)
  })
  test("scopes reused task IDs and call IDs to their run", () => {
    const first = [...pair("a"), result(3, "call-a", "first")]
    const second = [...pair("a", 4), result(6, "call-a", "second")].map((row) => ({
      ...row,
      payload: { ...row.payload, command_id: "other", run_stream: { kind: "run", id: "other" } },
    }))
    expect(
      parseMuseEntries([...first, ...second]).runs.map((run) => tools(run.entries)[0]!.output),
    ).toEqual(["first", "second"])
  })
  test("preserves contradictory task identifiers", () => {
    const row = task(1, "proposed", "a", { task_kind: "tool.bash", task_id: "b" })
    expect(entries([row])[0]).toMatchObject({
      kind: "unknown",
      label: "Task with missing or conflicting identity",
    })
  })
})

describe("Muse Code messages and runs", () => {
  test("deduplicates prompts and accumulates deltas only once with terminal text", () => {
    const parsed = parseMuseEntries([
      record(1, "turn.input.user", { prompt: "Update the recipe" }),
      record(2, "run.lifecycle.started", { prompt: "Update the recipe" }),
      record(3, "run.output.delta", { text: "Hello " }),
      record(4, "run.output.delta", { text: "world" }),
      record(5, "run.terminal.completed", { terminal: "completed", text: "Hello world" }),
    ])
    expect(parsed.runs[0]!.prompt).toBe("Update the recipe")
    expect(parsed.runs[0]!.entries).toHaveLength(1)
    expect(parsed.runs[0]!.entries[0]).toMatchObject({ kind: "message", text: "Hello world" })
    expect(parsed.runs[0]!.terminal).toBe("completed")
  })
  test("uses authoritative final text when captured deltas are partial", () => {
    const parsed = entries([
      record(1, "run.output.delta", { text: "The " }),
      record(2, "run.terminal.completed", { text: "The final answer." }),
    ])
    expect(parsed[0]).toMatchObject({ kind: "message", text: "The final answer." })
    expect(parsed.some((entry) => entry.kind === "diagnostic")).toBe(true)
  })
  test("preserves conflicting streaming text in diagnostics", () => {
    const parsed = entries([
      record(1, "run.output.delta", { text: "draft" }),
      record(2, "run.terminal.completed", { text: "revised" }),
    ])
    expect(parsed[0]).toMatchObject({ kind: "message", text: "revised" })
    expect(JSON.stringify(parsed)).toContain("draft")
  })
  test("does not invent completion or a prompt for an incomplete run", () => {
    const parsed = parseMuseEntries([record(1, "run.output.delta", { text: "Partial" })]).runs[0]!
    expect(parsed.prompt).toBeUndefined()
    expect(parsed.terminal).toBeUndefined()
    expect(parsed.durationMs).toBeUndefined()
    expect(parsed.entries[0]).toMatchObject({ kind: "message", text: "Partial" })
  })
  test("retains a second empty-input run as a distinct boundary", () => {
    const parsed = parseMuseEntries([
      record(1, "turn.input.user", { prompt: "First prompt" }),
      record(2, "turn.input.user", {
        prompt: "",
        command_id: "continuation",
        run_stream: { kind: "run", id: "continuation" },
      }),
    ])
    expect(parsed.runs.map((run) => run.prompt)).toEqual(["First prompt", ""])
  })
  test("keeps unknown payloads, unsupported schemas, todo snapshots and model labels", () => {
    const parsed = parseMuseEntries([
      record(1, "run.model.configured", {
        model_id: "example/model",
        display_label: "Example model",
      }),
      record(2, "future.reasoning", { text: "Unknown event" }),
      record(3, "todo.snapshot.updated", {
        facts: { items: [{ text: "Inspect", status: "complete" }] },
      }),
      record(4, "run.output.delta", { text: "future schema" }, { payload_schema_version: 2 }),
    ])
    expect(parsed.models).toEqual([{ raw: "example/model", label: "Example model" }])
    expect(parsed.runs[0]!.model).toEqual(parsed.models[0])
    expect(
      parsed.runs[0]!.entries.map((entry) => (entry.kind === "unknown" ? entry.label : entry.kind)),
    ).toEqual(["future.reasoning", "Task list", "Unsupported Muse schema: run.output.delta"])
  })
})

describe("Muse Code outcomes and artifacts", () => {
  test("a shell nonzero exit takes precedence over framework success", () => {
    const output = JSON.stringify({
      command: "check",
      description: "Check files",
      exit_code: 2,
      terminal_status: "completed",
      output: "bad",
    })
    const parsed = tools(
      entries([...pair("a"), task(3, "completed", "a"), result(4, "call-a", output)]),
    )[0]!
    expect(parsed).toMatchObject({
      status: "error",
      command: "check",
      description: "Check files",
      output,
    })
  })
  test("failure evidence takes precedence over a contradictory running hint", () => {
    const parsed = tools(
      entries([
        ...pair("a"),
        result(3, "call-a", JSON.stringify({ execution_state: "background_running" }), {
          outcome: "failure",
        }),
        ...pair("b", 4),
        result(6, "call-b", JSON.stringify({ terminal_status: "failed" }), { outcome: "success" }),
      ]),
    )
    expect(parsed.map((tool) => tool.status)).toEqual(["error", "error"])
  })
  test("preserves failed tool reason and keeps reminder rejections neutral", () => {
    const parsed = entries([
      ...pair("a"),
      task(3, "failed", "a", { reason: "permission denied" }),
      result(4, "call-a", "tool failed", { outcome: "failure", tool_name: "bash" }),
      task(5, "proposed", "reminder", { task_kind: "reminder.agent.skill-reminder" }),
      task(6, "rejected", "reminder", { reason: "skip_if_running" }),
    ])
    expect(tools(parsed)).toHaveLength(1)
    expect(tools(parsed)[0]).toMatchObject({ status: "error", reason: "permission denied" })
    expect(parsed.at(-1)?.kind).toBe("diagnostic")
    expect(JSON.stringify(parsed.at(-1))).toContain("skip_if_running")
  })
  test("a background result stays running; a status message does not imply success", () => {
    const parsed = tools(
      entries([
        ...pair("background"),
        result(
          3,
          "call-background",
          JSON.stringify({ execution_state: "background_running", output: "" }),
          {},
        ),
        ...pair("pending", 4),
        task(6, "status", "pending", { message: "opening stream" }),
      ]),
    )
    expect(parsed.map((tool) => tool.status)).toEqual(["running", "unknown"])
  })
  test("preserves all edit facts, including path and future metadata", () => {
    const editFacts = {
      path: "recipe.md",
      added: 3,
      removed: 1,
      tool_name: "edit_file",
      future: { retained: true },
    }
    const output = result(3, "call-a", "edited", { tool_name: "edit_file", outcome: "success" })
    output.payload.edit_facts = editFacts
    const parsed = tools(
      entries([
        task(1, "proposed", "a", { task_kind: "tool.edit_file" }),
        task(2, "scheduled", "a", { idempotency_key: "tool:call-a" }),
        output,
      ]),
    )[0]!
    expect(parsed.editFacts).toEqual(editFacts)
  })
  test("keeps cancelled tools and external output references", () => {
    const parsed = tools(
      entries([
        ...pair("a"),
        task(3, "tool_output_ref", "a", {
          availability: "available",
          output_ref: {
            path: "/remote/patch.json",
            uri: "tool-output://local/patch",
            media_type: "application/json",
          },
        }),
        task(4, "cancelled", "a", { reason: "stopped" }),
        result(5, "call-a", "stopped", { outcome: "cancelled" }),
      ]),
    )[0]!
    expect(parsed.status).toBe("cancelled")
    expect(parsed.outputRefs).toMatchObject([
      { availability: "available", output_ref: { path: "/remote/patch.json" } },
    ])
  })
})

describe("Muse Code timing", () => {
  test("does not interpret ledger counters as dates or elapsed time", () => {
    const rows = [
      record(1, "run.lifecycle.started", { prompt: "Work" }),
      ...pair("a", 2),
      task(4, "started", "a"),
      task(6, "completed", "a"),
      result(7, "call-a", "done"),
      record(9, "run.terminal.completed", { terminal: "completed", text: "Done" }),
    ]
    const parsed = parseMuseEntries(rows)
    expect(parsed.timingIssue).toContain("wall-clock")
    expect(parsed.startTimestamp).toBeUndefined()
    expect(parsed.runs[0]!.durationMs).toBeUndefined()
    expect(tools(parsed.runs[0]!.entries)[0]!.durationMs).toBeUndefined()
    expect(parsed.runs[0]!.records).toEqual(rows)
  })
})

describe("Muse Code incomplete identity and retained evidence", () => {
  test("does not pair unresolved commands together", () => {
    const rows = [...pair("a"), result(3, "call-a", "unrelated")].map((row, i) => ({
      ...row,
      payload: { ...row.payload, run_stream: undefined, command_id: i < 2 ? "first" : "second" },
    }))
    const parsed = parseMuseEntries(rows)
    expect(parsed.runs).toHaveLength(2)
    expect(tools(parsed.runs[0]!.entries)[0]!.output).toBe("")
    expect(parsed.runs[1]!.entries[0]).toMatchObject({
      kind: "unknown",
      label: "Unpaired tool result",
    })
  })
  test("does not join records with no run or command evidence", () => {
    const rows = [
      record(1, "run.output.delta", { text: "first" }),
      record(2, "run.output.delta", { text: "second" }),
    ].map((row) => ({ ...row, payload: { text: row.payload.text } }))
    expect(parseMuseEntries(rows).runs).toHaveLength(2)
  })
  test("retains unknown fields on recognized records", () => {
    const row = task(1, "proposed", "a", {
      task_kind: "tool.bash",
      arguments: { command: "example" },
    })
    expect(parseMuseEntries([row]).runs[0]!.records).toEqual([row])
  })
})
