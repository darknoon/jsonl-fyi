import React from "react"
import { useSettings } from "../../settings"
import type { CodexEntry } from "./types"
import { EntryView } from "./EntryView"
import { CompactedMarker } from "./CompactedMarker"
import { TurnSeparator } from "../TurnSeparator"
import { TranscriptHeader } from "../TranscriptHeader"
import { buildCodexItems } from "./buildCodexItems"
import { CodexToolGroupRow } from "./CodexToolGroupRow"

export function CodexTranscript({ entries }: { entries: CodexEntry[] }) {
  const { viewMode } = useSettings()
  const { items, results, agentNicknames, models } = buildCodexItems(entries, { viewMode })

  return (
    <div className={`transcript${viewMode === "chat" ? " transcript-chat" : ""}`}>
      {items.map((it, idx) => {
        switch (it.kind) {
          case "header":
            return <TranscriptHeader key={`hdr-${idx}`} startTimestamp={it.chatStartIso} models={models} />
          case "compacted":
            return <CompactedMarker key={`comp-${it.index}`} />
          case "entry":
            return <EntryView key={`e-${idx}`} entry={it.entry} results={results} agentNicknames={agentNicknames} />
          case "tool_group":
            return <CodexToolGroupRow key={`g-${idx}`} items={it.items} summary={it.summary} thinkingCount={it.thinkingCount} results={results} agentNicknames={agentNicknames} />
          case "separator":
            return <TurnSeparator key={`sep-${idx}`} durationMs={it.durationMs} usage={it.usage} model={it.model} />
        }
      })}
    </div>
  )
}
