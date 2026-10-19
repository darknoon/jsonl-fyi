import type {
  MuseEntry,
  MuseModel,
  MuseRun,
  MuseSession,
  MuseToolEntry,
  MuseToolStatus,
} from "./types"

type Obj = Record<string, unknown>
type Row = {
  raw: unknown
  source: unknown
  id: string
  session: string
  sequence?: number
  timestamp?: string
  payload: Obj
  type: string
  issue?: string
  order: number
}
type Positioned = { order: number; entry: MuseEntry }
type Call = { row: Row; value: Obj; entry: MuseToolEntry }
type Result = { row: Row; value: Obj; callId: string; text: string; index: number }
const obj = (value: unknown): Obj | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Obj) : undefined
const str = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined)
const id = (value: unknown): string | undefined => str(value) || undefined
const integer = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined
const duration = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined
const key = (...parts: string[]) => JSON.stringify(parts)
const eventOf = (row: Row): Obj => obj(row.payload.event) ?? {}
const recordOf = (row: Row): Obj => obj(row.payload.record) ?? {}
const append = <T>(map: Map<string, T[]>, name: string, value: T) => {
  const values = map.get(name) ?? []
  values.push(value)
  map.set(name, values)
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function timestamp(value: unknown): string | undefined {
  const micros = integer(value)
  if (micros === undefined) return undefined
  const millis = micros / 1000
  if (millis < Date.UTC(2000, 0, 1) || millis >= Date.UTC(2100, 0, 1)) return undefined
  return new Date(millis).toISOString()
}

/** Decode only the supported frame; retain its complete source alongside every child. */
function decode(lines: Iterable<unknown>): Row[] {
  const rows: Row[] = []
  const add = (raw: unknown, source = raw, issue?: string) => {
    const value = obj(raw) ?? {}
    const stream = obj(value.stream)
    const marker = value.retained_marker === "omitted_live_only"
    const sequence = integer(marker ? obj(value.position)?.sequence : value.sequence)
    const payload = obj(value.payload)
    const valid =
      value.schema_version === 1 &&
      id(value.id) &&
      stream?.kind === "session" &&
      id(stream.id) &&
      sequence !== undefined &&
      (value.record_type === "event" ||
        value.record_type === "status" ||
        value.record_type === "reconciliation") &&
      (value.durability === "durable" || value.durability === "ephemeral") &&
      id(value.payload_type) &&
      payload &&
      typeof value.payload_schema_version === "number"
    rows.push({
      raw,
      source,
      id: `durable-record-${rows.length}`,
      session: id(stream?.id) ?? "unknown-session",
      sequence,
      timestamp: timestamp(value.recorded_at),
      order: rows.length,
      payload: payload ?? {},
      type: str(value.payload_type) ?? "Unknown record",
      issue:
        issue ??
        (marker
          ? value.schema_version === 1
            ? "Omitted live-only record"
            : "Unsupported retained marker"
          : !valid
            ? "Malformed or unsupported record envelope"
            : undefined),
    })
  }
  for (const raw of lines) {
    const frame = obj(raw)
    if (!frame || !("retained_frame" in frame)) {
      add(raw)
      continue
    }
    if (
      frame.retained_frame !== "session_permission_transaction" ||
      frame.frame_schema_version !== 1 ||
      !Array.isArray(frame.children)
    ) {
      add(raw, raw, "Unsupported retained frame")
      continue
    }
    if (!frame.children.length) add(raw, raw, "Empty retained frame")
    const indexes = new Set<number>()
    for (const child of frame.children) {
      const value = obj(child)
      const index = integer(value?.child_index)
      if (index === undefined || indexes.has(index) || typeof value?.record_json !== "string") {
        add(child, raw, "Malformed retained frame child")
        continue
      }
      indexes.add(index)
      try {
        add(JSON.parse(value.record_json), raw)
      } catch {
        add(child, raw, "Malformed retained frame JSON")
      }
    }
  }
  const seen = new Map<string, unknown>()
  return rows.filter((row) => {
    const recordId = id(obj(row.raw)?.id)
    if (!recordId || row.issue) return true
    const identity = key(row.session, recordId)
    if (!seen.has(identity)) {
      seen.set(identity, row.raw)
      return true
    }
    if (same(seen.get(identity), row.raw)) return false
    row.issue = "Conflicting record ID"
    return true
  })
}

function modelOf(row: Row): MuseModel | undefined {
  const record = recordOf(row)
  const raw = id(record.model_id)
  return raw ? { raw, label: id(record.display_label) ?? raw } : undefined
}

const taskKinds = new Set([
  "proposed",
  "accepted",
  "scheduled",
  "side_effect_intent",
  "started",
  "completed",
  "failed",
  "rejected",
  "cancelled",
  "status",
  "output",
  "tool_output_ref",
])
const runtimeKinds = new Set([
  "context_block_diagnostic",
  "model_request_configured",
  "provider_request_options_configured",
  "model_input_trace_recorded",
  "task_stream_linked",
  "model_response_created",
  "goal_usage_attribution",
  "model_completed",
  "resource_usage_sampled",
])
const metadataTypes = new Set([
  "runtime.session.permission_format_declared",
  "runtime.session.permission_profile_committed",
  "runtime.session.route_facts",
  "session.opened.observed",
  "runtime.session.capture_selection",
  "runtime.command_intake.session_name.received",
  "runtime.command_intake.settled",
  "runtime.retained_fact",
  "runtime.user_intent.accepted",
  "runtime.user_intent.materialized",
  "session.name.changed",
  "session.end",
])
const terminalStatus = (value: unknown): MuseToolStatus | undefined => {
  switch (value) {
    case "completed":
      return "success"
    case "failed":
      return "error"
    case "rejected":
      return "rejected"
    case "cancelled":
      return "cancelled"
    case "running":
      return "running"
    default:
      return undefined
  }
}

function buildRun(runId: string, sessionId: string, rows: Row[], validClock: boolean): MuseRun {
  const run: MuseRun = {
    id: runId,
    sessionId,
    prompt: undefined,
    entries: [],
    records: [...new Set(rows.map((row) => row.source))],
  }
  const positioned: Positioned[] = []
  const diagnostics: unknown[] = []
  const calls = new Map<string, Call[]>()
  const results = new Map<string, Result[]>()
  const content = new Map<string, Row[]>()
  const effects = new Map<string, Row[]>()
  const taskRows = new Map<string, Row[]>()
  const reasoning = new Map<string, Row[]>()
  const messages = new Map<string, string>()
  const push = (row: Row, entry: MuseEntry) => positioned.push({ order: row.order, entry })
  const fallback = (row: Row, label: string, raw: unknown = row.raw, suffix = "") =>
    push(row, { kind: "unknown", id: row.id + suffix, label, raw })

  for (const row of rows) {
    if (row.issue) {
      if (row.issue === "Omitted live-only record") diagnostics.push(row.raw)
      else fallback(row, row.issue)
      continue
    }
    if (obj(row.raw)?.payload_schema_version !== 1) {
      fallback(row, `Unsupported payload schema: ${row.type}`)
      continue
    }
    const p = row.payload
    if (metadataTypes.has(row.type)) {
      diagnostics.push(row.raw)
      continue
    }
    if (row.type === "run.model.configured" && p.kind === "run_model") {
      const model = modelOf(row)
      if (!model) fallback(row, "Model metadata without a model identity")
      else if (!run.model) run.model = model
      else if (!same(run.model, model)) fallback(row, "Model changed during run")
      continue
    }
    if (row.type === "runtime.session.metadata" && p.kind === "metadata") {
      diagnostics.push(row.raw)
      continue
    }
    if (row.type === "tool_batch.effect.terminal" && p.kind === "tool_batch_effect") {
      const callId = id(recordOf(row).call_id)
      if (callId) append(effects, callId, row)
      else fallback(row, "Tool outcome without a call identity")
      continue
    }
    if (row.type === "tool_batch.effect.started" && p.kind === "tool_batch_effect") {
      diagnostics.push(row.raw)
      continue
    }
    if (
      row.type === "runtime.session.task" ||
      (row.type === "runtime.session" && p.kind === "task")
    ) {
      const event = eventOf(row)
      const identities = [
        ...new Set([id(p.task_id), id(event.task_id)].filter((value): value is string => !!value)),
      ]
      if (identities.length !== 1 || !taskKinds.has(str(event.kind) ?? ""))
        fallback(row, "Unrecognized task event")
      else append(taskRows, identities[0]!, row)
      continue
    }
    if (row.type !== "runtime.session" || p.kind !== "run" || !id(p.run_id)) {
      fallback(row, row.type)
      continue
    }
    const event = eventOf(row)
    const kind = str(event.kind)
    if (kind === "started") {
      if (typeof event.prompt !== "string") fallback(row, "Run start without prompt text")
      else if (run.prompt === undefined) run.prompt = event.prompt
      else if (run.prompt !== event.prompt) fallback(row, "Conflicting prompt in run")
      if (validClock) run.timestamp ??= row.timestamp
    } else if (kind === "assistant_message_committed") {
      const messageId = id(event.message_id)
      if (!messageId || typeof event.text !== "string") {
        fallback(row, "Malformed assistant message")
      } else if (messages.has(messageId)) {
        if (messages.get(messageId) !== event.text) fallback(row, "Conflicting assistant message")
      } else {
        messages.set(messageId, event.text)
        if (event.text)
          push(row, {
            kind: "message",
            id: row.id,
            text: event.text,
            timestamp: validClock ? row.timestamp : undefined,
          })
      }
    } else if (kind === "assistant_tool_calls_committed") {
      if (!Array.isArray(event.tool_calls)) {
        fallback(row, "Malformed tool calls")
        continue
      }
      event.tool_calls.forEach((raw, index) => {
        const value = obj(raw)
        const callId = id(value?.call_id)
        const name = id(value?.name)
        if (!value || !callId || !name) {
          fallback(row, "Malformed tool call", raw, `:call-${index}`)
          return
        }
        let input = value.args
        if (typeof input === "string") {
          try {
            input = JSON.parse(input)
          } catch {
            /* Preserve malformed JSON arguments verbatim. */
          }
        }
        const entry: MuseToolEntry = {
          kind: "tool",
          id: `${row.id}:call-${index}`,
          callId,
          name,
          output: "",
          status: "unknown",
          timestamp: validClock ? row.timestamp : undefined,
        }
        if (Object.hasOwn(value, "args")) entry.input = input
        append(calls, callId, { row, value, entry })
        push(row, entry)
      })
    } else if (kind === "tool_result_batch_committed") {
      if (!Array.isArray(event.results)) {
        fallback(row, "Malformed tool results")
        continue
      }
      event.results.forEach((raw, index) => {
        const value = obj(raw)
        const callId = id(value?.tool_call_id)
        if (!value || !callId || typeof value.text !== "string")
          fallback(row, "Malformed tool result", raw, `:result-${index}`)
        else append(results, callId, { row, value, callId, text: value.text, index })
      })
    } else if (kind === "tool_result_model_visible_content") {
      const callId = id(event.call_id)
      if (!callId || !Array.isArray(event.content)) fallback(row, "Malformed model-visible content")
      else append(content, callId, row)
    } else if (
      kind === "reasoning_committed" ||
      kind === "reasoning_summary_delta" ||
      kind === "reasoning_summary_committed"
    ) {
      const messageId = id(event.message_id)
      if (
        !messageId ||
        typeof event.text !== "string" ||
        (kind === "reasoning_summary_delta" && integer(event.summary_index) === undefined)
      )
        fallback(row, "Unrecognized reasoning record")
      else append(reasoning, messageId, row)
    } else if (kind === "terminal") {
      if (!id(event.terminal)) fallback(row, "Run terminal without an outcome")
      else if (run.terminal !== undefined) fallback(row, "Additional run terminal")
      else {
        run.terminal = event.terminal as string
        run.reason = str(event.reason)
        run.durationMs = duration(event.turn_duration_ms)
      }
    } else if (kind && runtimeKinds.has(kind)) diagnostics.push(row.raw)
    else fallback(row, `Unrecognized run event: ${kind ?? "missing kind"}`)
  }

  const tasksByCall = new Map<string, string[]>()
  for (const [taskId, records] of taskRows) {
    const callIds = new Set<string>()
    for (const row of records) {
      const event = eventOf(row)
      const scheduled = str(event.idempotency_key)
      if (
        (event.kind === "scheduled" || event.kind === "side_effect_intent") &&
        scheduled?.startsWith("tool:") &&
        scheduled.length > 5
      )
        callIds.add(scheduled.slice(5))
    }
    if (callIds.size === 1) append(tasksByCall, [...callIds][0]!, taskId)
    else diagnostics.push(...records.map((row) => row.raw))
  }
  for (const [callId, group] of calls) {
    const matches = results.get(callId) ?? []
    if (group.length !== 1 || matches.length > 1) {
      diagnostics.push({ label: "Ambiguous tool/result identity", callId })
      continue
    }
    const call = group[0]!
    const entry = call.entry
    const result = matches[0]
    if (result) {
      entry.output = result.text
      results.delete(callId)
    }
    const taskIds = tasksByCall.get(callId) ?? []
    const task = taskIds.length === 1 ? taskRows.get(taskIds[0]!) : undefined
    if (task) {
      entry.taskId = taskIds[0]
      if (!result)
        entry.output = task
          .filter((row) => eventOf(row).kind === "output")
          .map((row) => str(eventOf(row).chunk) ?? "")
          .join("")
      const states = task.map(eventOf).filter((event) => terminalStatus(event.kind))
      const state = states.at(-1)
      if (state) {
        entry.status = terminalStatus(state.kind)!
        entry.reason = str(state.reason)
      }
      const refs = task.filter((row) => eventOf(row).kind === "tool_output_ref").map(eventOf)
      if (refs.length) entry.outputRefs = refs
    }
    const outcomes = effects.get(callId) ?? []
    if (outcomes.length === 1) {
      const effect = recordOf(outcomes[0]!)
      const outcome = obj(effect.outcome) ?? {}
      const completion = obj(outcome.task_completion)
      const terminal = obj(completion?.terminal)
      entry.status = terminalStatus(terminal?.kind) ?? terminalStatus(outcome.kind) ?? entry.status
      entry.reason = str(terminal?.reason) ?? str(outcome.reason) ?? entry.reason
      entry.taskId ??= id(effect.task_id)
      effects.delete(callId)
    }
    if (entry.name === "bash" || entry.name === "bash_input") {
      let shell: Obj | undefined
      try {
        shell = obj(JSON.parse(entry.output))
      } catch {
        /* Plain-text output is valid. */
      }
      if (shell) {
        entry.command = str(shell.command)
        entry.description = str(shell.description)
        entry.reason ??= str(shell.terminal_reason)
        if (
          (typeof shell.exit_code === "number" &&
            Number.isFinite(shell.exit_code) &&
            shell.exit_code !== 0) ||
          shell.terminal_status === "failed"
        )
          entry.status = "error"
        else if (entry.status !== "error" && entry.status !== "rejected") {
          if (shell.terminal_status === "cancelled") entry.status = "cancelled"
          else if (
            entry.status !== "cancelled" &&
            (shell.execution_state === "background_running" || shell.terminal_status === "running")
          )
            entry.status = "running"
        }
      }
    }
    for (const row of content.get(callId) ?? []) {
      const parts = eventOf(row).content as unknown[]
      parts.forEach((part, index) => {
        const image = obj(part)
        if (
          image?.kind === "image" &&
          typeof image.media_type === "string" &&
          /^image\/[a-zA-Z0-9.+-]+$/.test(image.media_type) &&
          id(image.base64_data)
        ) {
          entry.images ??= []
          entry.images.push({ mediaType: image.media_type, data: image.base64_data as string })
        } else fallback(row, "Unrecognized model-visible content", part, `:content-${index}`)
      })
    }
    content.delete(callId)
  }
  for (const group of results.values())
    for (const result of group)
      fallback(result.row, "Unpaired tool result", result.value, `:unpaired-${result.index}`)
  for (const group of content.values())
    for (const row of group) fallback(row, "Unpaired model-visible content")
  for (const group of effects.values())
    for (const row of group) fallback(row, "Unpaired or ambiguous tool outcome")

  for (const group of reasoning.values()) {
    const committed = group.filter((row) => eventOf(row).kind === "reasoning_summary_committed")
    const texts = new Set<string>()
    const emit = (row: Row, text: string, suffix: string) => {
      if (!text || texts.has(text)) return
      texts.add(text)
      push(row, { kind: "thinking", id: `${row.id}:${suffix}`, text })
    }
    for (const row of group)
      if (eventOf(row).kind === "reasoning_committed")
        emit(row, eventOf(row).text as string, "reasoning")
    const deltas = group.filter((row) => eventOf(row).kind === "reasoning_summary_delta")
    if (committed.length) {
      const summary = committed[0]!
      emit(deltas[0] ?? summary, eventOf(summary).text as string, "summary")
      for (const row of committed.slice(1))
        if (eventOf(row).text !== eventOf(summary).text)
          fallback(row, "Conflicting reasoning summary")
    } else if (deltas.length) {
      const paragraphs = new Map<number, string>()
      for (const row of deltas) {
        const event = eventOf(row)
        const index = event.summary_index as number
        paragraphs.set(index, (paragraphs.get(index) ?? "") + event.text)
      }
      emit(
        deltas[0]!,
        [...paragraphs]
          .sort(([a], [b]) => a - b)
          .map(([, text]) => text)
          .join("\n\n"),
        "summary",
      )
    }
    if (!texts.size) diagnostics.push(...group.map((row) => row.raw))
  }
  if (diagnostics.length)
    positioned.push({
      order: Infinity,
      entry: {
        kind: "diagnostic",
        id: `${sessionId}:${runId}:runtime`,
        label: "Runtime records",
        raw: diagnostics,
      },
    })
  if (!validClock && rows.some((row) => !row.issue))
    positioned.push({
      order: Infinity,
      entry: {
        kind: "diagnostic",
        id: `${sessionId}:${runId}:clock`,
        label: "Recorded timestamps unavailable",
        raw: "One or more timestamps are missing, invalid, or disagree with sequence order; explicit durations are still displayed.",
      },
    })
  run.entries = positioned.sort((a, b) => a.order - b.order).map(({ entry }) => entry)
  return run
}

/** Pure durable-session reader. Companion files and external resources are never loaded. */
export function parseMuseDurableEntries(lines: Iterable<unknown>): MuseSession {
  const rows = decode(lines)
  const sessions = new Map<string, Row[]>()
  for (const row of rows) append(sessions, row.session, row)
  const validClocks = new Map<string, boolean>()
  for (const [session, records] of sessions) {
    if (records.every((row) => row.sequence !== undefined))
      records.sort((a, b) => a.sequence! - b.sequence! || a.order - b.order)
    const dated = records.filter((row) => !row.issue)
    validClocks.set(
      session,
      dated.every(
        (row, index) =>
          row.timestamp !== undefined &&
          (index === 0 ||
            (obj(row.raw)!.recorded_at as number) >=
              (obj(dated[index - 1]!.raw)!.recorded_at as number)),
      ),
    )
  }
  const ordered = [...sessions.values()].flat()
  ordered.forEach((row, index) => {
    row.order = index
  })
  const groups = new Map<string, { id: string; session: string; rows: Row[]; isContext: boolean }>()
  const models: MuseModel[] = []
  for (const row of ordered) {
    const schema = obj(row.raw)?.payload_schema_version
    const supported = !row.issue && schema === 1
    const explicit = supported ? id(row.payload.run_id) : undefined
    const stream =
      supported && row.type === "run.model.configured" ? obj(recordOf(row).run_stream) : undefined
    const nested = stream?.kind === "run" ? id(stream.id) : undefined
    let runId = explicit ?? nested
    if (explicit && nested && explicit !== nested) {
      row.issue = "Conflicting run identity"
      runId = undefined
    }
    const identity = key(row.session, runId ?? "", runId ? "run" : "unassigned")
    const group = groups.get(identity) ?? {
      id: runId ?? "unassigned-records",
      session: row.session,
      rows: [],
      isContext: !runId,
    }
    group.rows.push(row)
    groups.set(identity, group)
    if (
      supported &&
      ((row.type === "run.model.configured" && row.payload.kind === "run_model") ||
        (row.type === "runtime.session.metadata" && row.payload.kind === "metadata"))
    ) {
      const model = modelOf(row)
      if (model) {
        const existing = models.findIndex((value) => value.raw === model.raw)
        if (existing === -1) models.push(model)
        else if (row.type === "run.model.configured" && model.label !== model.raw)
          models[existing] = model
      }
    }
  }
  const runs = [...groups.values()].map((group) => ({
    ...buildRun(group.id, group.session, group.rows, validClocks.get(group.session) ?? false),
    isContext: group.isContext,
  }))
  const first = ordered.find((row) => !row.issue)
  return {
    runs,
    models,
    startTimestamp: first && validClocks.get(first.session) ? first.timestamp : undefined,
  }
}
