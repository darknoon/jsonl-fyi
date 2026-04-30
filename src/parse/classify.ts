const CODEX_TYPES = new Set(["session_meta", "response_item", "turn_context", "event_msg", "compacted"])
const CLAUDE_TYPES = new Set(["user", "assistant", "system"])

export type FormatLabel = "claude" | "codex" | "unknown"

export function classifyJsonl(lines: readonly unknown[]): FormatLabel {
  let sawClaude = false
  for (let i = 0; i < lines.length && i < 10; i++) {
    const line = lines[i]
    if (!line || typeof line !== "object") continue
    const t = (line as { type?: unknown }).type
    if (typeof t !== "string") continue
    if (CODEX_TYPES.has(t)) return "codex"
    if (CLAUDE_TYPES.has(t)) sawClaude = true
  }
  return sawClaude ? "claude" : "unknown"
}
