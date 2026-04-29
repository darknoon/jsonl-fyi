import { useState, type ReactNode } from "react"
import type { ToolUseBlock, ToolResult } from "../types"
import { iconFor, toolLabel, toolTitle } from "./toolMeta"
import { ImageBlock } from "./ImageBlock"
import { EditDiff } from "./EditDiff"

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
    const filePath = (input.file_path as string) ?? ""
    const oldS = (input.old_string as string) ?? ""
    const newS = (input.new_string as string) ?? ""
    body = (
      <>
        {(oldS || newS) && (
          <EditDiff filePath={filePath} oldString={oldS} newString={newS} />
        )}
        {output && <pre className="output">{output}</pre>}
      </>
    )
  } else if (block.name === "MultiEdit") {
    const filePath = (input.file_path as string) ?? ""
    const edits =
      (input.edits as Array<{ old_string?: string; new_string?: string }>) ?? []
    body = (
      <div className="multi-edit">
        {edits.map((e, i) => (
          <EditDiff
            key={i}
            filePath={filePath}
            oldString={e.old_string ?? ""}
            newString={e.new_string ?? ""}
          />
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
