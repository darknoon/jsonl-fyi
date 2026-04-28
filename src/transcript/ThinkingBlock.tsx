import { useState } from "react"
import { Robot } from "@phosphor-icons/react"

export function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const trimmed = text.trim()
  if (!trimmed) return null
  return (
    <button
      className={`thinking ${expanded ? "thinking-expanded" : ""}`}
      onClick={() => setExpanded(!expanded)}
      aria-label="Thinking"
    >
      <Robot size={16} className="thinking-icon" />
      <span className="thinking-content">{trimmed}</span>
    </button>
  )
}
