import type { Entry, MessageEntry, TurnDurationEntry, ToolResult, ToolUseBlock } from "../types"
import { extractClaudeTurnUsage, type TurnUsage } from "./usage"
import { formatClaudeModel, isSyntheticClaudeModel, type ModelDisplay } from "./model"
import { getBlocks, extractResult } from "./claude/extractResult"
import { narrowToolUse, isKnownToolUse } from "./claude/toolTypes"
import { detectSkill } from "./claude/detectSkill"
import type { ToolRefsById } from "./claude/EntryView"
import type { ToolDiff } from "./grouping"
import type { ViewMode } from "../settings"
import type { SummaryCounts } from "./groupSummary"
import { summarizeClaudeGroup } from "./claude/categorize"

export type FormatChatStartOptions = {
  now?: Date
  locale?: string | string[]
  timeZone?: string
}

export function formatChatStart(isoTimestamp: string, opts: FormatChatStartOptions = {}): string {
  const date = new Date(isoTimestamp)
  const now = opts.now ?? new Date()
  const locale = opts.locale
  const timeZone = opts.timeZone

  const time = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  })
    .format(date)
    .replace(/ /g, " ")

  const days = calendarDayDelta(date, now, timeZone)

  if (days === 0) return `Today, ${time}`
  if (days === 1) return `Yesterday, ${time}`
  if (days >= 2 && days <= 6) {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone }).format(date)
    return `${weekday}, ${time}`
  }

  const sameYear = sameCalendarYear(date, now, timeZone)
  const dateLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    timeZone,
  }).format(date)
  return `${dateLabel}, ${time}`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const totalSeconds = Math.floor(ms / 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}m ${s}s`
}

export type ClaudeGroupItem =
  | { kind: "tool"; name: string; status: "success" | "error"; diffs: ToolDiff[]; block: ToolUseBlock }
  | { kind: "thinking"; entry: MessageEntry; blockIndex: number }

// Legacy alias kept for any callers that still reference ClaudeToolGroupTool
export type ClaudeToolGroupTool = Extract<ClaudeGroupItem, { kind: "tool" }>

export type RenderItem =
  | { kind: "header"; chatStartIso: string }
  | { kind: "entry"; entry: MessageEntry }
  | {
      kind: "separator"
      afterUuid: string
      durationMs: number
      usage: TurnUsage | null
      model: ModelDisplay | null
    }
  | { kind: "tool_group"; items: ClaudeGroupItem[]; summary: SummaryCounts; thinkingCount: number }

export type BuildResult = {
  items: RenderItem[]
  models: ModelDisplay[]
  results: Map<string, ToolResult>
  toolRefsById: ToolRefsById
  skipKeys: Set<string>
}

const EMPTY_RESULT: ToolResult = { content: [], isError: false }

function extractClaudeDiffs(block: ToolUseBlock): ToolDiff[] {
  const use = narrowToolUse(block)
  if (!isKnownToolUse(use)) return []
  if (use.name === "Edit") {
    const inp = use.input
    if (!inp.old_string && !inp.new_string) return []
    return [
      {
        kind: "edit",
        filePath: inp.file_path,
        oldString: inp.old_string ?? "",
        newString: inp.new_string ?? "",
      },
    ]
  }
  if (use.name === "MultiEdit") {
    const inp = use.input
    return inp.edits.map((ed) => ({
      kind: "edit" as const,
      filePath: inp.file_path,
      oldString: ed.old_string ?? "",
      newString: ed.new_string ?? "",
    }))
  }
  return []
}

export function buildTranscriptItems(
  entries: Entry[],
  opts: { viewMode: ViewMode } = { viewMode: "normal" },
): BuildResult {
  if (entries.length === 0)
    return {
      items: [],
      models: [],
      results: new Map(),
      toolRefsById: new Map(),
      skipKeys: new Set(),
    }

  // Pass A: index tool results by their tool_use_id.
  const results = new Map<string, ToolResult>()
  const toolRefsById: ToolRefsById = new Map()
  for (const entry of entries) {
    for (const block of getBlocks(entry)) {
      if (block.type === "tool_result") {
        results.set(block.tool_use_id, extractResult(block))
        const refs =
          typeof block.content === "string"
            ? []
            : block.content
                .filter((item) => item.type === "tool_reference")
                .map((item) => item.tool_name)
        if (refs.length > 0) toolRefsById.set(block.tool_use_id, refs)
      }
    }
  }

  // Pass B: absorb skill bodies into their Skill tool result as
  // `injectedText`. Claude's Skill tool emits a tool_use → tool_result, then
  // the very next user-text block is the full skill markdown injected by the
  // harness. Group it under the tool card instead of rendering it as a
  // separate (huge) bubble.
  const skipKeys = new Set<string>()
  let pendingSkillId: string | null = null
  for (const entry of entries) {
    if (entry.type === "system") continue
    if (!entry.uuid) continue
    const role = entry.message?.role ?? entry.type
    const blocks = getBlocks(entry)
    for (let j = 0; j < blocks.length; j++) {
      const block = blocks[j]
      if (block.type === "tool_use" && block.name === "Skill") {
        pendingSkillId = block.id
        continue
      }
      if (block.type === "tool_result") continue
      if (pendingSkillId && role === "user" && block.type === "text") {
        const skill = detectSkill(block.text)
        if (skill) {
          const r = results.get(pendingSkillId) ?? { ...EMPTY_RESULT }
          results.set(pendingSkillId, { ...r, injectedText: skill.body })
          skipKeys.add(`${entry.uuid}:${j}`)
        }
        pendingSkillId = null
        continue
      }
      pendingSkillId = null
    }
  }

  // Pass 1: index turn durations from system rows.
  const durations = new Map<string, number>()
  for (const entry of entries) {
    if (entry.type === "system" && entry.subtype === "turn_duration") {
      const td = entry as TurnDurationEntry
      if (td.parentUuid && typeof td.durationMs === "number") {
        durations.set(td.parentUuid, td.durationMs)
      }
    }
  }

  // Pass 2: discovery walk — collect distinct non-synthetic models in order.
  const seen = new Set<string>()
  const models: ModelDisplay[] = []
  for (const entry of entries) {
    if (entry.type !== "assistant") continue
    if (entry.isSidechain) continue
    const raw = entry.message?.model
    if (!raw || isSyntheticClaudeModel(raw)) continue
    if (seen.has(raw)) continue
    seen.add(raw)
    models.push(formatClaudeModel(raw))
  }
  const multiModel = models.length >= 2

  // Pass 3: emit items.
  const items: RenderItem[] = []
  const startTimestamp = entries.find((e) => e.timestamp)?.timestamp
  if (startTimestamp) {
    items.push({ kind: "header", chatStartIso: startTimestamp })
  }

  // Helper: a "real" user message contains at least one non-tool_result block.
  // Synthesized user entries (only tool_result blocks) do NOT flush the run.
  function isRealUserMessage(entry: MessageEntry): boolean {
    if (entry.type !== "user") return false
    const blocks = getBlocks(entry)
    if (blocks.length === 0) return true // edge case: treat as boundary
    return blocks.some((b) => b.type !== "tool_result")
  }

  // Internal run accumulator — tracks entry+blockIndex for skipKeys management
  // plus the exported ClaudeGroupItem shape.
  type InternalRunItem =
    | { kind: "tool"; groupItem: ClaudeGroupItem & { kind: "tool" }; entry: MessageEntry; blockIndex: number }
    | { kind: "thinking"; groupItem: ClaudeGroupItem & { kind: "thinking" } }

  let currentRun: InternalRunItem[] = []

  const flushRun = () => {
    // In chat mode every assistant action — tools or thinking — gets a
    // group so the heading row anchors hierarchy. Even a thinking-only
    // run produces a single-thinking group.
    const shouldGroup = currentRun.length >= 1
    if (shouldGroup) {
      for (const r of currentRun) {
        if (r.kind === "tool") {
          skipKeys.add(`${r.entry.uuid}:${r.blockIndex}`)
        } else {
          skipKeys.add(`${r.groupItem.entry.uuid}:${r.groupItem.blockIndex}`)
        }
      }
      const groupItems = currentRun.map((r) => r.groupItem)
      const { counts, thinkingCount } = summarizeClaudeGroup(groupItems)
      items.push({
        kind: "tool_group",
        items: groupItems,
        summary: counts,
        thinkingCount,
      })
    }
    currentRun = []
  }

  for (const entry of entries) {
    if (entry.type === "system") continue
    if (entry.isSidechain) continue
    if (entry.type !== "user" && entry.type !== "assistant") continue

    if (opts.viewMode === "chat") {
      if (entry.type === "user") {
        if (isRealUserMessage(entry)) flushRun()
        items.push({ kind: "entry", entry })
        continue
      }
      // assistant entry: walk blocks for run accumulation
      const blocks = getBlocks(entry)
      for (let j = 0; j < blocks.length; j++) {
        if (skipKeys.has(`${entry.uuid}:${j}`)) continue
        const b = blocks[j]
        if (b.type === "tool_use") {
          const block = b as ToolUseBlock
          const output = results.get(block.id) ?? EMPTY_RESULT
          const groupItem: ClaudeGroupItem & { kind: "tool" } = {
            kind: "tool",
            name: narrowToolUse(block).name,
            status: output.isError ? "error" : "success",
            diffs: extractClaudeDiffs(block),
            block,
          }
          currentRun.push({ kind: "tool", groupItem, entry, blockIndex: j })
        } else if (b.type === "thinking") {
          // Skip empty/redacted thinking blocks (encrypted-only — Claude
          // emits these with `thinking: ""` and a `signature` field).
          // They contribute no visible content; treat as absent so they
          // don't inflate the group count or leave empty slots.
          if (b.thinking?.trim()) {
            const groupItem: ClaudeGroupItem & { kind: "thinking" } = {
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
    } else {
      items.push({ kind: "entry", entry })
    }

    if (entry.type === "assistant" && entry.uuid) {
      const ms = durations.get(entry.uuid)
      if (ms != null) {
        const raw = entry.message?.model
        const model =
          multiModel && raw && !isSyntheticClaudeModel(raw) ? formatClaudeModel(raw) : null
        items.push({
          kind: "separator",
          afterUuid: entry.uuid,
          durationMs: ms,
          usage: extractClaudeTurnUsage(entry),
          model,
        })
      }
    }
  }

  // Flush any remaining run at end of stream.
  if (opts.viewMode === "chat") flushRun()

  return { items, models, results, toolRefsById, skipKeys }
}

function calendarDayDelta(date: Date, now: Date, timeZone?: string): number {
  const a = ymdInZone(now, timeZone)
  const b = ymdInZone(date, timeZone)
  return daysBetween(b, a) // a - b in days; positive if date is in the past
}

function sameCalendarYear(date: Date, now: Date, timeZone?: string): boolean {
  return ymdInZone(date, timeZone).y === ymdInZone(now, timeZone).y
}

type Ymd = { y: number; m: number; d: number }

function ymdInZone(date: Date, timeZone?: string): Ymd {
  // Use Intl to get year/month/day in the target zone reliably.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return { y: get("year"), m: get("month"), d: get("day") }
}

function daysBetween(from: Ymd, to: Ymd): number {
  const a = Date.UTC(from.y, from.m - 1, from.d)
  const b = Date.UTC(to.y, to.m - 1, to.d)
  return Math.round((b - a) / 86_400_000)
}
