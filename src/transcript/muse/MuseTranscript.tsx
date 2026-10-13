import { useSettings } from "../../settings"
import { TextBlock } from "../claude/TextBlock"
import type { SummaryCounts } from "../groupSummary"
import { Header, ToolTitle } from "../shared"
import { formatDuration } from "../timing"
import { ToolCard } from "../ToolCard"
import { ToolGroupRow, type GroupItem } from "../ToolGroupRow"
import { TranscriptHeader } from "../TranscriptHeader"
import { TurnSeparator } from "../TurnSeparator"
import { MuseTool, museImagePath, museToolCategory } from "./Tool"
import type { MuseEntry, MuseRun, MuseSession } from "./types"
import "./muse.css"

function MuseEntryView({ entry, hideTiming }: { entry: MuseEntry; hideTiming: boolean }) {
  if (entry.kind === "tool") return <MuseTool entry={entry} hideTiming={hideTiming} />
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
  | { kind: "group"; id: string; entries: GroupItem<MuseEntry>[]; summary: SummaryCounts }

function buildItems(entries: MuseEntry[], groupTools: boolean): MuseItem[] {
  const items: MuseItem[] = []
  let group: Extract<MuseItem, { kind: "group" }> | undefined
  for (const entry of entries) {
    if (entry.kind === "message" && !entry.text.trim()) continue
    const category = entry.kind === "tool" ? museToolCategory(entry) : undefined
    // Shared groups model only successful/failed calls. Other outcomes remain
    // visible and neutral, as do references to images absent from this log.
    if (
      groupTools &&
      entry.kind === "tool" &&
      category &&
      !museImagePath(entry) &&
      (entry.status === "success" || entry.status === "error")
    ) {
      if (!group) {
        group = { kind: "group", id: entry.id, entries: [], summary: {} }
        items.push(group)
      }
      group.entries.push({
        kind: "tool",
        name: entry.name,
        status: entry.status,
        diffs: [],
        data: entry,
      })
      group.summary[category] = (group.summary[category] ?? 0) + 1
    } else {
      group = undefined
      items.push({ kind: "entry", entry })
    }
  }
  return items
}

function RunEnding({ run, hideTiming }: { run: MuseRun; hideTiming: boolean }) {
  if (run.terminal === "completed" && !hideTiming && run.durationMs != null) {
    return <TurnSeparator durationMs={run.durationMs} />
  }
  const label = run.terminal ? `Run ${run.terminal}` : "No completion recorded"
  return (
    <div className="muse-run-ending">
      {label}
      {run.reason && `: ${run.reason}`}
      {!hideTiming && run.durationMs != null && ` · ${formatDuration(run.durationMs)}`}
    </div>
  )
}

export function MuseTranscript({ session }: { session: MuseSession }) {
  const { viewMode } = useSettings()
  const hideTiming = Boolean(session.timingIssue)
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
      {session.runs.map((run, index) => (
        <section
          className="muse-run"
          key={`${run.sessionId}:${run.id}`}
          aria-label={`Run ${index + 1}`}
        >
          <div className="muse-run-heading">
            <span>Run {index + 1}</span>
            {session.runs.length > 1 && run.model && (
              <span title={run.model.raw}>{run.model.label}</span>
            )}
            {!run.prompt?.trim() && <span>No user prompt text recorded</span>}
          </div>
          {run.prompt && <TextBlock role="user" text={run.prompt} />}
          {buildItems(run.entries, viewMode === "chat").map((item) =>
            item.kind === "entry" ? (
              <MuseEntryView key={item.entry.id} entry={item.entry} hideTiming={hideTiming} />
            ) : (
              <ToolGroupRow
                key={`group-${item.id}`}
                items={item.entries}
                summary={item.summary}
                thinkingCount={0}
                renderToolCard={(entry) => <MuseEntryView entry={entry} hideTiming={hideTiming} />}
                renderThinking={(entry) => <MuseEntryView entry={entry} hideTiming={hideTiming} />}
              />
            ),
          )}
          <RunEnding run={run} hideTiming={hideTiming} />
        </section>
      ))}
    </div>
  )
}
