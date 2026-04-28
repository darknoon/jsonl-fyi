import { useState } from "react"
import { Icons } from "./toolMeta"

export function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  if (!text.trim()) return null
  return (
    <button className="thinking" onClick={() => setExpanded(!expanded)}>
      <Icons.Brain size={16} className="icon-muted" />
      <span className={expanded ? "" : "clamp-1"}>{text}</span>
    </button>
  )
}
