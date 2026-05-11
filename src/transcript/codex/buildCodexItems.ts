import type { CodexEntry, CodexResponseItem } from "./types"
import type { ToolResult } from "../../types"
import type { TurnUsage } from "../usage"
import type { ModelDisplay } from "../model"
import type { ViewMode } from "../../settings"
import type { ToolDiff } from "../grouping"
import type { SummaryCounts } from "../groupSummary"
import { extractCodexTurnUsage } from "../usage"
import { buildCodexModelLabels } from "./modelLabeling"
import { tryParseAgentSpawnOutput } from "./Tool"
import { parseV4A } from "./v4a"
import { summarizeCodexGroup } from "./categorize"

export type CodexGroupItem =
  | { kind: "tool"; name: string; status: "success" | "error"; diffs: ToolDiff[]; entry: CodexResponseItem }
  | { kind: "thinking"; entry: CodexResponseItem }

// Legacy alias kept for callers that still reference CodexToolGroupTool
export type CodexToolGroupTool = Extract<CodexGroupItem, { kind: "tool" }>

export type RenderItem =
  | { kind: "header"; chatStartIso: string }
  | { kind: "entry"; entry: CodexResponseItem }
  | { kind: "compacted"; index: number }
  | { kind: "tool_group"; items: CodexGroupItem[]; summary: SummaryCounts; thinkingCount: number }
  | { kind: "separator"; durationMs: number; usage: TurnUsage | null; model: ModelDisplay | null }

export type BuildCodexResult = {
  items: RenderItem[]
  results: Map<string, ToolResult>
  agentNicknames: Map<string, string>
  models: ModelDisplay[]
}

// Codex doesn't emit a `turn_duration` row like Claude. Derive per-turn
// duration from response_item timestamps: a turn runs from a user-authored
// `message` (role=user, not env_context) to the last response_item before the
// next user message. Returns Map<entryIndex → durationMs> keyed on the index
// of the LAST entry of each turn (so the separator renders after that entry).
export function buildCodexTurnDurations(entries: CodexEntry[]): Map<number, number> {
  const userIndices: number[] = []
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    if (e.type !== "response_item") continue
    const p = e.payload
    if (p.type !== "message" || p.role !== "user") continue
    const first = p.content[0]
    if (first?.type === "input_text" && first.text.startsWith("<environment_context>")) continue
    userIndices.push(i)
  }

  const out = new Map<number, number>()
  for (let k = 0; k < userIndices.length; k++) {
    const startIdx = userIndices[k]
    const endIdx = k + 1 < userIndices.length ? userIndices[k + 1] - 1 : entries.length - 1
    if (endIdx <= startIdx) continue

    const startEntry = entries[startIdx] as CodexResponseItem
    const endEntry = entries[endIdx]
    const endTs = endEntry.type === "response_item" ? endEntry.timestamp : undefined
    if (!startEntry.timestamp || !endTs) continue
    const ms = new Date(endTs).getTime() - new Date(startEntry.timestamp).getTime()
    if (Number.isFinite(ms) && ms > 0) out.set(endIdx, ms)
  }
  return out
}

export function deriveIsError(output: string, kind: "function" | "custom"): boolean {
  if (!output) return false
  if (kind === "function") {
    const m = /^Exit code: (\d+)/m.exec(output)
    if (m && Number(m[1]) !== 0) return true
    return false
  }
  // custom_tool_call_output: try to parse JSON-wrapped metadata.
  if (output.startsWith("{")) {
    try {
      const v = JSON.parse(output) as { metadata?: unknown }
      const meta =
        v.metadata && typeof v.metadata === "object"
          ? (v.metadata as Record<string, unknown>)
          : null
      if (meta && typeof meta.exit_code === "number" && meta.exit_code !== 0) return true
    } catch {
      /* not json — fall through */
    }
  }
  return false
}

// Map per-turn usage to the index of the entry where the separator renders.
// Strategy: for each separator end-index, the next `event_msg` of subtype
// `token_count` at or after that index carries this turn's `last_token_usage`.
// If no such event exists (truncated file), the entry stays usage-less.
export function buildCodexTurnUsage(
  entries: CodexEntry[],
  separatorIndices: Iterable<number>,
): Map<number, TurnUsage> {
  const out = new Map<number, TurnUsage>()
  for (const sepIdx of separatorIndices) {
    for (let i = sepIdx; i < entries.length; i++) {
      const e = entries[i]
      if (e.type !== "event_msg") continue
      const usage = extractCodexTurnUsage(e)
      if (usage) {
        out.set(sepIdx, usage)
        break
      }
    }
  }
  return out
}

function extractCodexDiffs(re: CodexResponseItem): ToolDiff[] {
  const p = re.payload
  if (p.type !== "custom_tool_call" || p.name !== "apply_patch" || !p.input) return []
  const parsed = parseV4A(p.input)
  if ("error" in parsed) return []
  return parsed.files.flatMap((f) => {
    if (f.op === "delete") return []
    return [
      {
        kind: "patch" as const,
        filePath: f.path,
        patch: f.unifiedDiff,
        op: f.op, // "add" | "update"
      },
    ]
  })
}

export function buildCodexItems(
  entries: CodexEntry[],
  opts: { viewMode: ViewMode } = { viewMode: "normal" },
): BuildCodexResult {
  // Pre-pass: index tool outputs by call_id with derived isError.
  const results = new Map<string, ToolResult>()
  for (const entry of entries) {
    if (entry.type !== "response_item") continue
    const p = entry.payload
    if (p.type === "function_call_output") {
      results.set(p.call_id, {
        content: p.output ? [{ type: "text", text: p.output }] : [],
        isError: deriveIsError(p.output, "function"),
      })
    } else if (p.type === "custom_tool_call_output") {
      results.set(p.call_id, {
        content: p.output ? [{ type: "text", text: p.output }] : [],
        isError: deriveIsError(p.output, "custom"),
      })
    }
  }

  // Pre-pass: build agent_id → nickname map by walking spawn_agent calls
  // and parsing their outputs. Used by WaitAgent to render friendly names
  // instead of UUIDs in the header.
  const agentNicknames = new Map<string, string>()
  for (const entry of entries) {
    if (entry.type !== "response_item") continue
    const p = entry.payload
    if (p.type === "function_call" && p.name === "spawn_agent") {
      const out = results.get(p.call_id)
      const text = out
        ? out.content
            .filter((item) => item.type === "text")
            .map((item) => item.text)
            .join("\n")
        : ""
      if (text) {
        const meta = tryParseAgentSpawnOutput(text)
        if (meta.agentId && meta.nickname) {
          agentNicknames.set(meta.agentId, meta.nickname)
        }
      }
    }
  }

  // Use the first available timestamp (session_meta or earliest response_item)
  // for the chat-start header — same treatment as the Claude path.
  let startTimestamp: string | undefined
  for (const e of entries) {
    if (e.type === "session_meta" && e.payload.timestamp) {
      startTimestamp = e.payload.timestamp
      break
    }
    if (e.type === "response_item" && e.timestamp) {
      startTimestamp = e.timestamp
      break
    }
  }

  const durations = buildCodexTurnDurations(entries)
  const usages = buildCodexTurnUsage(entries, durations.keys())
  const sepIndexSet = new Set(durations.keys())
  const modelLabels = buildCodexModelLabels(entries, sepIndexSet)

  // Predicates for run detection.
  const isToolPayload = (e: CodexEntry): boolean =>
    e.type === "response_item" &&
    (e.payload.type === "function_call" ||
      e.payload.type === "custom_tool_call" ||
      e.payload.type === "web_search_call")

  const isToolOutputPayload = (e: CodexEntry): boolean =>
    e.type === "response_item" &&
    (e.payload.type === "function_call_output" || e.payload.type === "custom_tool_call_output")

  const isReasoningPayload = (e: CodexEntry): boolean =>
    e.type === "response_item" && e.payload.type === "reasoning"

  // Non-rendering entries (event_msg / session_meta / turn_context) are
  // already skipped by the emit loop, so they shouldn't terminate a run
  // either — codex interleaves event_msgs (e.g. token_count,
  // exec_command_end) between paired tool calls.
  const isInvisibleEntry = (e: CodexEntry): boolean =>
    e.type === "event_msg" || e.type === "session_meta" || e.type === "turn_context"

  // Outputs pair with calls and have no standalone visible content in chat
  // mode, so they shouldn't terminate a tool-group run.
  const isRunExtender = (e: CodexEntry): boolean =>
    isToolPayload(e) || isToolOutputPayload(e) || isReasoningPayload(e) || isInvisibleEntry(e)

  // Emit loop with grouping.
  const items: RenderItem[] = []
  if (startTimestamp) items.push({ kind: "header", chatStartIso: startTimestamp })

  let i = 0
  while (i < entries.length) {
    const entry = entries[i]

    if (opts.viewMode === "chat" && isRunExtender(entry)) {
      const run: CodexGroupItem[] = []
      let k = i
      while (k < entries.length && isRunExtender(entries[k])) {
        const eRaw = entries[k]
        if (isInvisibleEntry(eRaw)) {
          // event_msg / session_meta / turn_context — already skipped by the
          // non-grouped emit path, transparent to grouping.
          k++
          continue
        }
        const re = eRaw as CodexResponseItem
        if (isToolOutputPayload(re)) {
          // Output entries extend the run (so a following tool call stays in
          // the same group), but they don't produce a run item — their content
          // is already shown inside the paired call's tool card.
          k++
          continue
        }
        if (isReasoningPayload(re)) {
          // Skip reasoning entries with no summary text — they have no visible
          // content (empty summary[]) and would leave empty slots when expanded.
          const rp = re.payload as { type: "reasoning"; summary: { text: string }[] }
          const text = rp.summary.map((s) => s.text).join("")
          if (!text.trim()) {
            k++
            continue
          }
          run.push({ kind: "thinking", entry: re })
        } else if (re.payload.type === "web_search_call") {
          // Hosted web search — synthesize a tool item; success unless
          // the payload reports an explicit failed status.
          const status =
            (re.payload as { status?: string }).status === "failed" ? "error" : "success"
          run.push({
            kind: "tool",
            name: "web_search",
            status,
            diffs: [],
            entry: re,
          })
        } else {
          // tool entry (function_call / custom_tool_call)
          const p = re.payload as { name: string; call_id: string }
          const result = results.get(p.call_id)
          run.push({
            kind: "tool",
            name: p.name,
            status: result?.isError ? "error" : "success",
            diffs: extractCodexDiffs(re),
            entry: re,
          })
        }
        k++
      }

      // Thinking-only runs also produce a group (chat mode hierarchy).
      const shouldGroup = run.length >= 1

      if (shouldGroup) {
        const { counts, thinkingCount } = summarizeCodexGroup(run)
        items.push({ kind: "tool_group", items: run, summary: counts, thinkingCount })
        const lastIdx = k - 1
        const ms = durations.get(lastIdx)
        if (ms != null) {
          items.push({
            kind: "separator",
            durationMs: ms,
            usage: usages.get(lastIdx) ?? null,
            model: modelLabels.byIndex.get(lastIdx) ?? null,
          })
        }
        i = k
        continue
      }

      // Run doesn't meet threshold — emit each entry individually.
      // (This handles: 1 tool + 0 thinking, 0 tools + N thinking)
      while (i < k) {
        const e = entries[i] as CodexResponseItem
        items.push({ kind: "entry", entry: e })
        const ms = durations.get(i)
        if (ms != null) {
          items.push({
            kind: "separator",
            durationMs: ms,
            usage: usages.get(i) ?? null,
            model: modelLabels.byIndex.get(i) ?? null,
          })
        }
        i++
      }
      continue
    }

    // Non-grouped path — preserve existing per-entry behavior.
    if (
      entry.type === "session_meta" ||
      entry.type === "turn_context" ||
      entry.type === "event_msg"
    ) {
      /* skip — these contributed node = null in the old loop */
    } else if (entry.type === "compacted") {
      items.push({ kind: "compacted", index: i })
    } else {
      items.push({ kind: "entry", entry: entry as CodexResponseItem })
    }

    const ms = durations.get(i)
    if (ms != null) {
      items.push({
        kind: "separator",
        durationMs: ms,
        usage: usages.get(i) ?? null,
        model: modelLabels.byIndex.get(i) ?? null,
      })
    }
    i++
  }

  return { items, results, agentNicknames, models: modelLabels.models }
}
