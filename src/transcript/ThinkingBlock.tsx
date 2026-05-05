import { useEffect, useRef, useState } from "react"

export function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const contentRef = useRef<HTMLSpanElement>(null)
  const trimmed = text.trim()

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const measure = () => {
      if (expanded) return
      setTruncated(el.scrollHeight > el.clientHeight + 1)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [trimmed, expanded])

  if (!trimmed) return null
  const interactive = truncated || expanded
  return (
    <button
      className={`thinking ${expanded ? "thinking-expanded" : ""} ${interactive ? "" : "thinking-static"}`}
      onClick={interactive ? () => setExpanded(!expanded) : undefined}
      aria-label="Thinking"
      tabIndex={interactive ? 0 : -1}
    >
      <span ref={contentRef} className="thinking-content">{trimmed}</span>
    </button>
  )
}
