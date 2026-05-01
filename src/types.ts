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
  is_error?: boolean
}

export type Block = TextBlock | ThinkingBlock | ImageBlock | ToolUseBlock | ToolResultBlock

export type ClaudeUsage = {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

export type MessageEntry = {
  type: "user" | "assistant"
  uuid?: string
  parentUuid?: string | null
  isSidechain?: boolean
  timestamp?: string
  message?: {
    role?: string
    content?: Block[] | string
    usage?: ClaudeUsage
    model?: string
  }
}

export type TurnDurationEntry = {
  type: "system"
  subtype: "turn_duration"
  durationMs: number
  messageCount?: number
  parentUuid: string
  uuid?: string
  timestamp?: string
  isSidechain?: boolean
}

export type UnknownSystemEntry = {
  type: "system"
  subtype: string
  uuid?: string
  parentUuid?: string | null
  timestamp?: string
  isSidechain?: boolean
}

export type SystemEntry = TurnDurationEntry | UnknownSystemEntry

export type Entry = MessageEntry | SystemEntry

export type ToolResultContent =
  | { type: "text"; text: string }
  | { type: "image"; source: ImageSource }

export type ToolResult = {
  content: ToolResultContent[]
  isError: boolean
  // Text the harness emits as a sibling user message right after the
  // tool_result, related to this tool call. Today only the Skill tool uses
  // it (the injected skill markdown body); see Transcript.tsx pre-pass.
  injectedText?: string
}
