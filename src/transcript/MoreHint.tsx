import { useCardToggle } from "./ToolCard"

export function MoreHint({ count }: { count: number }) {
  const toggle = useCardToggle()
  if (count <= 0) return null
  return (
    <button type="button" className="tool-more-hint" onClick={toggle}>
      See {count} more {count === 1 ? "line" : "lines"}…
    </button>
  )
}
