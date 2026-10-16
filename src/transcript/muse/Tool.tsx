import type { Category } from "../groupSummary"
import { ImageBlock } from "../ImageBlock"
import { MoreHint } from "../MoreHint"
import { headLines, tailLines } from "../preview"
import { assertExhaustive, Field, Header, ToolTitle } from "../shared"
import { formatDuration } from "../timing"
import { ToolCard } from "../ToolCard"
import type { MuseToolEntry, MuseToolStatus } from "./types"

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

const STATUS_LABEL: Record<MuseToolStatus, string> = {
  success: "Completed",
  error: "Failed",
  cancelled: "Cancelled",
  rejected: "Rejected",
  running: "Still running when recorded",
  unknown: "Outcome not recorded",
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

function ImagePlaceholder({ path }: { path: string }) {
  return (
    <div className="muse-image-placeholder">
      <span>Image not included in this log</span>
      <code>{path}</code>
    </div>
  )
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
  return (
    <ToolCard.Root status={status}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle
            name={name}
            detail={inputDetail(input) ?? description ?? command ?? editPath ?? imagePath}
          />
          {!hideTiming && durationMs != null && (
            <span className="muse-tool-duration">{formatDuration(durationMs)}</span>
          )}
          {outcome !== "success" && (
            <span className="muse-tool-status">{STATUS_LABEL[outcome]}</span>
          )}
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Preview clickable={!hasImages}>
        {imagePath && !hasImages ? (
          <ImagePlaceholder path={imagePath} />
        ) : (
          preview.text && (
            <>
              <pre className={`tool-preview-snippet${status === "error" ? " snippet-error" : ""}`}>
                {preview.text}
              </pre>
              <MoreHint count={preview.remaining} />
            </>
          )
        )}
        {imageBlocks}
        {reason && <div className="tool-preview-line">{reason}</div>}
        {!text && <div className="tool-preview-line">No result text recorded</div>}
      </ToolCard.Preview>
      <ToolCard.Content>
        {imagePath && !hasImages && <ImagePlaceholder path={imagePath} />}
        {input === undefined && (
          <p className="muse-result-note">
            Original tool arguments are not decoded for this call. See Source records for the
            complete recorded fields.
          </p>
        )}
        <dl className="tool-fields">
          {input !== undefined && <Field name="Arguments" value={valueText(input)} />}
          {command != null && <Field name="Command recorded in result" value={command} />}
          {description != null && (
            <Field name="Description recorded in result" value={description} />
          )}
          {editPath && <Field name="Path recorded in result" value={editPath} />}
          <Field name="Status" value={STATUS_LABEL[outcome]} />
          {reason && <Field name="Reason" value={reason} />}
          {!hideTiming && timestamp && <Field name="Recorded at" value={timestamp} />}
          {!hideTiming && durationMs != null && (
            <Field name="Duration" value={formatDuration(durationMs)} />
          )}
          {taskId && <Field name="Task ID" value={taskId} />}
          {callId && <Field name="Call ID" value={callId} />}
        </dl>
        {text ? (
          <pre className="output">{text}</pre>
        ) : (
          <p className="muse-result-note">No result text recorded</p>
        )}
        {imageBlocks}
        {text !== output && (
          <details className="muse-recorded-result">
            <summary>Full recorded result</summary>
            <pre className="output">{output}</pre>
          </details>
        )}
        {editFacts && (
          <details className="muse-recorded-result">
            <summary>Edit details</summary>
            <pre className="output">{JSON.stringify(editFacts, null, 2)}</pre>
          </details>
        )}
        {outputRefs && outputRefs.length > 0 && (
          <details className="muse-recorded-result">
            <summary>Output references</summary>
            <p className="muse-result-note">
              Referenced file contents are not embedded in this log.
            </p>
            <pre className="output">{JSON.stringify(outputRefs, null, 2)}</pre>
          </details>
        )}
      </ToolCard.Content>
    </ToolCard.Root>
  )
}
