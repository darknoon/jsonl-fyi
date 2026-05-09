import { formatDuration } from "./timing"
import { formatTokens, type TurnUsage } from "./usage"
import type { ModelDisplay } from "./model"

type Props = {
  durationMs: number
  usage?: TurnUsage | null
  verb?: string | null
  model?: ModelDisplay | null
}

export function TurnSeparator({ durationMs, usage, verb, model }: Props) {
  return (
    <div className="turn-separator" aria-hidden="true">
      <span className="turn-separator-marker">✓</span>
      <span className="turn-separator-label">
        {verb ? `${verb} for ` : ""}
        {formatDuration(durationMs)}
      </span>
      {usage && (
        <span className="turn-separator-usage">
          <span title={`Input: ${usage.input.toLocaleString()} tokens`}>
            ↑ {formatTokens(usage.input)}
          </span>
          <span title={`Output: ${usage.output.toLocaleString()} tokens`}>
            ↓ {formatTokens(usage.output)}
          </span>
          <span title={`Cache read: ${usage.cacheRead.toLocaleString()} tokens`}>
            ↻ {formatTokens(usage.cacheRead)}
          </span>
        </span>
      )}
      {model && (
        <span className="turn-separator-model" title={model.raw}>
          {model.label}
        </span>
      )}
    </div>
  )
}
