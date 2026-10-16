import { useState } from "react"
import { useSettings } from "../../settings"
import { TextBlock } from "../claude/TextBlock"
import type { SummaryCounts } from "../groupSummary"
import { Header, ToolTitle } from "../shared"
import { ThinkingBlock } from "../ThinkingBlock"
import { formatDuration } from "../timing"
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

function runHeading(run: MuseRun, index: number): string {
  if (index === 0) return "Conversation"
  if (run.prompt === undefined) return "Recorded activity"
  return run.prompt.trim() ? "Next turn" : "Follow-up"
}

function SourceRecords({ records }: { records: unknown[] }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <details
      className="muse-recorded-result"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>Source records</summary>
      {expanded && <pre className="output">{JSON.stringify(records, null, 2)}</pre>}
    </details>
  )
}

function SessionRecords({ run, hideTiming }: { run: MuseRun; hideTiming: boolean }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <details
      className="muse-recorded-result muse-session-records"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>Session records</summary>
      {expanded && (
        <>
          {run.entries.map((entry) => (
            <MuseEntryView key={entry.id} entry={entry} hideTiming={hideTiming} />
          ))}
          {run.records && run.records.length > 0 && <SourceRecords records={run.records} />}
        </>
      )}
    </details>
  )
}

export function MuseTranscript({ session }: { session: MuseSession }) {
  const { viewMode } = useSettings()
  const hideTiming = Boolean(session.timingIssue)
  const runCount = session.runs.filter((run) => !run.isContext).length
  let runIndex = 0
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
        if (run.isContext) return <SessionRecords key={key} run={run} hideTiming={hideTiming} />
        const index = runIndex++
        return (
          <section
            className="muse-run"
            key={key}
            aria-label={`${runHeading(run, index)} (Run ${index + 1})`}
          >
            <div className="muse-run-heading">
              <span title={`Run ID: ${run.id}`}>{runHeading(run, index)}</span>
              {runCount > 1 && run.model && <span title={run.model.raw}>{run.model.label}</span>}
              {run.prompt === undefined ? (
                <span>User prompt unavailable</span>
              ) : (
                !run.prompt.trim() && <span>No user prompt text recorded</span>
              )}
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
            {run.records && run.records.length > 0 && <SourceRecords records={run.records} />}
            <RunEnding run={run} hideTiming={hideTiming} />
          </section>
        )
      })}
    </div>
  )
}
