import type { ToolResult } from "../../types"
import type { ModelDisplay } from "../model"
import { formatCodexModel } from "../model"
import type { ViewMode } from "../../settings"
import type { ToolDiff } from "../grouping"
import type { PiMessageEntry, PiParsedSession, PiToolCallContent, PiTreeEntry } from "./types"
import { extractPiToolResult } from "./toolResult"
import { parsePiEdits } from "./PiEditTool"
import type { SummaryCounts } from "../groupSummary"
import { summarizePiGroup } from "./categorize"

export type PiResultWithDetails = ToolResult & { details?: unknown }

export type PiGroupItem =
  | { kind: "tool"; name: string; status: "success" | "error"; diffs: ToolDiff[]; call: PiToolCallContent }
  | { kind: "thinking"; entry: PiMessageEntry; blockIndex: number }

// Legacy alias kept for callers that still reference PiToolGroupTool
export type PiToolGroupTool = Extract<PiGroupItem, { kind: "tool" }>

export type RenderItem =
  | { kind: "header"; chatStartIso: string; models: ModelDisplay[] }
  | { kind: "entry"; entry: PiTreeEntry }
  | { kind: "tool_group"; items: PiGroupItem[]; summary: SummaryCounts; thinkingCount: number }
  | { kind: "footnote"; hiddenBranchEntryCount: number; orphanedEntryCount: number }

export type BuildPiResult = {
  items: RenderItem[]
  results: Map<string, PiResultWithDetails>
  models: ModelDisplay[]
  skipBlocks: Map<string, Set<number>>
}

export function buildPiHeaderModels(session: PiParsedSession): ModelDisplay[] {
  const models: ModelDisplay[] = []
  const seen = new Set<string>()
  let model: { provider?: string; modelId: string } | null = null
  let thinkingLevel: string | undefined

  function addCurrentModel() {
    if (!model) return
    const display = formatCodexModel(model.modelId, thinkingLevel)
    const raw = model.provider ? `${model.provider}/${model.modelId}` : model.modelId
    const labeled = { ...display, raw: thinkingLevel ? `${raw}/${thinkingLevel}` : raw }
    const key = `${labeled.raw}|${labeled.label}`
    if (!seen.has(key)) {
      seen.add(key)
      models.push(labeled)
    }
  }

  for (const entry of session.activeEntries) {
    if (entry.type === "model_change") {
      model = { provider: entry.provider, modelId: entry.modelId }
    } else if (entry.type === "thinking_level_change") {
      thinkingLevel = entry.thinkingLevel
    } else if (entry.type === "message" && entry.message.role === "assistant") {
      addCurrentModel()
    }
  }

  if (models.length === 0) addCurrentModel()
  return models
}

function extractPiDiffs(call: PiToolCallContent): ToolDiff[] {
  if (call.name !== "edit") return []
  const parsed = parsePiEdits(call.arguments)
  if (!parsed) return []
  return parsed.edits.map((ed) => ({
    kind: "edit" as const,
    filePath: parsed.path,
    oldString: ed.oldText,
    newString: ed.newText,
  }))
}

export function buildPiItems(
  session: PiParsedSession,
  opts: { viewMode: ViewMode } = { viewMode: "normal" },
): BuildPiResult {
  // Pre-pass: results map
  const results = new Map<string, PiResultWithDetails>()
  for (const entry of session.activeEntries) {
    if (entry.type !== "message") continue
    const { message } = entry
    if (message.role !== "toolResult") continue
    results.set(message.toolCallId, { ...extractPiToolResult(message), details: message.details })
  }

  const models = buildPiHeaderModels(session)
  const items: RenderItem[] = []
  const skipBlocks = new Map<string, Set<number>>()

  if (session.header) {
    items.push({ kind: "header", chatStartIso: session.header.timestamp, models })
  }

  // Internal run accumulator — tracks entry+blockIndex for skipBlocks management
  type InternalRunItem =
    | { kind: "tool"; groupItem: PiGroupItem & { kind: "tool" }; entry: PiMessageEntry; blockIndex: number }
    | { kind: "thinking"; groupItem: PiGroupItem & { kind: "thinking" } }

  let currentRun: InternalRunItem[] = []

  const flushRun = () => {
    // Thinking-only runs also produce a group (chat mode hierarchy).
    const shouldGroup = currentRun.length >= 1
    if (shouldGroup) {
      for (const r of currentRun) {
        const entryId = r.kind === "tool" ? r.entry.id : r.groupItem.entry.id
        const blockIdx = r.kind === "tool" ? r.blockIndex : r.groupItem.blockIndex
        let s = skipBlocks.get(entryId)
        if (!s) {
          s = new Set()
          skipBlocks.set(entryId, s)
        }
        s.add(blockIdx)
      }
      const groupItems = currentRun.map((r) => r.groupItem)
      const { counts, thinkingCount } = summarizePiGroup(groupItems)
      items.push({
        kind: "tool_group",
        items: groupItems,
        summary: counts,
        thinkingCount,
      })
    }
    currentRun = []
  }

  for (const entry of session.activeEntries) {
    if (opts.viewMode === "chat" && entry.type === "message") {
      const msg = entry.message
      if (msg.role === "user") {
        // Pi user messages are always "real" (never contain tool_result blocks)
        flushRun()
        items.push({ kind: "entry", entry })
        continue
      }
      if (msg.role === "toolResult") {
        // Synthesized API bookkeeping — does NOT flush the run
        items.push({ kind: "entry", entry })
        continue
      }
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        const blocks = msg.content
        for (let j = 0; j < blocks.length; j++) {
          const b = blocks[j]
          if (b.type === "toolCall") {
            const call = b as PiToolCallContent
            const groupItem: PiGroupItem & { kind: "tool" } = {
              kind: "tool",
              name: call.name,
              status: results.get(call.id)?.isError ? "error" : "success",
              diffs: extractPiDiffs(call),
              call,
            }
            currentRun.push({ kind: "tool", groupItem, entry, blockIndex: j })
          } else if (b.type === "thinking") {
            // Skip empty thinking blocks defensively (parallel to Claude).
            if (b.thinking?.trim()) {
              const groupItem: PiGroupItem & { kind: "thinking" } = {
                kind: "thinking",
                entry,
                blockIndex: j,
              }
              currentRun.push({ kind: "thinking", groupItem })
            }
          } else if (b.type === "text" || b.type === "image") {
            flushRun()
          }
        }
        items.push({ kind: "entry", entry })
        continue
      }
      // Other message roles (bashExecution, custom, etc.) — don't flush, just emit
      items.push({ kind: "entry", entry })
      continue
    }
    // Non-message entries OR normal mode
    items.push({ kind: "entry", entry })
  }

  // Flush any remaining run at end of stream.
  if (opts.viewMode === "chat") flushRun()

  if (session.hiddenBranchEntryCount > 0 || session.orphanedEntryCount > 0) {
    items.push({
      kind: "footnote",
      hiddenBranchEntryCount: session.hiddenBranchEntryCount,
      orphanedEntryCount: session.orphanedEntryCount,
    })
  }

  return { items, results, models, skipBlocks }
}
