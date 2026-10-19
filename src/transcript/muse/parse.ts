import { isMuseDurableRecord } from "./detect"
import { parseMuseDurableEntries } from "./durable"
import type {
  MuseEntry,
  MuseModel,
  MuseRun,
  MuseSession,
  MuseToolEntry,
  MuseToolStatus,
} from "./types"

type ObjectValue = Record<string, unknown>
type RecordValue = {
  raw: unknown
  id: string
  sessionId: string
  sequence?: number
  recordedAt?: number
  type: string
  payload: ObjectValue
  order: number
  unsupported?: boolean
}
type Task = { id: string; records: RecordValue[]; kinds: Set<string>; calls: Set<string> }
const object = (value: unknown): ObjectValue =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as ObjectValue) : {}
const string = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined
const number = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined
const lifecycle = new Set([
  "proposed",
  "accepted",
  "scheduled",
  "side_effect_intent",
  "started",
  "completed",
  "status",
  "output",
  "tool_output_ref",
  "rejected",
  "failed",
  "cancelled",
])
const terminalStatus: Record<string, MuseToolStatus> = {
  completed: "success",
  failed: "error",
  rejected: "rejected",
  cancelled: "cancelled",
}
const TIMING_UNAVAILABLE =
  "Timing unavailable: this event ledger does not establish a wall-clock timestamp unit."

function unknown(record: RecordValue, label = record.type): MuseEntry {
  return { kind: "unknown", id: record.id, label, raw: record.raw }
}
function event(record: RecordValue): ObjectValue {
  return object(record.payload.event)
}
function suffix(record: RecordValue): string {
  return record.type.slice("task.lifecycle.".length)
}
function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}
function jsonObject(value: string): ObjectValue {
  try {
    return object(JSON.parse(value))
  } catch {
    return {}
  }
}

function buildRun(id: string, sessionId: string, records: RecordValue[]): MuseRun {
  const run: MuseRun = {
    id,
    sessionId,
    prompt: undefined,
    entries: [],
    records: records.map((record) => record.raw),
  }
  const positioned: { order: number; entry: MuseEntry }[] = []
  const diagnostics: unknown[] = []
  const tasks = new Map<string, Task>()
  const results = new Map<string, RecordValue[]>()
  const deltas: RecordValue[] = []
  const terminals: RecordValue[] = []
  const prompts: RecordValue[] = []
  const push = (record: RecordValue, entry: MuseEntry) =>
    positioned.push({ order: record.order, entry })

  for (const record of records) {
    const p = record.payload
    if (record.unsupported) {
      push(record, unknown(record, `Unsupported Muse schema: ${record.type}`))
      continue
    }
    if (record.type === "run.model.configured") {
      const raw = string(p.model_id)
      if (!raw) {
        push(record, unknown(record))
        continue
      }
      const model: MuseModel = { raw, label: string(p.display_label) || raw }
      if (!run.model) run.model = model
      else if (run.model.raw !== raw || run.model.label !== model.label)
        push(record, unknown(record, "Model changed during run"))
      continue
    }
    if (record.type === "turn.input.user" || record.type === "run.lifecycle.started") {
      if (typeof p.prompt !== "string") {
        push(record, unknown(record, "User input with unavailable prompt"))
        continue
      }
      prompts.push(record)
      continue
    }
    if (record.type === "run.output.delta") {
      if (typeof p.text === "string") deltas.push(record)
      else push(record, unknown(record))
      continue
    }
    if (
      record.type === "run.terminal.completed" ||
      record.type === "run.terminal.failed" ||
      record.type === "run.terminal.cancelled"
    ) {
      terminals.push(record)
      continue
    }
    if (record.type === "todo.snapshot.updated") {
      push(record, unknown(record, "Task list"))
      continue
    }
    if (record.type === "tool.result") {
      const call = string(p.call_id)
      if (!call || typeof p.text !== "string") {
        push(record, unknown(record, "Unpaired tool result"))
        continue
      }
      const group = results.get(call) ?? []
      group.push(record)
      results.set(call, group)
      continue
    }
    if (
      record.type === "task.stream.linked" ||
      (record.type.startsWith("task.lifecycle.") && lifecycle.has(suffix(record)))
    ) {
      const ids = unique(
        [string(p.task_id), string(object(p.task_stream).id), string(event(record).task_id)].filter(
          (value): value is string => !!value,
        ),
      )
      if (ids.length !== 1) {
        push(record, unknown(record, "Task with missing or conflicting identity"))
        continue
      }
      const taskId = ids[0]!
      const task = tasks.get(taskId) ?? {
        id: taskId,
        records: [],
        kinds: new Set<string>(),
        calls: new Set<string>(),
      }
      task.records.push(record)
      const kind = string(event(record).task_kind)
      if (kind) task.kinds.add(kind)
      const key = string(event(record).idempotency_key)
      if (
        (suffix(record) === "scheduled" || suffix(record) === "side_effect_intent") &&
        key?.startsWith("tool:") &&
        key.length > 5
      )
        task.calls.add(key.slice(5))
      tasks.set(taskId, task)
      continue
    }
    if (record.type === "runtime.command.accepted" || record.type === "session.run.linked") {
      diagnostics.push(record.raw)
      continue
    }
    push(record, unknown(record))
  }

  const primaryPrompt = prompts.find((record) => record.type === "turn.input.user") ?? prompts[0]
  run.prompt = string(primaryPrompt?.payload.prompt)
  for (const record of prompts) {
    if (record.payload.prompt !== run.prompt)
      push(record, unknown(record, "Conflicting prompt in run"))
  }
  const terminal = terminals.at(-1)
  if (terminal) {
    run.terminal = string(terminal.payload.terminal) ?? terminal.type.slice("run.terminal.".length)
    run.reason = string(terminal.payload.reason)
    if (terminals.length > 1)
      diagnostics.push({
        label: "Multiple terminal records",
        records: terminals.map((record) => record.raw),
      })
  }
  const streamedText = deltas.map((record) => record.payload.text).join("")
  const finalText = string(terminal?.payload.text)
  const text = finalText ?? streamedText
  const messageAt = deltas[0] ?? terminal
  if (text && messageAt)
    push(messageAt, {
      kind: "message",
      id: `${messageAt.id}:message`,
      text,
    })
  if (finalText !== undefined && streamedText && finalText !== streamedText) {
    diagnostics.push({
      label: "Streamed text differs from terminal text; terminal text is displayed",
      streamedText,
      terminalText: finalText,
    })
  }

  const tasksByCall = new Map<string, Task[]>()
  for (const task of tasks.values()) {
    for (const call of task.calls) {
      const group = tasksByCall.get(call) ?? []
      group.push(task)
      tasksByCall.set(call, group)
    }
  }
  const pairedResults = new Set<RecordValue>()
  const infrastructure: unknown[] = []
  for (const task of tasks.values()) {
    const kinds = [...task.kinds]
    const kind = kinds.length === 1 ? kinds[0] : undefined
    const stateRecords = task.records.filter((record) => terminalStatus[suffix(record)])
    const stateRecord = stateRecords.at(-1)
    const lifecycleState = stateRecord ? terminalStatus[suffix(stateRecord)]! : "unknown"
    const reason = stateRecord && string(event(stateRecord).reason)
    if (kind && !kind.startsWith("tool.")) {
      infrastructure.push({
        taskId: task.id,
        kind,
        status: lifecycleState,
        reason,
        records: task.records.map((record) => record.raw),
      })
      continue
    }
    if (kinds.length > 1) {
      push(task.records[0]!, {
        kind: "unknown",
        id: `${task.records[0]!.id}:conflict`,
        label: "Task with conflicting kinds",
        raw: task.records.map((record) => record.raw),
      })
      continue
    }
    const call = task.calls.size === 1 ? [...task.calls][0] : undefined
    const candidates = call ? (results.get(call) ?? []) : []
    const unambiguous = call && tasksByCall.get(call)?.length === 1 && candidates.length <= 1
    const result = unambiguous ? candidates[0] : undefined
    const facts = object(result?.payload.correlation_facts)
    const name = kind?.slice(5) || string(facts.tool_name) || "Unknown tool"
    // A task without an observed tool kind or unique result is infrastructure,
    // not evidence that an assistant invoked a tool.
    if (!kind && !result) {
      infrastructure.push({
        taskId: task.id,
        kind: "unknown",
        records: task.records.map((record) => record.raw),
      })
      continue
    }
    if (result) pairedResults.add(result)
    const chunks = task.records.filter(
      (record) => suffix(record) === "output" && typeof event(record).chunk === "string",
    )
    const output =
      string(result?.payload.text) ?? chunks.map((record) => event(record).chunk as string).join("")
    if (
      result &&
      chunks.length &&
      chunks.map((record) => event(record).chunk as string).join("") !== output
    ) {
      diagnostics.push({
        label: "Lifecycle output differs from tool result",
        taskId: task.id,
        outputs: chunks.map((record) => record.raw),
      })
    }
    const shell = name === "bash" || name === "bash_input" ? jsonObject(output) : {}
    let status: MuseToolStatus = lifecycleState
    const outcome = string(facts.outcome)
    if (outcome === "failure") status = "error"
    else if (outcome === "cancelled") status = "cancelled"
    else if (outcome === "success" && status === "unknown") status = "success"
    const exitCode = number(shell.exit_code)
    if ((exitCode !== undefined && exitCode !== 0) || shell.terminal_status === "failed")
      status = "error"
    else if (status !== "error" && status !== "rejected") {
      if (shell.terminal_status === "cancelled") status = "cancelled"
      else if (
        status !== "cancelled" &&
        (shell.execution_state === "background_running" || shell.terminal_status === "running")
      )
        status = "running"
      else if (status === "unknown" && shell.terminal_status === "completed" && exitCode === 0)
        status = "success"
    }
    const proposed =
      task.records.find((record) => suffix(record) === "proposed") ?? task.records[0]!
    const refs = task.records
      .filter((record) => suffix(record) === "tool_output_ref")
      .map((record) => event(record))
    const tool: MuseToolEntry = {
      kind: "tool",
      id: `${proposed.id}:tool`,
      taskId: task.id,
      callId: call,
      name,
      output,
      status,
      reason: reason || string(shell.terminal_reason),
      command: string(shell.command),
      description: string(shell.description),
      editFacts: result?.payload.edit_facts != null ? object(result.payload.edit_facts) : undefined,
      outputRefs: refs.length ? refs : undefined,
    }
    push(proposed, tool)
    if (
      task.calls.size > 1 ||
      (call && (tasksByCall.get(call)?.length !== 1 || candidates.length > 1))
    ) {
      diagnostics.push({
        label: "Ambiguous tool/result identity; results kept separate",
        taskId: task.id,
        callIds: [...task.calls],
        records: task.records.map((record) => record.raw),
      })
    }
  }
  for (const group of results.values()) {
    for (const record of group)
      if (!pairedResults.has(record)) push(record, unknown(record, "Unpaired tool result"))
  }
  if (infrastructure.length || diagnostics.length) {
    const counts = new Map<string, number>()
    for (const task of infrastructure) {
      const value = object(task)
      const label = `${string(value.kind) ?? "unknown"}: ${string(value.status) ?? "unknown"}`
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    positioned.push({
      order: Infinity,
      entry: {
        kind: "diagnostic",
        id: `${sessionId}:${id}:runtime`,
        label: `Runtime events · ${infrastructure.length} ${infrastructure.length === 1 ? "task" : "tasks"}`,
        raw: { summary: Object.fromEntries(counts), tasks: infrastructure, records: diagnostics },
      },
    })
  }
  run.entries = positioned.sort((a, b) => a.order - b.order).map((item) => item.entry)
  return run
}

/** Pure parser: no React, file access, external artifacts, or companion result.json. */
export function parseMuseLedgerEntries(lines: Iterable<unknown>): MuseSession {
  const records: RecordValue[] = []
  const seen = new Map<string, unknown>()
  const sessionOrder = new Map<string, number>()
  let index = 0
  for (const raw of lines) {
    const value = object(raw)
    const sessionId = string(object(value.stream).id) ?? "unknown-session"
    const id = string(value.id) ?? `record-${index}`
    const key = `${sessionId}:${id}`
    const sameId = seen.get(key)
    if (sameId && JSON.stringify(sameId) === JSON.stringify(raw)) continue
    if (!sessionOrder.has(sessionId)) sessionOrder.set(sessionId, sessionOrder.size)
    const record: RecordValue = {
      raw,
      id: `${sessionId}:${id}`,
      sessionId,
      sequence: number(value.sequence),
      recordedAt: number(value.recorded_at),
      type: string(value.payload_type) ?? "Unknown record",
      payload: object(value.payload),
      order: index++,
      unsupported: value.schema_version !== 1 || value.payload_schema_version !== 1,
    }
    if (sameId) {
      record.type = "Conflicting record ID"
      record.id += `:duplicate-${record.order}`
    } else seen.set(key, raw)
    records.push(record)
  }
  records.sort(
    (a, b) =>
      sessionOrder.get(a.sessionId)! - sessionOrder.get(b.sessionId)! ||
      (a.sequence ?? a.order) - (b.sequence ?? b.order) ||
      a.order - b.order,
  )
  records.forEach((record, order) => {
    record.order = order
  })
  const commands = new Map<string, Set<string>>()
  for (const record of records) {
    const runId = string(object(record.payload.run_stream).id)
    const commandId = string(record.payload.command_id)
    if (runId && commandId) {
      const key = `${record.sessionId}:${commandId}`
      const runs = commands.get(key) ?? new Set<string>()
      runs.add(runId)
      commands.set(key, runs)
    }
  }
  const groups = new Map<string, { id: string; sessionId: string; records: RecordValue[] }>()
  for (const record of records) {
    const commandId = string(record.payload.command_id)
    const matching = commands.get(`${record.sessionId}:${commandId}`)
    const runId =
      string(object(record.payload.run_stream).id) ??
      (matching?.size === 1 ? [...matching][0] : undefined)
    const id = runId ?? (commandId ? `command:${commandId}` : `unassigned:${record.id}`)
    const key = `${record.sessionId}:${id}`
    const group = groups.get(key) ?? { id, sessionId: record.sessionId, records: [] }
    group.records.push(record)
    groups.set(key, group)
  }
  const runs = [...groups.values()].map((group) =>
    buildRun(group.id, group.sessionId, group.records),
  )
  const models: MuseModel[] = []
  for (const record of records) {
    if (record.type !== "run.model.configured" || record.unsupported) continue
    const raw = string(record.payload.model_id)
    if (raw && !models.some((model) => model.raw === raw))
      models.push({ raw, label: string(record.payload.display_label) || raw })
  }
  return {
    runs,
    models,
    timingIssue: TIMING_UNAVAILABLE,
  }
}
export function parseMuseEntries(lines: Iterable<unknown>): MuseSession {
  const rows = Array.from(lines)
  return rows.some(isMuseDurableRecord)
    ? parseMuseDurableEntries(rows)
    : parseMuseLedgerEntries(rows)
}
export const parseMuseSession = parseMuseEntries
