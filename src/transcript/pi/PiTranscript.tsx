import type { ToolResult } from "../../types"
import { TranscriptHeader } from "../TranscriptHeader"
import { PiEntryView } from "./EntryView"
import { extractPiToolResult } from "./toolResult"
import type { PiParsedSession } from "./types"

export function PiTranscript({ session }: { session: PiParsedSession }) {
  const results = new Map<string, ToolResult & { details?: unknown }>()
  for (const entry of session.activeEntries) {
    if (entry.type !== "message") continue
    const { message } = entry
    if (message.role !== "toolResult") continue
    results.set(message.toolCallId, { ...extractPiToolResult(message), details: message.details })
  }

  return (
    <div className="transcript">
      {session.header && <TranscriptHeader startTimestamp={session.header.timestamp} />}
      {session.header && (
        <div className="pi-session-card">
          <div><strong>pi session</strong> <code>{session.header.id}</code></div>
          {session.header.cwd && <div>cwd <code>{session.header.cwd}</code></div>}
          {session.header.parentSession && <div>parent <code>{session.header.parentSession}</code></div>}
        </div>
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
