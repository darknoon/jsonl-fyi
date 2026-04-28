import type { ReactNode } from "react"
import type { Entry, ToolResult } from "../types"
import { extractResult, getBlocks } from "./extractResult"
import { TextBlock } from "./TextBlock"
import { ThinkingBlock } from "./ThinkingBlock"
import { ImageBlock } from "./ImageBlock"
import { ToolCard } from "./ToolCard"

const EMPTY_RESULT: ToolResult = { text: "", images: [] }

export function Transcript({ entries }: { entries: Entry[] }) {
  const results = new Map<string, ToolResult>()
  for (const entry of entries) {
    for (const block of getBlocks(entry)) {
      if (block.type === "tool_result") {
        results.set(block.tool_use_id, extractResult(block))
      }
    }
  }

  const nodes: ReactNode[] = []
  let key = 0
  for (const entry of entries) {
    const role = entry.message?.role ?? entry.type
    for (const block of getBlocks(entry)) {
      const k = key++
      if (block.type === "text") {
        nodes.push(<TextBlock key={k} text={block.text} role={role} />)
      } else if (block.type === "thinking") {
        nodes.push(<ThinkingBlock key={k} text={block.thinking} />)
      } else if (block.type === "image") {
        nodes.push(<ImageBlock key={k} source={block.source} />)
      } else if (block.type === "tool_use") {
        nodes.push(
          <ToolCard
            key={k}
            block={block}
            result={results.get(block.id) ?? EMPTY_RESULT}
          />,
        )
      }
    }
  }

  return <div className="transcript">{nodes}</div>
}
