import { useState, type ReactNode } from "react"
import type { ToolDiff } from "./grouping"
import type { SummaryCounts } from "./groupSummary"
import { renderProseSummary } from "./groupSummary"

export type { ToolDiff }

export type GroupItem<T> =
  | { kind: "tool"; name: string; status: "success" | "error"; diffs: ToolDiff[]; data: T }
  | { kind: "thinking"; label: string; data: T }

export function aggregateStatus(
  statuses: Array<"success" | "error">,
): "success" | "error" | "mixed" {
  const hasErr = statuses.includes("error")
  const hasOk = statuses.includes("success")
  return hasErr && hasOk ? "mixed" : hasErr ? "error" : "success"
}

type Props<T> = {
  items: GroupItem<T>[]
  summary: SummaryCounts
  thinkingCount: number
  renderToolCard: (data: T) => ReactNode
  renderThinking: (data: T) => ReactNode
}

export function ToolGroupRow<T>({
  items,
  summary,
  thinkingCount,
  renderToolCard,
  renderThinking,
}: Props<T>) {
  const [expanded, setExpanded] = useState(false)

  const failureCount = items.reduce(
    (n, it) => (it.kind === "tool" && it.status === "error" ? n + 1 : n),
    0,
  )
  const failureSuffix =
    failureCount > 0 ? ` (${failureCount} failure${failureCount === 1 ? "" : "s"})` : ""

  const prose = renderProseSummary(summary, thinkingCount)
  const fullProse = prose ? `${prose}${failureSuffix}` : failureSuffix || null

  return (
    <div className="tool-group">
      <button
        type="button"
        className="tool-row clickable tool-group-row"
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="tool-title">
          <span className="tool-title-prose">{fullProse}</span>
        </span>
      </button>

      {expanded && (
        <div className="tool-group-expanded">
          {items.map((it, i) => (
            <div key={i}>
              {it.kind === "tool" ? renderToolCard(it.data) : renderThinking(it.data)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
