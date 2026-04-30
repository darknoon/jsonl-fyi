import type { ReactNode } from "react"
import { formatDuration } from "./timing"

type Props = {
  durationMs: number
  children?: ReactNode
}

export function TurnSeparator({ durationMs, children }: Props) {
  return (
    <div className="turn-separator" aria-hidden="true">
      <span className="turn-separator-marker">✓</span>
      <span className="turn-separator-label">
        Done {formatDuration(durationMs)}
      </span>
      {children}
    </div>
  )
}
