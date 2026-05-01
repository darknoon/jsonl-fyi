import type { ToolResult } from "../../types"
import type { PiToolResultMessage } from "./types"
import { piImageToSource } from "./types"

export function extractPiToolResult(message: PiToolResultMessage): ToolResult {
  const content: ToolResult["content"] = []

  for (const item of message.content) {
    if (item.type === "text") {
      content.push({ type: "text", text: item.text })
    } else if (item.type === "image") {
      content.push({ type: "image", source: piImageToSource(item) })
    }
  }

  return { content, isError: !!message.isError }
}
