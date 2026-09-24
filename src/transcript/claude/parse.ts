import type { Entry } from "../../types"
import { iterJsonlLines } from "../../parse/iter"

const SKIP_TYPES = new Set([
  "file-history-snapshot",
  "queue-operation",
  "permission-mode",
  "last-prompt",
  "attachment",
])

export function parseClaudeEntries(lines: Iterable<unknown>): Entry[] {
  const entries: Entry[] = []
  for (const line of lines) {
    const obj = line as Entry
    if (obj && typeof obj === "object" && obj.type && !SKIP_TYPES.has(obj.type)) {
      entries.push(obj)
    }
  }
  return entries
}

export function parseJsonl(text: string): { entries: Entry[]; skipped: number } {
  const lines = iterJsonlLines(text)
  const entries: Entry[] = []
  let result = lines.next()
  while (!result.done) {
    entries.push(...parseClaudeEntries([result.value]))
    result = lines.next()
  }
  return { entries, skipped: result.value.skipped }
}
