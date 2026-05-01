import type { ToolResult } from "../../types"
import { formatCodexModel, type ModelDisplay } from "../model"
import { TranscriptHeader } from "../TranscriptHeader"
import { PiEntryView } from "./EntryView"
import { extractPiToolResult } from "./toolResult"
import type { PiParsedSession } from "./types"

function buildPiHeaderModels(session: PiParsedSession): ModelDisplay[] {
  const models: ModelDisplay[] = []
  const seen = new Set<string>()
  let model: { provider?: string; modelId: string } | null = null
  let thinkingLevel: string | undefined

  for (const entry of session.activeEntries) {
    if (entry.type === "model_change") {
      model = { provider: entry.provider, modelId: entry.modelId }
    } else if (entry.type === "thinking_level_change") {
      thinkingLevel = entry.thinkingLevel
    }

    if (!model) continue
    const display = formatCodexModel(model.modelId, thinkingLevel)
    const raw = model.provider ? `${model.provider}/${model.modelId}` : model.modelId
    const labeled = { ...display, raw: thinkingLevel ? `${raw}/${thinkingLevel}` : raw }
    const key = `${labeled.raw}|${labeled.label}`
    if (!seen.has(key)) {
      seen.add(key)
      models.push(labeled)
    }
  }

  return models
}

export function PiTranscript({ session }: { session: PiParsedSession }) {
  const results = new Map<string, ToolResult & { details?: unknown }>()
  for (const entry of session.activeEntries) {
    if (entry.type !== "message") continue
    const { message } = entry
    if (message.role !== "toolResult") continue
    results.set(message.toolCallId, { ...extractPiToolResult(message), details: message.details })
  }

  const models = buildPiHeaderModels(session)

  return (
    <div className="transcript">
      {session.header && (
        <TranscriptHeader startTimestamp={session.header.timestamp} models={models} />
      )}
      {session.activeEntries.map((entry) => (
        <PiEntryView key={entry.id} entry={entry} results={results} />
      ))}
      {(session.hiddenBranchEntryCount > 0 || session.orphanedEntryCount > 0) && (
        <div className="pi-branch-footnote">
          {session.hiddenBranchEntryCount > 0 && (
            <span>{session.hiddenBranchEntryCount} entries on other branches are not shown.</span>
          )}
          {session.orphanedEntryCount > 0 && (
            <span>{session.orphanedEntryCount} missing parent link encountered.</span>
          )}
        </div>
      )}
    </div>
  )
}
