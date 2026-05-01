const CODEX_TYPES = new Set([
  "session_meta",
  "response_item",
  "turn_context",
  "event_msg",
  "compacted",
])
const CLAUDE_TYPES = new Set(["user", "assistant", "system"])
const PI_TYPES = new Set(["model_change", "thinking_level_change"])

export type FormatLabel = "claude" | "codex" | "pi" | "unknown"

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
  for (let i = 0; i < lines.length && i < 10; i++) {
    const line = lines[i]
    if (!line || typeof line !== "object") continue
    const obj = line as Record<string, unknown>
    const t = obj.type
    if (typeof t !== "string") continue
    if (CODEX_TYPES.has(t)) return "codex"
    if (isPiSessionHeader(obj) || PI_TYPES.has(t)) return "pi"
    if (CLAUDE_TYPES.has(t)) sawClaude = true
  }
  return sawClaude ? "claude" : "unknown"
}
