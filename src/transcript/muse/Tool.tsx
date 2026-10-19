import type { Category } from "../groupSummary"
import { CopyButton } from "../CopyButton"
import { ImageBlock } from "../ImageBlock"
import { MoreHint } from "../MoreHint"
import { headLines, tailLines } from "../preview"
import { assertExhaustive, Field, Header, Output, ToolTitle } from "../shared"
import { ToolCard } from "../ToolCard"
import type { MuseToolEntry } from "./types"

const CATEGORIES: Partial<Record<string, Category>> = {
  bash: "command",
  bash_input: "command",
  read_file: "read",
  edit_file: "edit",
  write_file: "create",
  search: "search",
  read_skill: "skill",
  write_todos: "todo",
}

export function museToolCategory(entry: MuseToolEntry): Category | undefined {
  return Object.hasOwn(CATEGORIES, entry.name) ? CATEGORIES[entry.name] : undefined
}

export function museToolHasImages(entry: MuseToolEntry): boolean {
  return (entry.images?.length ?? 0) > 0
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function inputDetail(input: unknown): string | undefined {
  const fields = objectValue(input)
  if (!fields) return undefined
  for (const key of ["command", "path", "file_path", "target_file"]) {
    const value = fields[key]
    if (typeof value === "string" && value.trim()) return value
  }
  return undefined
}

function valueText(value: unknown): string {
  return typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? String(value))
}

/** A textual image reference does not supply image bytes; never fetch its path. */
export function museImagePath(entry: MuseToolEntry): string | undefined {
  return /^Read image file `([^`]+)` as model-visible image output\b/.exec(entry.output)?.[1]
}

// A shell envelope contributes one text output and its remaining recorded fields.
function shellResult(output: string): Record<string, unknown> | undefined {
  try {
    const result = objectValue(JSON.parse(output))
    if (typeof result?.output === "string") return result
  } catch {
    // Plain text shell results are valid too.
  }
  return undefined
}

export function MuseTool({ entry }: { entry: MuseToolEntry }) {
  const {
    kind,
    id,
    taskId,
    callId,
    name,
    input,
    images = [],
    output,
    status: outcome,
    reason,
    command,
    description,
    editFacts,
    outputRefs,
    durationMs,
    timestamp,
    ...rest
  } = entry
  assertExhaustive(rest)
  // These remain on the parsed entry; tool cards show arguments and results.
  void kind
  void id
  void taskId
  void callId
  void durationMs
  void timestamp
  const shell = name === "bash" || name === "bash_input"
  const result = shell ? shellResult(output) : undefined
  const text = result ? (result.output as string) : output
  const preview = shell ? tailLines(text, 3) : headLines(text, 3)
  const hasImages = museToolHasImages(entry)
  const imageBlocks = images.map((image, index) => (
    <ImageBlock
      key={index}
      source={{ type: "base64", media_type: image.mediaType, data: image.data }}
    />
  ))
  const status =
    outcome === "success"
      ? "success"
      : outcome === "error" || outcome === "rejected"
        ? "error"
        : undefined
  const fields: Array<[string, string]> = []
  const args = objectValue(input)
  const commandText = shell && typeof args?.command === "string" ? args.command : undefined
  const fileContent =
    name === "write_file" && typeof args?.content === "string" ? args.content : undefined
  if (args) {
    for (const [key, value] of Object.entries(args)) {
      if (key === "command" && commandText !== undefined) continue
      if (key === "content" && fileContent !== undefined) continue
      fields.push([key, valueText(value)])
    }
  } else if (input !== undefined) {
    fields.push(["Arguments", valueText(input)])
  }
  if (result) {
    for (const [key, value] of Object.entries(result)) {
      if (key === "output") continue
      if (
        args &&
        Object.hasOwn(args, key) &&
        typeof args[key] === typeof value &&
        valueText(args[key]) === valueText(value)
      )
        continue
      const echoedArgument = [
        "command",
        "description",
        "path",
        "file_path",
        "target_file",
        "content",
      ].includes(key)
      fields.push([
        echoedArgument || (args && Object.hasOwn(args, key)) ? `result.${key}` : key,
        valueText(value),
      ])
    }
  }
  if (
    command != null &&
    command !== args?.command &&
    !(result && Object.hasOwn(result, "command"))
  ) {
    fields.push(["result.command", command])
  }
  if (
    description != null &&
    description !== args?.description &&
    !(result && Object.hasOwn(result, "description"))
  ) {
    fields.push(["result.description", description])
  }
  if (outcome === "cancelled" || outcome === "rejected" || outcome === "running") {
    fields.push(["Status", outcome])
  }
  if (reason) fields.push(["Reason", reason])
  if (editFacts) fields.push(["Edit details", valueText(editFacts)])
  if (outputRefs && outputRefs.length > 0) {
    fields.push(["Output references", valueText(outputRefs)])
  }
  return (
    <ToolCard.Root
      status={status}
      hasContent={
        commandText !== undefined ||
        fileContent !== undefined ||
        fields.length > 0 ||
        !!text ||
        hasImages
      }
    >
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name={name} detail={inputDetail(input)} />
        </Header>
      </ToolCard.Trigger>
      {(text || hasImages) && (
        <ToolCard.Preview clickable={!hasImages}>
          {preview.text && (
            <>
              <pre className={`tool-preview-snippet${status === "error" ? " snippet-error" : ""}`}>
                {preview.text}
              </pre>
              <MoreHint count={preview.remaining} />
            </>
          )}
          {imageBlocks}
        </ToolCard.Preview>
      )}
      <ToolCard.Content>
        {commandText !== undefined && (
          <pre className="output cmd copy-host">
            {commandText}
            <CopyButton text={commandText} ariaLabel="Copy command" />
          </pre>
        )}
        {fields.length > 0 && (
          <dl className="tool-fields">
            {fields.map(([name, value], index) => (
              <Field key={index} name={name} value={value} />
            ))}
          </dl>
        )}
        {fileContent !== undefined && (
          <pre className="output copy-host">
            {fileContent}
            <CopyButton text={fileContent} ariaLabel="Copy content" />
          </pre>
        )}
        <Output output={{ content: [{ type: "text", text }], isError: status === "error" }} />
        {imageBlocks}
      </ToolCard.Content>
    </ToolCard.Root>
  )
}
