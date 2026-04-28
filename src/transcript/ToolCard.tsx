import { useState, type ReactNode } from "react"
import type { ToolUseBlock, ToolResult } from "../types"
import { iconFor, toolLabel, toolTitle } from "./toolMeta"
import { ImageBlock } from "./ImageBlock"

export function ToolCard({
  block,
  result,
  extraBody,
}: {
  block: ToolUseBlock
  result: ToolResult
  extraBody?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const { Icon, color } = iconFor(block.name)
  const title = toolTitle(block)
  const label = toolLabel(block.name, title)
  const input = block.input ?? {}
  const output = result.text

  let body: ReactNode = null
  if (block.name === "Bash") {
    body = output ? <pre className="output">{output}</pre> : null
  } else if (block.name === "Edit") {
    const oldS = (input.old_string as string) ?? ""
    const newS = (input.new_string as string) ?? ""
    body = (
      <>
        {oldS && <pre className="output diff-del">- {oldS.replace(/\n/g, "\n- ")}</pre>}
        {newS && <pre className="output diff-add">+ {newS.replace(/\n/g, "\n+ ")}</pre>}
        {output && <pre className="output">{output}</pre>}
      </>
    )
  } else if (block.name === "MultiEdit") {
    const edits =
      (input.edits as Array<{ old_string?: string; new_string?: string }>) ?? []
    body = (
      <div className="multi-edit">
        {edits.map((e, i) => (
          <div key={i}>
            {e.old_string && (
              <pre className="output diff-del">
                - {e.old_string.replace(/\n/g, "\n- ")}
              </pre>
            )}
            {e.new_string && (
              <pre className="output diff-add">
                + {e.new_string.replace(/\n/g, "\n+ ")}
              </pre>
            )}
          </div>
        ))}
        {output && <pre className="output">{output}</pre>}
      </div>
    )
  } else if (block.name === "Write") {
    const content = (input.content as string) ?? ""
    body = (
      <>
        {content && <pre className="output">{content}</pre>}
        {output && <pre className="output">{output}</pre>}
      </>
    )
  } else if (output) {
    body = <pre className="output">{output}</pre>
  }

  const images = result.images
  const toolRefs = result.toolRefs
  const hasBody =
    body !== null || images.length > 0 || toolRefs.length > 0 || !!extraBody

  return (
    <div className="tool-card">
      <button
        className={`tool-row ${hasBody ? "clickable" : ""}`}
        onClick={() => hasBody && setExpanded(!expanded)}
      >
        <Icon size={16} className={`icon ${color}`} />
        <span>{label}</span>
      </button>
      {expanded && hasBody && (
        <div className="tool-body">
          {body}
          {toolRefs.length > 0 && (
            <div className="tool-refs">
              <div className="tool-refs-label">Loaded tools</div>
              <ul>
                {toolRefs.map((name, i) => (
                  <li key={i}>{name}</li>
                ))}
              </ul>
            </div>
          )}
          {images.map((src, i) => (
            <ImageBlock key={i} source={src} />
          ))}
          {extraBody && <pre className="output">{extraBody}</pre>}
        </div>
      )}
    </div>
  )
}
