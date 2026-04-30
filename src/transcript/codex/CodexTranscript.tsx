import type { CodexEntry } from "./types"
import type { ToolResult } from "../../types"
import { EntryView } from "./EntryView"
import { SessionHeader } from "./SessionHeader"
import { CompactedMarker } from "./CompactedMarker"

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
      const meta = v.metadata && typeof v.metadata === "object" ? (v.metadata as Record<string, unknown>) : null
      if (meta && typeof meta.exit_code === "number" && meta.exit_code !== 0) return true
    } catch { /* not json — fall through */ }
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

  // Find session_meta (typically the first line).
  const meta = entries.find(e => e.type === "session_meta")

  return (
    <div className="transcript">
      {meta && meta.type === "session_meta" && <SessionHeader meta={meta} />}
      {entries.map((entry, i) => {
        if (entry.type === "session_meta") return null
        if (entry.type === "turn_context") return null
        if (entry.type === "compacted") return <CompactedMarker key={`comp-${i}`} />
        // entry.type === "response_item"
        return <EntryView key={i} entry={entry} results={results} />
      })}
    </div>
  )
}
