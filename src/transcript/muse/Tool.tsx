import type { Category } from "../groupSummary"
import { ImageBlock } from "../ImageBlock"
import { MoreHint } from "../MoreHint"
import { headLines, tailLines } from "../preview"
import { assertExhaustive, Field, Header, Output, ToolTitle } from "../shared"
import { formatDuration } from "../timing"
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

function inputDetail(input: unknown): string | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined
  for (const key of ["command", "path", "file_path", "target_file"]) {
    const value = (input as Record<string, unknown>)[key]
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

// Shell output is embedded in a JSON result envelope. Show its output field for
// readability and retain the complete envelope in the expanded card.
function resultText(entry: MuseToolEntry): string {
  if (entry.name !== "bash" && entry.name !== "bash_input") return entry.output
  try {
    const result: unknown = JSON.parse(entry.output)
    if (
      result &&
      typeof result === "object" &&
      "output" in result &&
      typeof result.output === "string"
    ) {
      return result.output
    }
  } catch {
    // Plain text shell results are valid too.
  }
  return entry.output
}

export function MuseTool({
  entry,
  hideTiming = false,
}: {
  entry: MuseToolEntry
  hideTiming?: boolean
}) {
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
  // Internal display identity is consumed by the parent list, not source data.
  void kind
  void id
  const text = resultText(entry)
  const shell = name === "bash" || name === "bash_input"
  const preview = shell ? tailLines(text, 3) : headLines(text, 3)
  const imagePath = museImagePath(entry)
  const hasImages = museToolHasImages(entry)
  const imageBlocks = images.map((image, index) => (
    <ImageBlock
      key={index}
      source={{ type: "base64", media_type: image.mediaType, data: image.data }}
    />
  ))
  const editPath = typeof editFacts?.path === "string" ? editFacts.path : undefined
  const status =
    outcome === "success"
      ? "success"
      : outcome === "error" || outcome === "rejected"
        ? "error"
        : undefined
  const fields: Array<[string, string]> = []
  if (input !== undefined) fields.push(["Arguments", valueText(input)])
  if (command != null) fields.push(["Command recorded in result", command])
  if (description != null) fields.push(["Description recorded in result", description])
  if (editPath) fields.push(["Path recorded in result", editPath])
  if (outcome === "cancelled" || outcome === "rejected" || outcome === "running") {
    fields.push(["Status", outcome])
  }
  if (reason) fields.push(["Reason", reason])
  if (!hideTiming && timestamp) fields.push(["Recorded at", timestamp])
  if (!hideTiming && durationMs != null) fields.push(["Duration", formatDuration(durationMs)])
  if (taskId) fields.push(["Task ID", taskId])
  if (callId) fields.push(["Call ID", callId])
  if (text !== output) fields.push(["Full recorded result", output])
  if (editFacts) fields.push(["Edit details", valueText(editFacts)])
  if (outputRefs && outputRefs.length > 0) {
    fields.push(["Output references", valueText(outputRefs)])
  }
  return (
    <ToolCard.Root status={status} hasContent={fields.length > 0 || !!text || hasImages}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle
            name={name}
            detail={inputDetail(input) ?? description ?? command ?? editPath ?? imagePath}
          />
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
        {fields.length > 0 && (
          <dl className="tool-fields">
            {fields.map(([name, value]) => (
              <Field key={name} name={name} value={value} />
            ))}
          </dl>
        )}
        <Output output={{ content: [{ type: "text", text }], isError: status === "error" }} />
        {imageBlocks}
      </ToolCard.Content>
    </ToolCard.Root>
  )
}
