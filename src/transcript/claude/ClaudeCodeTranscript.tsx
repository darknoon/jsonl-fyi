import type { Entry } from "../../types"
import { useSettings } from "../../settings"
import { TranscriptHeader } from "../TranscriptHeader"
import { TurnSeparator } from "../TurnSeparator"
import { buildTranscriptItems } from "../timing"
import { EntryView } from "./EntryView"
import { ClaudeToolGroupRow } from "./ClaudeToolGroupRow"

const TURN_VERBS = [
  "Baked",
  "Brewed",
  "Churned",
  "Cogitated",
  "Cooked",
  "Crunched",
  "Sautéed",
  "Worked",
] as const

function pickVerb(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return TURN_VERBS[h % TURN_VERBS.length]
}

export function ClaudeCodeTranscript({ entries }: { entries: Entry[] }) {
  const { viewMode } = useSettings()
  const { items, models, results, toolRefsById, skipKeys } = buildTranscriptItems(entries, {
    viewMode,
  })

  return (
    <div className={`transcript${viewMode === "chat" ? " transcript-chat" : ""}`}>
      {items.map((item, idx) => {
        switch (item.kind) {
          case "header":
            return (
              <TranscriptHeader
                key={`hdr-${idx}`}
                startTimestamp={item.chatStartIso}
                models={models}
              />
            )
          case "separator":
            return (
              <TurnSeparator
                key={`sep-${item.afterUuid}`}
                durationMs={item.durationMs}
                usage={item.usage}
                verb={pickVerb(item.afterUuid)}
                model={item.model}
              />
            )
          case "entry":
            return (
              <EntryView
                key={item.entry.uuid ?? `entry-${idx}`}
                entry={item.entry}
                results={results}
                toolRefsById={toolRefsById}
                skipKeys={skipKeys}
              />
            )
          case "tool_group":
            return (
              <ClaudeToolGroupRow
                key={`grp-${idx}`}
                items={item.items}
                summary={item.summary}
                thinkingCount={item.thinkingCount}
                results={results}
                toolRefsById={toolRefsById}
              />
            )
        }
      })}
    </div>
  )
}
