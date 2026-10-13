import { useSettings } from "../../settings"
import { TextBlock } from "../claude/TextBlock"
import type { SummaryCounts } from "../groupSummary"
import { Header, ToolTitle } from "../shared"
import { ThinkingBlock } from "../ThinkingBlock"
import { ToolCard } from "../ToolCard"
import { ToolGroupRow, type GroupItem } from "../ToolGroupRow"
import { TranscriptHeader } from "../TranscriptHeader"
import { GrokTool, grokToolCategory, grokToolDiffs, grokToolHasImages } from "./Tool"
import type { GrokEntry, GrokSession } from "./types"

function GrokEntryView({ entry }: { entry: GrokEntry }) {
  if (entry.kind === "tool") return <GrokTool entry={entry} />
  if (entry.kind === "unknown") {
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
  if (entry.role === "system" || entry.role === "context") {
    return (
      <ToolCard.Root>
        <ToolCard.Trigger>
          <Header>
            <ToolTitle
              name={entry.label ?? (entry.role === "system" ? "System prompt" : "Context")}
            />
          </Header>
        </ToolCard.Trigger>
        <ToolCard.Content>
          <pre className="output">{entry.text}</pre>
        </ToolCard.Content>
      </ToolCard.Root>
    )
  }
  if (entry.role === "reasoning") return <ThinkingBlock text={entry.text} />
  return <TextBlock role={entry.role} text={entry.text} />
}

type GrokItem =
  | { kind: "entry"; entry: GrokEntry }
  | {
      kind: "group"
      id: string
      entries: GroupItem<GrokEntry>[]
      summary: SummaryCounts
      thinkingCount: number
    }

function buildItems(entries: GrokEntry[], groupTools: boolean): GrokItem[] {
  const items: GrokItem[] = []
  let group: Extract<GrokItem, { kind: "group" }> | undefined
  for (const entry of entries) {
    if (entry.kind === "message" && !entry.text.trim()) continue
    const category = entry.kind === "tool" ? grokToolCategory(entry) : undefined
    const thinking = entry.kind === "message" && entry.role === "reasoning"
    // Image results stay visible while scrolling, rather than being hidden
    // inside a collapsed group of reads or other tool calls.
    const hasImages = entry.kind === "tool" && grokToolHasImages(entry)
    if (groupTools && !hasImages && (category || thinking)) {
      if (!group) {
        group = { kind: "group", id: entry.id, entries: [], summary: {}, thinkingCount: 0 }
        items.push(group)
      }
      if (entry.kind === "tool" && category) {
        group.entries.push({
          kind: "tool",
          name: entry.name,
          status: entry.output.isError ? "error" : "success",
          diffs: grokToolDiffs(entry),
          data: entry,
        })
        group.summary[category] = (group.summary[category] ?? 0) + 1
      } else {
        group.entries.push({ kind: "thinking", label: "reasoning", data: entry })
        group.thinkingCount++
      }
    } else {
      group = undefined
      items.push({ kind: "entry", entry })
    }
  }
  return items
}

export function GrokTranscript({ session }: { session: GrokSession }) {
  const { viewMode } = useSettings()
  const items = buildItems(session.entries, viewMode === "chat")
  return (
    <div className={`transcript${viewMode === "chat" ? " transcript-chat" : ""}`}>
      {session.models.length > 0 && (
        <TranscriptHeader models={session.models.map((model) => ({ label: model, raw: model }))} />
      )}
      {items.map((item) =>
        item.kind === "entry" ? (
          <GrokEntryView key={item.entry.id} entry={item.entry} />
        ) : (
          <ToolGroupRow
            key={`group-${item.id}`}
            items={item.entries}
            summary={item.summary}
            thinkingCount={item.thinkingCount}
            renderToolCard={(entry) => <GrokEntryView entry={entry} />}
            renderThinking={(entry) => <GrokEntryView entry={entry} />}
          />
        ),
      )}
    </div>
  )
}
