import type {
  Entry,
  Block,
  ImageSource,
  ToolResult,
  ToolResultBlock,
} from "../types"

export function extractResult(block: ToolResultBlock): ToolResult {
  const c = block.content
  if (typeof c === "string") return { text: c, images: [] }
  const text: string[] = []
  const images: ImageSource[] = []
  for (const item of c) {
    if (item.type === "text") text.push(item.text)
    else if (item.type === "image") images.push(item.source)
  }
  return { text: text.join("\n"), images }
}

export function getBlocks(entry: Entry): Block[] {
  const c = entry.message?.content
  if (!c) return []
  if (typeof c === "string") return [{ type: "text", text: c }]
  return c
}
