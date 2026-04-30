import type { CodexEntry } from "./types"
import { formatCodexModel, type ModelDisplay } from "../model"

export type CodexModelLabels = {
  models: ModelDisplay[]
  byIndex: Map<number, ModelDisplay>
}

export function buildCodexModelLabels(
  entries: CodexEntry[],
  separatorIndices: ReadonlySet<number>,
): CodexModelLabels {
  // Walk entries left-to-right tracking the most recent turn_context.
  // For each separator index, snapshot the (model, effort) effective at
  // that point. Build the discovery-order list deduped on the (label, raw)
  // key — using label captures effort changes; raw captures model changes.
  const labels: ModelDisplay[] = []
  const seen = new Set<string>()
  const byIndex = new Map<number, ModelDisplay>()
  let cur: { model: string; effort?: string } | null = null

  // Snapshot the labels per separator first; we need to know the total
  // count of distinct labels to decide multi vs single.
  const perSepLabel = new Map<number, ModelDisplay>()

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    if (e.type === "turn_context") {
      const m = e.payload.model
      if (m) cur = { model: m, effort: e.payload.effort }
      continue
    }
    if (separatorIndices.has(i) && cur) {
      const label = formatCodexModel(cur.model, cur.effort)
      perSepLabel.set(i, label)
      const key = `${label.raw}|${label.label}`
      if (!seen.has(key)) {
        seen.add(key)
        labels.push(label)
      }
    }
  }

  if (labels.length >= 2) {
    for (const [i, label] of perSepLabel) {
      byIndex.set(i, label)
    }
  }

  return { models: labels, byIndex }
}
