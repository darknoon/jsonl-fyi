import type { ReactNode } from "react"
import { formatDuration } from "./timing"

type Props = {
  durationMs: number
  children?: ReactNode
}

export function TurnSeparator({ durationMs, children }: Props) {
  return (
    <div className="turn-separator" aria-hidden="true">
      <span>{formatDuration(durationMs)}</span>
      {children}
    </div>
  )
}
