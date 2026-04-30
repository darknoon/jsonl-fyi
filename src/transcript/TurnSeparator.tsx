import { formatDuration } from "./timing"
import { formatTokens, type TurnUsage } from "./usage"

type Props = {
  durationMs: number
  usage?: TurnUsage | null
  verb?: string | null
}

export function TurnSeparator({ durationMs, usage, verb }: Props) {
  return (
    <div className="turn-separator" aria-hidden="true">
      <span className="turn-separator-marker">✓</span>
      <span className="turn-separator-label">
        {verb ? `${verb} for ` : ""}
        {formatDuration(durationMs)}
      </span>
      {usage && (
        <span className="turn-separator-usage">
          <span>↑ {formatTokens(usage.input)}</span>
          <span>↻ {formatTokens(usage.cacheRead)}</span>
          <span>↓ {formatTokens(usage.output)}</span>
        </span>
      )}
    </div>
  )
}
