import React from "react"
import type { CodexEntry, CodexResponseItem } from "./types"
import type { ToolResult } from "../../types"
import { EntryView } from "./EntryView"
import { CompactedMarker } from "./CompactedMarker"
import { TurnSeparator } from "../TurnSeparator"
import { TranscriptHeader } from "../TranscriptHeader"
import { extractCodexTurnUsage } from "../usage"
import type { TurnUsage } from "../usage"

// Codex doesn't emit a `turn_duration` row like Claude. Derive per-turn
// duration from response_item timestamps: a turn runs from a user-authored
// `message` (role=user, not env_context) to the last response_item before the
// next user message. Returns Map<entryIndex → durationMs> keyed on the index
// of the LAST entry of each turn (so the separator renders after that entry).
function buildCodexTurnDurations(entries: CodexEntry[]): Map<number, number> {
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

function deriveIsError(output: string, kind: "function" | "custom"): boolean {
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

export function CodexTranscript({ entries }: { entries: CodexEntry[] }) {
  // Pre-pass: index tool outputs by call_id with derived isError.
  const results = new Map<string, ToolResult>()
  for (const entry of entries) {
    if (entry.type !== "response_item") continue
    const p = entry.payload
    if (p.type === "function_call_output") {
      results.set(p.call_id, {
        text: p.output,
        images: [],
        toolRefs: [],
        isError: deriveIsError(p.output, "function"),
      })
    } else if (p.type === "custom_tool_call_output") {
      results.set(p.call_id, {
        text: p.output,
        images: [],
        toolRefs: [],
        isError: deriveIsError(p.output, "custom"),
      })
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

  // Map per-turn usage to the index of the entry where the separator renders.
  // Strategy: for each separator end-index, the next `event_msg` of subtype
  // `token_count` at or after that index carries this turn's `last_token_usage`.
  // If no such event exists (truncated file), the entry stays usage-less.
  function buildCodexTurnUsage(
    _entries: CodexEntry[],
    separatorIndices: Iterable<number>,
  ): Map<number, TurnUsage> {
    const out = new Map<number, TurnUsage>()
    for (const sepIdx of separatorIndices) {
      for (let i = sepIdx; i < _entries.length; i++) {
        const e = _entries[i]
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

  const usages = buildCodexTurnUsage(entries, durations.keys())

  return (
    <div className="transcript">
      {startTimestamp && <TranscriptHeader startTimestamp={startTimestamp} />}
      {entries.map((entry, i) => {
        let node: React.ReactNode = null
        if (entry.type === "session_meta") node = null
        else if (entry.type === "turn_context") node = null
        else if (entry.type === "compacted") node = <CompactedMarker key={`comp-${i}`} />
        else if (entry.type === "event_msg") node = null
        else node = <EntryView key={i} entry={entry} results={results} />

        const ms = durations.get(i)
        return (
          <React.Fragment key={`row-${i}`}>
            {node}
            {ms != null && <TurnSeparator durationMs={ms} usage={usages.get(i) ?? null} />}
          </React.Fragment>
        )
      })}
    </div>
  )
}
