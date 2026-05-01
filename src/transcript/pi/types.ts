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

export type PiKnownMessageRole =
  | "user"
  | "assistant"
  | "toolResult"
  | "bashExecution"
  | "custom"
  | "branchSummary"
  | "compactionSummary"

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

// Unknown roles are preserved at runtime, but use `never` for the discriminant type so
// the fallback member does not overlap known roles and weaken narrowing.
export type PiUnknownMessage = { role: never; [key: string]: unknown }

export type PiMessage =
  | PiUserMessage
  | PiAssistantMessage
  | PiToolResultMessage
  | PiBashExecutionMessage
  | PiCustomMessage
  | PiBranchSummaryMessage
  | PiCompactionSummaryMessage
  | PiUnknownMessage

export type PiSessionHeader = {
  type: "session"
  version?: number
  id: string
  timestamp: string
  cwd?: string
  parentSession?: string
}

export type PiKnownEntryType =
  | "message"
  | "model_change"
  | "thinking_level_change"
  | "compaction"
  | "branch_summary"
  | "custom"
  | "custom_message"
  | "label"
  | "session_info"
export type PiEntryBase<TType extends string = string> = {
  type: TType
  id: string
  parentId: string | null
  timestamp?: string
}

export type PiMessageEntry = PiEntryBase<"message"> & { message: PiMessage }
export type PiModelChangeEntry = PiEntryBase<"model_change"> & {
  type: "model_change"
  provider: string
  modelId: string
}
export type PiThinkingLevelChangeEntry = PiEntryBase<"thinking_level_change"> & {
  thinkingLevel: string
}
export type PiCompactionEntry = PiEntryBase<"compaction"> & {
  summary: string
  firstKeptEntryId: string
  tokensBefore: number
  details?: unknown
  fromHook?: boolean
}
export type PiBranchSummaryEntry = PiEntryBase<"branch_summary"> & {
  fromId: string
  summary: string
  details?: unknown
  fromHook?: boolean
}
export type PiCustomEntry = PiEntryBase<"custom"> & { customType: string; data?: unknown }
export type PiCustomMessageEntry = PiEntryBase<"custom_message"> & {
  customType: string
  content: string | Array<PiTextContent | PiImageContent>
  display: boolean
  details?: unknown
}
export type PiLabelEntry = PiEntryBase<"label"> & { targetId: string; label?: string }
export type PiSessionInfoEntry = PiEntryBase<"session_info"> & { name?: string }
// Unknown entry type strings are preserved at runtime, but use `never` for the
// discriminant type so this fallback member does not overlap known entry shapes.
export type PiUnknownEntry = PiEntryBase<never> & { [key: string]: unknown }

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
