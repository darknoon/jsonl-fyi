import type { Entry, Block, ToolResult, ToolResultBlock } from "../../types"

export function extractResult(block: ToolResultBlock): ToolResult {
  const c = block.content
  const isError = block.is_error === true
  if (typeof c === "string") {
    return { content: c ? [{ type: "text", text: c }] : [], isError }
  }
  const content: ToolResult["content"] = []
  for (const item of c) {
    if (item.type === "text") content.push({ type: "text", text: item.text })
    else if (item.type === "image") content.push({ type: "image", source: item.source })
  }
  return { content, isError }
}

export function getBlocks(entry: Entry): Block[] {
  if (entry.type === "system") return []
  const c = entry.message?.content
  if (!c) return []
  if (typeof c === "string") return [{ type: "text", text: c }]
  return c
}
