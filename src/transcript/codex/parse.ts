import type { CodexEntry } from "./types"

const KEEP_TYPES = new Set(["session_meta", "turn_context", "response_item", "compacted"])

export function parseCodexEntries(lines: Iterable<unknown>): CodexEntry[] {
  const out: CodexEntry[] = []
  for (const line of lines) {
    if (!line || typeof line !== "object") continue
    const t = (line as { type?: unknown }).type
    if (typeof t !== "string" || !KEEP_TYPES.has(t)) continue
    if (t === "response_item") {
      const payload = (line as { payload?: unknown }).payload
      if (!payload || typeof payload !== "object") continue
      const subtype = (payload as { type?: unknown }).type
      if (typeof subtype !== "string") continue
    }
    out.push(line as CodexEntry)
  }
  return out
}
