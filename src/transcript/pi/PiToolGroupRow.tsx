import { ToolGroupRow, type GroupItem } from "../ToolGroupRow"
import { ThinkingBlock } from "../ThinkingBlock"
import { PiTool } from "./Tool"
import type { PiGroupItem, PiResultWithDetails } from "./buildPiItems"
import type { PiToolCallContent, PiThinkingContent } from "./types"
import type { SummaryCounts } from "../groupSummary"

type Props = {
  items: PiGroupItem[]
  summary: SummaryCounts
  thinkingCount: number
  results: Map<string, PiResultWithDetails>
}

// Data union for the two item kinds
type PiItemData =
  | { kind: "tool"; call: PiToolCallContent }
  | { kind: "thinking"; entry: PiGroupItem & { kind: "thinking" } }

export function PiToolGroupRow({ items, summary, thinkingCount, results }: Props) {
  const groupItems: GroupItem<PiItemData>[] = items.map((it) => {
    if (it.kind === "tool") {
      return {
        kind: "tool",
        name: it.name,
        status: it.status,
        diffs: it.diffs,
        data: { kind: "tool", call: it.call },
      }
    }
    return {
      kind: "thinking",
      label: "thinking",
      data: { kind: "thinking", entry: it },
    }
  })

  return (
    <ToolGroupRow
      items={groupItems}
      summary={summary}
      thinkingCount={thinkingCount}
      renderToolCard={(data: PiItemData) => {
        if (data.kind !== "tool") return null
        const { call } = data
        const result = results.get(call.id)
        return (
          <PiTool
            call={call}
            output={result ?? { content: [], isError: false }}
            details={result?.details}
          />
        )
      }}
      renderThinking={(data: PiItemData) => {
        if (data.kind !== "thinking") return null
        const { entry } = data
        const msg = entry.entry.message
        if (msg.role !== "assistant" || !Array.isArray(msg.content)) return null
        const block = msg.content[entry.blockIndex] as PiThinkingContent | undefined
        if (block?.type === "thinking") {
          return <ThinkingBlock text={block.thinking} />
        }
        return null
      }}
    />
  )
}
