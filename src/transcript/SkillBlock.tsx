import { useState } from "react"
import { Paperclip } from "@phosphor-icons/react"

export function SkillBlock({ name, body }: { name: string; body: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="tool-card">
      <button
        className="tool-row clickable"
        onClick={() => setExpanded(!expanded)}
      >
        <Paperclip size={16} className="icon tool-violet" />
        <span>Loaded /{name}</span>
      </button>
      {expanded && (
        <div className="tool-body">
          <pre className="output">{body}</pre>
        </div>
      )}
    </div>
  )
}
