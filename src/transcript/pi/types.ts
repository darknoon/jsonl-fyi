import type { ImageSource } from "../../types"

export type PiTextContent = { type: "text"; text: string }
export type PiImageContent = { type: "image"; data: string; mimeType: string }
export type PiThinkingContent = { type: "thinking"; thinking: string; thinkingSignature?: string }
export type PiToolCallContent = {
  type: "toolCall"
  id: string
  name: string
  arguments: Record<string, unknown>
}
export type PiContent = PiTextContent | PiImageContent | PiThinkingContent | PiToolCallContent

export type PiUsage = {
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
  totalTokens?: number
  cost?: {
    input?: number
    output?: number
    cacheRead?: number
    cacheWrite?: number
    total?: number
  }
}

export type PiUserMessage = {
  role: "user"
  content: string | Array<PiTextContent | PiImageContent>
  timestamp?: number
}

export type PiAssistantMessage = {
  role: "assistant"
  content: PiContent[]
  api?: string
  provider?: string
  model?: string
  usage?: PiUsage
  stopReason?: "stop" | "length" | "toolUse" | "error" | "aborted" | string
  errorMessage?: string
  timestamp?: number
  responseId?: string
}

export type PiToolResultMessage = {
  role: "toolResult"
  toolCallId: string
  toolName: string
  content: Array<PiTextContent | PiImageContent>
  details?: unknown
  isError?: boolean
  timestamp?: number
}

export type PiBashExecutionMessage = {
  role: "bashExecution"
  command: string
  output: string
  exitCode?: number
  cancelled: boolean
  truncated: boolean
  fullOutputPath?: string
  excludeFromContext?: boolean
  timestamp?: number
}

export type PiCustomMessage = {
  role: "custom"
  customType: string
  content: string | Array<PiTextContent | PiImageContent>
  display: boolean
  details?: unknown
  timestamp?: number
}

export type PiBranchSummaryMessage = {
  role: "branchSummary"
  summary: string
  fromId: string
  timestamp?: number
}

export type PiCompactionSummaryMessage = {
  role: "compactionSummary"
  summary: string
  tokensBefore: number
  timestamp?: number
}

export type PiMessage =
  | PiUserMessage
  | PiAssistantMessage
  | PiToolResultMessage
  | PiBashExecutionMessage
  | PiCustomMessage
  | PiBranchSummaryMessage
  | PiCompactionSummaryMessage
  | { role: string; [key: string]: unknown }

export type PiSessionHeader = {
  type: "session"
  version?: number
  id: string
  timestamp: string
  cwd?: string
  parentSession?: string
}

export type PiEntryBase = {
  type: string
  id: string
  parentId: string | null
  timestamp?: string
}

export type PiMessageEntry = PiEntryBase & { type: "message"; message: PiMessage }
export type PiModelChangeEntry = PiEntryBase & {
  type: "model_change"
  provider: string
  modelId: string
}
export type PiThinkingLevelChangeEntry = PiEntryBase & {
  type: "thinking_level_change"
  thinkingLevel: string
}
export type PiCompactionEntry = PiEntryBase & {
  type: "compaction"
  summary: string
  firstKeptEntryId: string
  tokensBefore: number
  details?: unknown
  fromHook?: boolean
}
export type PiBranchSummaryEntry = PiEntryBase & {
  type: "branch_summary"
  fromId: string
  summary: string
  details?: unknown
  fromHook?: boolean
}
export type PiCustomEntry = PiEntryBase & { type: "custom"; customType: string; data?: unknown }
export type PiCustomMessageEntry = PiEntryBase & {
  type: "custom_message"
  customType: string
  content: string | Array<PiTextContent | PiImageContent>
  display: boolean
  details?: unknown
}
export type PiLabelEntry = PiEntryBase & { type: "label"; targetId: string; label?: string }
export type PiSessionInfoEntry = PiEntryBase & { type: "session_info"; name?: string }
export type PiUnknownEntry = PiEntryBase & { type: string; [key: string]: unknown }

export type PiTreeEntry =
  | PiMessageEntry
  | PiModelChangeEntry
  | PiThinkingLevelChangeEntry
  | PiCompactionEntry
  | PiBranchSummaryEntry
  | PiCustomEntry
  | PiCustomMessageEntry
  | PiLabelEntry
  | PiSessionInfoEntry
  | PiUnknownEntry

export type PiParsedSession = {
  header: PiSessionHeader | null
  entries: PiTreeEntry[]
  activeEntries: PiTreeEntry[]
  hiddenBranchEntryCount: number
  orphanedEntryCount: number
}

export function piImageToSource(image: PiImageContent): ImageSource {
  return { type: "base64", media_type: image.mimeType, data: image.data }
}
