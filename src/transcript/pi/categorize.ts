import type { Category, SummaryCounts } from "../groupSummary"
import type { PiGroupItem } from "./buildPiItems"

// Pi on-wire tool names → category. See spec table.
const PI_CATEGORIES: Record<string, Category> = {
  bash: "command",
  edit: "edit",
  write: "create",
  read: "read",
  grep: "search",
  find: "search",
  ls: "command",
  subagent: "subagent",
  plan_tracker: "todo",
}

export function categorizePiTool(name: string): Category {
  return PI_CATEGORIES[name] ?? "command"
}

export function summarizePiGroup(items: PiGroupItem[]): {
  counts: SummaryCounts
  thinkingCount: number
} {
  const counts: SummaryCounts = {}
  let thinkingCount = 0
  for (const it of items) {
    if (it.kind === "thinking") {
      thinkingCount++
      continue
    }
    const cat = categorizePiTool(it.name)
    counts[cat] = (counts[cat] ?? 0) + 1
  }
  return { counts, thinkingCount }
}
