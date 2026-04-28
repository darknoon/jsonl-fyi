export type ImageSource =
  | { type: "base64"; media_type: string; data: string }
  | { type: "url"; url: string }

export type TextBlock = { type: "text"; text: string }
export type ThinkingBlock = { type: "thinking"; thinking: string }
export type ImageBlock = { type: "image"; source: ImageSource }
export type ToolUseBlock = {
  type: "tool_use"
  id: string
  name: string
  input: Record<string, unknown>
}
export type ToolResultContentItem =
  | { type: "text"; text: string }
  | { type: "image"; source: ImageSource }
  | { type: "tool_reference"; tool_name: string }
export type ToolResultBlock = {
  type: "tool_result"
  tool_use_id: string
  content: string | ToolResultContentItem[]
}

export type Block =
  | TextBlock
  | ThinkingBlock
  | ImageBlock
  | ToolUseBlock
  | ToolResultBlock

export type Entry = {
  uuid?: string
  parentUuid?: string | null
  isSidechain?: boolean
  timestamp?: string
  type: string
  message?: { role?: string; content?: Block[] | string }
}

export type ToolResult = {
  text: string
  images: ImageSource[]
  toolRefs: string[]
}
