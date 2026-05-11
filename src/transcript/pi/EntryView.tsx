import type { ReactNode } from "react"
import type { ToolResult } from "../../types"
import { ImageBlock } from "../ImageBlock"
import { ThinkingBlock } from "../ThinkingBlock"
import { ToolCard } from "../ToolCard"
import { Header, ToolTitle } from "../shared"
import { TextBlock } from "../claude/TextBlock"
import { PiTool } from "./Tool"
import type { PiContent, PiMessageEntry, PiTreeEntry } from "./types"
import { piImageToSource } from "./types"

const EMPTY_RESULT: ToolResult = { content: [], isError: false }
type PiResultWithDetails = ToolResult & { details?: unknown }

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function UnknownEntry({ entry }: { entry: PiTreeEntry }) {
  return (
    <ToolCard.Root hasContent>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name={entry.type} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        <pre className="output">{stringify(entry)}</pre>
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function UnknownContent({ block }: { block: unknown }) {
  return (
    <ToolCard.Root hasContent>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="unknown content block" />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        <pre className="output">{stringify(block)}</pre>
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function renderContentBlock(
  block: PiContent,
  index: number,
  role: string,
  results: Map<string, PiResultWithDetails>,
): ReactNode {
  if (block.type === "text") return <TextBlock key={index} role={role} text={block.text} />
  if (block.type === "thinking") return <ThinkingBlock key={index} text={block.thinking} />
  if (block.type === "image") {
    return <ImageBlock key={index} role={role} source={piImageToSource(block)} />
  }
  if (block.type === "toolCall") {
    const result = results.get(block.id)
    return <PiTool key={index} call={block} output={result ?? EMPTY_RESULT} details={result?.details} />
  }
  return <UnknownContent key={index} block={block} />
}

function renderMessageContent(
  content: string | PiContent[],
  role: string,
  results: Map<string, PiResultWithDetails>,
  skip?: Set<number>,
) {
  if (typeof content === "string") return <TextBlock role={role} text={content} />
  return (
    <>
      {content.map((block, i) =>
        skip?.has(i) ? null : renderContentBlock(block, i, role, results),
      )}
    </>
  )
}

function MessageEntryView({
  entry,
  results,
  skipBlocks,
}: {
  entry: PiMessageEntry
  results: Map<string, PiResultWithDetails>
  skipBlocks?: Map<string, Set<number>>
}) {
  const { message } = entry
  if (message.role === "toolResult") return null

  const skip = skipBlocks?.get(entry.id)

  if (message.role === "user") {
    return renderMessageContent(message.content, "user", results)
  }

  if (message.role === "assistant") {
    return renderMessageContent(message.content, "assistant", results, skip)
  }

  if (message.role === "bashExecution") {
    return <TextBlock role="assistant" text={`$ ${message.command}\n${message.output}`} />
  }

  if (message.role === "custom") {
    if (!message.display) return null
    return renderMessageContent(message.content, "assistant", results)
  }

  if (message.role === "branchSummary") return <TextBlock role="assistant" text={message.summary} />
  if (message.role === "compactionSummary") return <TextBlock role="assistant" text={message.summary} />

  return <UnknownEntry entry={entry} />
}

export function PiEntryView({
  entry,
  results,
  skipBlocks,
}: {
  entry: PiTreeEntry
  results: Map<string, PiResultWithDetails>
  skipBlocks?: Map<string, Set<number>>
}) {
  if (entry.type === "message") return <MessageEntryView entry={entry} results={results} skipBlocks={skipBlocks} />
  if (entry.type === "model_change" || entry.type === "thinking_level_change") return null
  if (entry.type === "branch_summary") return <TextBlock role="assistant" text={entry.summary} />
  if (entry.type === "compaction") return <TextBlock role="assistant" text={entry.summary} />
  if (entry.type === "custom_message") {
    if (!entry.display) return null
    return renderMessageContent(entry.content, "assistant", results)
  }
  if (entry.type === "session_info") return null
  if (entry.type === "label" || entry.type === "custom") return null
  return <UnknownEntry entry={entry} />
}
