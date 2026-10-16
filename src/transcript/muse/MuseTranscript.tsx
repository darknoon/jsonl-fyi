import { useSettings } from "../../settings"
import { TextBlock } from "../claude/TextBlock"
import type { SummaryCounts } from "../groupSummary"
import { Header, ToolTitle } from "../shared"
import { ThinkingBlock } from "../ThinkingBlock"
import { ToolCard } from "../ToolCard"
import { ToolGroupRow, type GroupItem } from "../ToolGroupRow"
import { TranscriptHeader } from "../TranscriptHeader"
import { TurnSeparator } from "../TurnSeparator"
import { MuseTool, museImagePath, museToolCategory, museToolHasImages } from "./Tool"
import type { MuseEntry, MuseRun, MuseSession } from "./types"
import "./muse.css"

function MuseEntryView({ entry, hideTiming }: { entry: MuseEntry; hideTiming: boolean }) {
  if (entry.kind === "tool") return <MuseTool entry={entry} hideTiming={hideTiming} />
  if (entry.kind === "thinking") return <ThinkingBlock text={entry.text} />
  if (entry.kind === "message") {
    return (
      <div title={hideTiming ? undefined : entry.timestamp}>
        <TextBlock role="assistant" text={entry.text} />
      </div>
    )
  }
  return (
    <ToolCard.Root>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name={entry.label} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        <pre className="output">{JSON.stringify(entry.raw, null, 2)}</pre>
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

type MuseItem =
  | { kind: "entry"; entry: MuseEntry }
  | {
      kind: "group"
      id: string
      entries: GroupItem<MuseEntry>[]
      summary: SummaryCounts
      thinkingCount: number
    }

function buildItems(entries: MuseEntry[], groupTools: boolean): MuseItem[] {
  const items: MuseItem[] = []
  let group: Extract<MuseItem, { kind: "group" }> | undefined
  for (const entry of entries) {
    // Lifecycle bookkeeping remains in the parsed session. Unsupported content
    // has its own unknown entry and uses the shared fallback card below.
    if (entry.kind === "diagnostic") continue
    if ((entry.kind === "message" || entry.kind === "thinking") && !entry.text.trim()) continue
    const category = entry.kind === "tool" ? museToolCategory(entry) : undefined
    // Shared groups model only successful/failed calls. Other outcomes remain
    // visible and neutral. Embedded images and missing-image references stay visible.
    if (
      groupTools &&
      (entry.kind === "thinking" ||
        (entry.kind === "tool" &&
          category &&
          !museImagePath(entry) &&
          !museToolHasImages(entry) &&
          (entry.status === "success" || entry.status === "error")))
    ) {
      if (!group) {
        group = { kind: "group", id: entry.id, entries: [], summary: {}, thinkingCount: 0 }
        items.push(group)
      }
      if (entry.kind === "thinking") {
        group.entries.push({ kind: "thinking", label: "reasoning", data: entry })
        group.thinkingCount++
      } else if (category) {
        group.entries.push({
          kind: "tool",
          name: entry.name,
          status: entry.status === "error" ? "error" : "success",
          diffs: [],
          data: entry,
        })
        group.summary[category] = (group.summary[category] ?? 0) + 1
      }
    } else {
      group = undefined
      items.push({ kind: "entry", entry })
    }
  }
  return items
}

function RunEnding({
  run,
  hideTiming,
  showModel,
}: {
  run: MuseRun
  hideTiming: boolean
  showModel: boolean
}) {
  if (run.terminal === "completed" && !hideTiming && run.durationMs != null) {
    return <TurnSeparator durationMs={run.durationMs} model={showModel ? run.model : undefined} />
  }
  if (!run.terminal || run.terminal === "completed") return null
  return (
    <ToolCard.Root hasContent={Boolean(run.reason)}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name={`Run ${run.terminal}`} />
        </Header>
      </ToolCard.Trigger>
      {run.reason && (
        <ToolCard.Content>
          <pre className="output">{run.reason}</pre>
        </ToolCard.Content>
      )}
    </ToolCard.Root>
  )
}

export function MuseTranscript({ session }: { session: MuseSession }) {
  const { viewMode } = useSettings()
  const hideTiming = Boolean(session.timingIssue)
  const showModel = session.models.length > 1
  return (
    <div className={`transcript${viewMode === "chat" ? " transcript-chat" : ""}`}>
      <TranscriptHeader
        startTimestamp={hideTiming ? undefined : session.startTimestamp}
        models={session.models}
      />
      {session.timingIssue && (
        <div className="muse-timing-notice" role="note">
          {session.timingIssue}
        </div>
      )}
      {session.runs.map((run) => {
        const key = `${run.sessionId}:${run.id}`
        const items = buildItems(run.entries, viewMode === "chat")
        if (run.isContext && !items.length) return null
        return (
          <div className="muse-run" key={key}>
            {run.prompt?.trim() && <TextBlock role="user" text={run.prompt} />}
            {items.map((item) =>
              item.kind === "entry" ? (
                <MuseEntryView key={item.entry.id} entry={item.entry} hideTiming={hideTiming} />
              ) : (
                <ToolGroupRow
                  key={`group-${item.id}`}
                  items={item.entries}
                  summary={item.summary}
                  thinkingCount={item.thinkingCount}
                  renderToolCard={(entry) => (
                    <MuseEntryView entry={entry} hideTiming={hideTiming} />
                  )}
                  renderThinking={(entry) => (
                    <MuseEntryView entry={entry} hideTiming={hideTiming} />
                  )}
                />
              ),
            )}
            {!run.isContext && (
              <RunEnding run={run} hideTiming={hideTiming} showModel={showModel} />
            )}
          </div>
        )
      })}
    </div>
  )
}
