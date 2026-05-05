import type { ReactNode } from "react"
import type { MessageEntry, ToolResult } from "../../types"
import { getBlocks } from "./extractResult"
import { TextBlock } from "./TextBlock"
import { ThinkingBlock } from "../ThinkingBlock"
import { ImageBlock } from "../ImageBlock"
import { Tool } from "./Tool"
import { narrowToolUse } from "./toolTypes"

const EMPTY_RESULT: ToolResult = { content: [], isError: false }

// tool_use_id → tool names referenced in that result's content.
// Used by the ToolSearch card to show which tools were discovered.
export type ToolRefsById = Map<string, string[]>

type Props = {
  entry: MessageEntry
  results: Map<string, ToolResult>
  toolRefsById?: ToolRefsById
  skipKeys: Set<string>
}

export function EntryView({ entry, results, toolRefsById, skipKeys }: Props) {
  const role = entry.message?.role ?? entry.type
  const blocks = getBlocks(entry)
  const nodes: ReactNode[] = []
  for (let j = 0; j < blocks.length; j++) {
    const block = blocks[j]
    if (skipKeys.has(`${entry.uuid}:${j}`)) continue
    if (block.type === "text") {
      nodes.push(<TextBlock key={j} text={block.text} role={role} />)
    } else if (block.type === "thinking") {
      nodes.push(<ThinkingBlock key={j} text={block.thinking} />)
    } else if (block.type === "image") {
      nodes.push(<ImageBlock key={j} source={block.source} role={role} />)
    } else if (block.type === "tool_use") {
      const use = narrowToolUse(block)
      const output = results.get(block.id) ?? EMPTY_RESULT
      nodes.push(<Tool key={j} use={use} output={output} toolRefs={toolRefsById?.get(block.id)} />)
    }
  }
  return <>{nodes}</>
}
