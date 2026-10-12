import type { GrokEntry, GrokOutputPart, GrokSession, GrokToolEntry } from "./types"

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function textParts(value: unknown, reasoning = false): { text: string; unknown: unknown[] } {
  if (typeof value === "string") return { text: value, unknown: [] }
  if (value === undefined) return { text: "", unknown: [] }
  if (!Array.isArray(value)) return { text: "", unknown: [value] }
  const texts: string[] = []
  const unknown: unknown[] = []
  for (const part of value) {
    if (
      isObject(part) &&
      typeof part.text === "string" &&
      (part.type === "text" ||
        (reasoning && (part.type === undefined || part.type === "summary_text")))
    ) {
      texts.push(part.text)
    } else {
      unknown.push(part)
    }
  }
  return { text: texts.join("\n"), unknown }
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (isObject(value)) return value
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value)
      if (isObject(parsed)) return parsed
    } catch {
      // Preserve malformed input so the generic tool view can show it.
    }
  }
  return { _raw: value }
}

function resultOutput(result: Record<string, unknown>, toolName: string) {
  const parts = textParts(result.content)
  let text = parts.text
  let exitCode: number | undefined
  if (toolName === "run_terminal_command") {
    const match = /^exit: (-?\d+)(?:\r?\n|$)/.exec(text)
    if (match && Number.isSafeInteger(Number(match[1]))) {
      exitCode = Number(match[1])
      text = text.slice(match[0].length)
    }
  }
  const content: GrokOutputPart[] = text ? [{ type: "text", text }] : []
  const unknown = [...parts.unknown]
  if (Array.isArray(result.images)) {
    for (const image of result.images) {
      if (isObject(image) && image.type === "image" && typeof image.url === "string") {
        content.push({ type: "image", source: { type: "url", url: image.url } })
      } else {
        unknown.push(image)
      }
    }
  } else if (result.images !== undefined) {
    unknown.push(result.images)
  }
  return {
    output: { content, isError: exitCode !== undefined && exitCode !== 0 },
    exitCode,
    unknown,
  }
}

/** Parse a single chat_history.jsonl. No timing or usage is available in this file. */
export function parseGrokEntries(lines: readonly unknown[]): GrokSession {
  const entries: GrokEntry[] = []
  const models: string[] = []
  const callsById = new Map<string, number>()
  const firstResults = new Map<string, { index: number; result: Record<string, unknown> }>()

  // Count before pairing: duplicate call IDs must never claim the same result.
  for (const [index, line] of lines.entries()) {
    if (!isObject(line)) continue
    if (line.type === "assistant" && Array.isArray(line.tool_calls)) {
      for (const call of line.tool_calls) {
        if (isObject(call) && typeof call.id === "string" && call.id) {
          callsById.set(call.id, (callsById.get(call.id) ?? 0) + 1)
        }
      }
    }
    if (
      line.type === "tool_result" &&
      typeof line.tool_call_id === "string" &&
      !firstResults.has(line.tool_call_id)
    ) {
      firstResults.set(line.tool_call_id, { index, result: line })
    }
  }

  const pairedResults = new Set<number>()
  for (const line of lines) {
    if (!isObject(line) || line.type !== "assistant" || !Array.isArray(line.tool_calls)) continue
    for (const call of line.tool_calls) {
      if (
        isObject(call) &&
        typeof call.name === "string" &&
        call.name &&
        typeof call.id === "string" &&
        callsById.get(call.id) === 1
      ) {
        const paired = firstResults.get(call.id)
        if (paired) pairedResults.add(paired.index)
      }
    }
  }

  const unknown = (id: string, label: string, raw: unknown) => {
    entries.push({ kind: "unknown", id, label, raw })
  }
  const unknownParts = (id: string, parts: unknown[]) => {
    parts.forEach((part, index) => unknown(`${id}-part-${index}`, "Unsupported content", part))
  }

  for (const [index, line] of lines.entries()) {
    const id = `grok-${index}`
    if (!isObject(line)) {
      unknown(id, "Unknown record", line)
      continue
    }
    if (line.type === "tool_result") {
      if (!pairedResults.has(index)) unknown(id, "Unmatched tool result", line)
      continue
    }
    if (line.type === "reasoning") {
      const summary = textParts(line.summary, true)
      const content = textParts(line.content, true)
      const text = [summary.text, content.text].filter(Boolean).join("\n")
      if (text.trim()) entries.push({ kind: "message", id, role: "reasoning", text })
      unknownParts(id, [...summary.unknown, ...content.unknown])
      continue
    }
    if (line.type !== "system" && line.type !== "user" && line.type !== "assistant") {
      unknown(id, typeof line.type === "string" ? line.type : "Unknown record", line)
      continue
    }

    const parts = textParts(line.content)
    let text = parts.text
    let role: Extract<GrokEntry, { kind: "message" }>["role"] = line.type
    let label: string | undefined
    const model =
      typeof line.model_id === "string" && line.model_id.trim() ? line.model_id : undefined
    if (line.type === "assistant" && model && !models.includes(model)) models.push(model)
    if (line.type === "user") {
      if (typeof line.prompt_index === "number" && Number.isFinite(line.prompt_index)) {
        const wrapped = /^\s*<user_query>([\s\S]*)<\/user_query>\s*$/.exec(text)
        if (wrapped) text = wrapped[1]!.trim()
      } else {
        role = "context"
        label = /^\s*<user_info(?:\s|>)/.test(text)
          ? "User info"
          : /^\s*<system-reminder(?:\s|>)/.test(text)
            ? "System reminder"
            : "User context"
      }
    }
    if (text.trim()) entries.push({ kind: "message", id, role, text, label, model })
    unknownParts(id, parts.unknown)

    if (line.type === "assistant" && Array.isArray(line.tool_calls)) {
      for (const [callIndex, call] of line.tool_calls.entries()) {
        const toolId = `${id}-tool-${callIndex}`
        if (!isObject(call) || typeof call.name !== "string" || !call.name) {
          unknown(toolId, "Unknown tool call", call)
          continue
        }
        const paired =
          typeof call.id === "string" && callsById.get(call.id) === 1
            ? firstResults.get(call.id)
            : undefined
        const normalized = paired ? resultOutput(paired.result, call.name) : undefined
        const tool: GrokToolEntry = {
          kind: "tool",
          id: toolId,
          name: call.name,
          input: parseArguments(call.arguments),
          output: normalized?.output ?? { content: [], isError: false },
          hasResult: !!paired,
        }
        if (normalized?.exitCode !== undefined) tool.exitCode = normalized.exitCode
        entries.push(tool)
        if (normalized) unknownParts(toolId, normalized.unknown)
      }
    } else if (line.type === "assistant" && line.tool_calls !== undefined) {
      unknown(`${id}-calls`, "Unsupported tool calls", line.tool_calls)
    }
  }
  return { entries, models }
}
