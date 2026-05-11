import { useSettings } from "../../settings"
import { TranscriptHeader } from "../TranscriptHeader"
import { buildPiItems } from "./buildPiItems"
import { PiEntryView } from "./EntryView"
import { PiToolGroupRow } from "./PiToolGroupRow"
import type { PiParsedSession } from "./types"

export function PiTranscript({ session }: { session: PiParsedSession }) {
  const { viewMode } = useSettings()
  const { items, results, models, skipBlocks } = buildPiItems(session, { viewMode })

  return (
    <div className={`transcript${viewMode === "chat" ? " transcript-chat" : ""}`}>
      {items.map((it, idx) => {
        switch (it.kind) {
          case "header":
            return (
              <TranscriptHeader
                key={`hdr-${idx}`}
                startTimestamp={it.chatStartIso}
                models={models}
              />
            )
          case "entry":
            return (
              <PiEntryView
                key={`e-${idx}`}
                entry={it.entry}
                results={results}
                skipBlocks={skipBlocks}
              />
            )
          case "tool_group":
            return <PiToolGroupRow key={`g-${idx}`} items={it.items} summary={it.summary} thinkingCount={it.thinkingCount} results={results} />
          case "footnote":
            return (
              <div key={`fn-${idx}`} className="pi-branch-footnote">
                {it.hiddenBranchEntryCount > 0 && (
                  <span>{it.hiddenBranchEntryCount} entries on other branches are not shown.</span>
                )}
                {it.orphanedEntryCount > 0 && (
                  <span>{it.orphanedEntryCount} missing parent link encountered.</span>
                )}
              </div>
            )
        }
      })}
    </div>
  )
}
