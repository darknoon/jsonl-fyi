import { isMuseDurableRecord, isMuseRecord } from "../transcript/muse/detect"
const CODEX_TYPES = new Set([
  "session_meta",
  "response_item",
  "turn_context",
  "event_msg",
  "compacted",
])
const CLAUDE_TYPES = new Set(["user", "assistant", "system"])
const PI_TYPES = new Set(["model_change", "thinking_level_change"])

export type FormatLabel = "claude" | "codex" | "pi" | "grok" | "muse" | "unknown"

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isGrokRecord(line: Record<string, unknown>): boolean {
  if (line.type === "tool_result" && typeof line.tool_call_id === "string") return true
  return (
    typeof line.type === "string" &&
    CLAUDE_TYPES.has(line.type) &&
    (typeof line.content === "string" || Array.isArray(line.content)) &&
    !("message" in line) &&
    !("uuid" in line) &&
    !("subtype" in line)
  )
}

function isPiSessionHeader(line: Record<string, unknown>): boolean {
  return (
    line.type === "session" &&
    typeof line.version === "number" &&
    typeof line.id === "string" &&
    typeof line.cwd === "string"
  )
}

export function classifyJsonl(lines: readonly unknown[]): FormatLabel {
  let sawClaude = false
  let sawGrok = false
  let sawMuse = false
  for (let i = 0; i < lines.length && i < 10; i++) {
    const line = lines[i]
    if (!line || typeof line !== "object") continue
    const obj = line as Record<string, unknown>
    if (isMuseRecord(obj) || isMuseDurableRecord(obj)) sawMuse = true
    const t = obj.type
    if (typeof t !== "string") continue
    if (CODEX_TYPES.has(t)) return "codex"
    if (isPiSessionHeader(obj) || PI_TYPES.has(t)) return "pi"
    if (isGrokRecord(obj)) sawGrok = true
    if (CLAUDE_TYPES.has(t)) sawClaude = true
  }
  return sawMuse ? "muse" : sawGrok ? "grok" : sawClaude ? "claude" : "unknown"
}

/** Hints for Grok companion streams; these are not supported transcript formats. */
export function detectGrokCompanion(
  lines: readonly unknown[],
): "updates.jsonl" | "events.jsonl" | null {
  for (const line of lines) {
    if (!isObject(line)) continue
    if (
      (line.method === "session/update" || line.method === "_x.ai/session/update") &&
      typeof line.timestamp === "number" &&
      isObject(line.params) &&
      typeof line.params.sessionId === "string" &&
      isObject(line.params.update) &&
      typeof line.params.update.sessionUpdate === "string"
    ) {
      const updateMeta = line.params.update._meta
      const paramsMeta = line.params._meta
      if (
        line.method === "_x.ai/session/update" ||
        (isObject(updateMeta) && isObject(updateMeta["x.ai/tool"])) ||
        (isObject(paramsMeta) && isObject(paramsMeta["x.ai/tool"]))
      )
        return "updates.jsonl"
    }
    if (
      line.type === "turn_started" &&
      typeof line.ts === "string" &&
      typeof line.schema_version === "string" &&
      typeof line.session_id === "string" &&
      typeof line.model_id === "string" &&
      typeof line.turn_number === "number" &&
      typeof line.conversation_message_count === "number" &&
      "session_relationship" in line &&
      typeof line.yolo_mode === "boolean"
    )
      return "events.jsonl"
  }
  return null
}
