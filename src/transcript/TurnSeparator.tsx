import { formatDuration } from "./timing"
import { formatTokens, type TurnUsage } from "./usage"

type Props = {
  durationMs: number
  usage?: TurnUsage | null
}

export function TurnSeparator({ durationMs, usage }: Props) {
  return (
    <div className="turn-separator" aria-hidden="true">
      <span className="turn-separator-marker">✓</span>
      <span className="turn-separator-label">{formatDuration(durationMs)}</span>
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
