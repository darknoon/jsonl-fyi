import { ToolGroupRow, type GroupItem } from "../ToolGroupRow"
import { Tool } from "./Tool"
import { ThinkingBlock } from "../ThinkingBlock"
import { narrowToolUse } from "./toolTypes"
import { getBlocks } from "./extractResult"
import type { ClaudeGroupItem } from "../timing"
import type { ToolResult, ToolUseBlock } from "../../types"
import type { ToolRefsById } from "./EntryView"
import type { SummaryCounts } from "../groupSummary"

const EMPTY_RESULT: ToolResult = { content: [], isError: false }

type Props = {
  items: ClaudeGroupItem[]
  summary: SummaryCounts
  thinkingCount: number
  results: Map<string, ToolResult>
  toolRefsById: ToolRefsById
}

// Data union for the two item kinds
type ClaudeItemData =
  | { kind: "tool"; block: ToolUseBlock }
  | { kind: "thinking"; entry: ClaudeGroupItem & { kind: "thinking" } }

export function ClaudeToolGroupRow({ items, summary, thinkingCount, results, toolRefsById }: Props) {
  const groupItems: GroupItem<ClaudeItemData>[] = items.map((it) => {
    if (it.kind === "tool") {
      return {
        kind: "tool",
        name: it.name,
        status: it.status,
        diffs: it.diffs,
        data: { kind: "tool", block: it.block },
      }
    }
    return {
      kind: "thinking",
      label: "Thinking",
      data: { kind: "thinking", entry: it },
    }
  })

  return (
    <ToolGroupRow
      items={groupItems}
      summary={summary}
      thinkingCount={thinkingCount}
      renderToolCard={(data: ClaudeItemData) => {
        if (data.kind !== "tool") return null
        const { block } = data
        const use = narrowToolUse(block)
        const output = results.get(block.id) ?? EMPTY_RESULT
        return <Tool use={use} output={output} toolRefs={toolRefsById.get(block.id)} />
      }}
      renderThinking={(data: ClaudeItemData) => {
        if (data.kind !== "thinking") return null
        const { entry } = data
        const blocks = getBlocks(entry.entry)
        const block = blocks[entry.blockIndex]
        if (block?.type === "thinking") {
          return <ThinkingBlock text={block.thinking} />
        }
        return null
      }}
    />
  )
}
