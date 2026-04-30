import { useState } from "react"

export function SkillBlock({ name, body }: { name: string; body: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="tool-card">
      <button
        className="tool-row clickable"
        onClick={() => setExpanded(!expanded)}
      >
        <span>Skill (/{name})</span>
      </button>
      {expanded && (
        <div className="tool-body">
          <pre className="output">{body}</pre>
        </div>
      )}
    </div>
  )
}
