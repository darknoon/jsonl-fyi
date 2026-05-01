import type {
  PiAssistantMessage,
  PiBashExecutionMessage,
  PiBranchSummaryEntry,
  PiBranchSummaryMessage,
  PiCompactionEntry,
  PiCompactionSummaryMessage,
  PiContent,
  PiCustomEntry,
  PiCustomMessage,
  PiCustomMessageEntry,
  PiImageContent,
  PiKnownEntryType,
  PiKnownMessageRole,
  PiLabelEntry,
  PiMessage,
  PiMessageEntry,
  PiModelChangeEntry,
  PiParsedSession,
  PiSessionHeader,
  PiSessionInfoEntry,
  PiTextContent,
  PiThinkingLevelChangeEntry,
  PiToolResultMessage,
  PiTreeEntry,
  PiUnknownEntry,
  PiUserMessage,
} from "./types"

const knownEntryTypes = new Set<PiKnownEntryType>([
  "message",
  "model_change",
  "thinking_level_change",
  "compaction",
  "branch_summary",
  "custom",
  "custom_message",
  "label",
  "session_info",
])

const knownMessageRoles = new Set<PiKnownMessageRole>([
  "user",
  "assistant",
  "toolResult",
  "bashExecution",
  "custom",
  "branchSummary",
  "compactionSummary",
])

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object"
}

function isHeader(value: Record<string, unknown>): value is PiSessionHeader {
  return (
    value.type === "session" && typeof value.id === "string" && typeof value.timestamp === "string"
  )
}

function hasBaseTreeFields(value: Record<string, unknown>): value is Record<string, unknown> & {
  type: string
  id: string
  parentId: string | null
} {
  return (
    typeof value.type === "string" &&
    value.type !== "session" &&
    typeof value.id === "string" &&
    (typeof value.parentId === "string" || value.parentId === null) &&
    (value.timestamp === undefined || typeof value.timestamp === "string")
  )
}

function isTextContent(value: unknown): value is PiTextContent {
  return isObject(value) && value.type === "text" && typeof value.text === "string"
}

function isImageContent(value: unknown): value is PiImageContent {
  return (
    isObject(value) &&
    value.type === "image" &&
    typeof value.data === "string" &&
    typeof value.mimeType === "string"
  )
}

function isPromptContent(value: unknown): value is PiTextContent | PiImageContent {
  return isTextContent(value) || isImageContent(value)
}

function isPromptContentArray(value: unknown): value is Array<PiTextContent | PiImageContent> {
  return Array.isArray(value) && value.every(isPromptContent)
}

function isAssistantContent(value: unknown): value is PiContent {
  if (!isObject(value) || typeof value.type !== "string") return false
  switch (value.type) {
    case "text":
      return typeof value.text === "string"
    case "image":
      return typeof value.data === "string" && typeof value.mimeType === "string"
    case "thinking":
      return (
        typeof value.thinking === "string" &&
        (value.thinkingSignature === undefined || typeof value.thinkingSignature === "string")
      )
    case "toolCall":
      return (
        typeof value.id === "string" && typeof value.name === "string" && isObject(value.arguments)
      )
    default:
      return false
  }
}

function isAssistantContentArray(value: unknown): value is PiContent[] {
  return Array.isArray(value) && value.every(isAssistantContent)
}

function hasOptionalNumber(value: Record<string, unknown>, key: string): boolean {
  return value[key] === undefined || typeof value[key] === "number"
}

function isUserMessage(value: Record<string, unknown>): value is PiUserMessage {
  return (
    value.role === "user" &&
    (typeof value.content === "string" || isPromptContentArray(value.content)) &&
    hasOptionalNumber(value, "timestamp")
  )
}

function isAssistantMessage(value: Record<string, unknown>): value is PiAssistantMessage {
  return (
    value.role === "assistant" &&
    isAssistantContentArray(value.content) &&
    hasOptionalNumber(value, "timestamp")
  )
}

function isToolResultMessage(value: Record<string, unknown>): value is PiToolResultMessage {
  return (
    value.role === "toolResult" &&
    typeof value.toolCallId === "string" &&
    typeof value.toolName === "string" &&
    isPromptContentArray(value.content) &&
    hasOptionalNumber(value, "timestamp")
  )
}

function isBashExecutionMessage(value: Record<string, unknown>): value is PiBashExecutionMessage {
  return (
    value.role === "bashExecution" &&
    typeof value.command === "string" &&
    typeof value.output === "string" &&
    typeof value.cancelled === "boolean" &&
    typeof value.truncated === "boolean" &&
    hasOptionalNumber(value, "timestamp")
  )
}

function isCustomMessage(value: Record<string, unknown>): value is PiCustomMessage {
  return (
    value.role === "custom" &&
    typeof value.customType === "string" &&
    (typeof value.content === "string" || isPromptContentArray(value.content)) &&
    typeof value.display === "boolean" &&
    hasOptionalNumber(value, "timestamp")
  )
}

function isBranchSummaryMessage(value: Record<string, unknown>): value is PiBranchSummaryMessage {
  return (
    value.role === "branchSummary" &&
    typeof value.summary === "string" &&
    typeof value.fromId === "string" &&
    hasOptionalNumber(value, "timestamp")
  )
}

function isCompactionSummaryMessage(
  value: Record<string, unknown>,
): value is PiCompactionSummaryMessage {
  return (
    value.role === "compactionSummary" &&
    typeof value.summary === "string" &&
    typeof value.tokensBefore === "number" &&
    hasOptionalNumber(value, "timestamp")
  )
}

function isPiMessage(value: unknown): value is PiMessage {
  if (!isObject(value) || typeof value.role !== "string") return false
  switch (value.role) {
    case "user":
      return isUserMessage(value)
    case "assistant":
      return isAssistantMessage(value)
    case "toolResult":
      return isToolResultMessage(value)
    case "bashExecution":
      return isBashExecutionMessage(value)
    case "custom":
      return isCustomMessage(value)
    case "branchSummary":
      return isBranchSummaryMessage(value)
    case "compactionSummary":
      return isCompactionSummaryMessage(value)
    default:
      return !knownMessageRoles.has(value.role as PiKnownMessageRole)
  }
}

function isMessageEntry(value: Record<string, unknown>): value is PiMessageEntry {
  return value.type === "message" && isPiMessage(value.message)
}

function isModelChangeEntry(value: Record<string, unknown>): value is PiModelChangeEntry {
  return (
    value.type === "model_change" &&
    typeof value.provider === "string" &&
    typeof value.modelId === "string"
  )
}

function isThinkingLevelChangeEntry(
  value: Record<string, unknown>,
): value is PiThinkingLevelChangeEntry {
  return value.type === "thinking_level_change" && typeof value.thinkingLevel === "string"
}

function isCompactionEntry(value: Record<string, unknown>): value is PiCompactionEntry {
  return (
    value.type === "compaction" &&
    typeof value.summary === "string" &&
    typeof value.firstKeptEntryId === "string" &&
    typeof value.tokensBefore === "number"
  )
}

function isBranchSummaryEntry(value: Record<string, unknown>): value is PiBranchSummaryEntry {
  return (
    value.type === "branch_summary" &&
    typeof value.fromId === "string" &&
    typeof value.summary === "string"
  )
}

function isCustomEntry(value: Record<string, unknown>): value is PiCustomEntry {
  return value.type === "custom" && typeof value.customType === "string"
}

function isCustomMessageEntry(value: Record<string, unknown>): value is PiCustomMessageEntry {
  return (
    value.type === "custom_message" &&
    typeof value.customType === "string" &&
    (typeof value.content === "string" || isPromptContentArray(value.content)) &&
    typeof value.display === "boolean"
  )
}

function isLabelEntry(value: Record<string, unknown>): value is PiLabelEntry {
  return (
    value.type === "label" &&
    typeof value.targetId === "string" &&
    (value.label === undefined || typeof value.label === "string")
  )
}

function isSessionInfoEntry(value: Record<string, unknown>): value is PiSessionInfoEntry {
  return (
    value.type === "session_info" && (value.name === undefined || typeof value.name === "string")
  )
}

function isKnownTreeEntry(
  value: Record<string, unknown>,
): value is Exclude<PiTreeEntry, PiUnknownEntry> {
  switch (value.type) {
    case "message":
      return isMessageEntry(value)
    case "model_change":
      return isModelChangeEntry(value)
    case "thinking_level_change":
      return isThinkingLevelChangeEntry(value)
    case "compaction":
      return isCompactionEntry(value)
    case "branch_summary":
      return isBranchSummaryEntry(value)
    case "custom":
      return isCustomEntry(value)
    case "custom_message":
      return isCustomMessageEntry(value)
    case "label":
      return isLabelEntry(value)
    case "session_info":
      return isSessionInfoEntry(value)
    default:
      return false
  }
}

function isUnknownTreeEntry(value: Record<string, unknown>): value is PiUnknownEntry {
  return hasBaseTreeFields(value) && !knownEntryTypes.has(value.type as PiKnownEntryType)
}

function isTreeEntry(value: Record<string, unknown>): value is PiTreeEntry {
  return hasBaseTreeFields(value) && (isKnownTreeEntry(value) || isUnknownTreeEntry(value))
}

export function parsePiEntries(lines: Iterable<unknown>): PiParsedSession {
  let header: PiSessionHeader | null = null
  const entries: PiTreeEntry[] = []

  for (const line of lines) {
    if (!isObject(line)) continue
    if (isHeader(line)) {
      header ??= line
      continue
    }
    if (isTreeEntry(line)) entries.push(line)
  }

  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const activeEntries: PiTreeEntry[] = []
  let orphanedEntryCount = 0
  let current = entries.at(-1)
  const seen = new Set<string>()

  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    activeEntries.unshift(current)
    if (current.parentId == null) break
    const parent = byId.get(current.parentId)
    if (!parent) {
      orphanedEntryCount++
      break
    }
    current = parent
  }

  return {
    header,
    entries,
    activeEntries,
    hiddenBranchEntryCount: Math.max(0, entries.length - activeEntries.length),
    orphanedEntryCount,
  }
}
