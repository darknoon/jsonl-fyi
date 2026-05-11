import type { ReactNode } from "react"
import { ToolGroupRow, type GroupItem } from "../ToolGroupRow"
import { EntryView } from "./EntryView"
import type { CodexGroupItem } from "./buildCodexItems"
import type { ToolResult } from "../../types"
import type { CodexResponseItem } from "./types"
import type { SummaryCounts } from "../groupSummary"

type Props = {
  items: CodexGroupItem[]
  summary: SummaryCounts
  thinkingCount: number
  results: Map<string, ToolResult>
  agentNicknames: Map<string, string>
}

// Data union: tool items carry the CodexResponseItem directly;
// thinking items do too (reasoning is its own entry).
type CodexItemData = CodexResponseItem

export function CodexToolGroupRow({ items, summary, thinkingCount, results, agentNicknames }: Props) {
  const groupItems: GroupItem<CodexItemData>[] = items.map((it) => {
    if (it.kind === "tool") {
      return {
        kind: "tool",
        name: it.name,
        status: it.status,
        diffs: it.diffs,
        data: it.entry,
      }
    }
    return {
      kind: "thinking",
      label: "reasoning",
      data: it.entry,
    }
  })

  return (
    <ToolGroupRow
      items={groupItems}
      summary={summary}
      thinkingCount={thinkingCount}
      renderToolCard={(entry: CodexItemData): ReactNode => (
        <EntryView entry={entry} results={results} agentNicknames={agentNicknames} />
      )}
      renderThinking={(entry: CodexItemData): ReactNode => (
        <EntryView entry={entry} results={results} agentNicknames={agentNicknames} />
      )}
    />
  )
}
