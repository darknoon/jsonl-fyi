import type { Entry } from "./types"

const SKIP_TYPES = new Set([
  "file-history-snapshot",
  "queue-operation",
  "permission-mode",
  "last-prompt",
  "attachment",
])

export function parseJsonl(text: string): { entries: Entry[]; skipped: number } {
  const entries: Entry[] = []
  let skipped = 0
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    try {
      const obj = JSON.parse(line) as Entry
      if (obj && typeof obj === "object" && obj.type && !SKIP_TYPES.has(obj.type)) {
        entries.push(obj)
      }
    } catch {
      skipped++
    }
  }
  return { entries, skipped }
}
