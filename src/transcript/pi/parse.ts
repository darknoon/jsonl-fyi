import type { PiParsedSession, PiSessionHeader, PiTreeEntry } from "./types"

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object"
}

function isHeader(value: Record<string, unknown>): value is PiSessionHeader {
  return value.type === "session" && typeof value.id === "string"
}

function isTreeEntry(value: Record<string, unknown>): value is PiTreeEntry {
  return (
    typeof value.type === "string" &&
    value.type !== "session" &&
    typeof value.id === "string" &&
    (typeof value.parentId === "string" || value.parentId === null)
  )
}

export function parsePiEntries(lines: Iterable<unknown>): PiParsedSession {
  let header: PiSessionHeader | null = null
  const entries: PiTreeEntry[] = []

  for (const line of lines) {
    if (!isObject(line)) continue
    if (isHeader(line)) {
      header ??= line
      continue
    }
    if (isTreeEntry(line)) entries.push(line)
  }

  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const activeEntries: PiTreeEntry[] = []
  let orphanedEntryCount = 0
  let current = entries.at(-1)
  const seen = new Set<string>()

  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    activeEntries.unshift(current)
    if (current.parentId == null) break
    const parent = byId.get(current.parentId)
    if (!parent) {
      orphanedEntryCount++
      break
    }
    current = parent
  }

  return {
    header,
    entries,
    activeEntries,
    hiddenBranchEntryCount: Math.max(0, entries.length - activeEntries.length),
    orphanedEntryCount,
  }
}
