import type { ReactNode } from "react"
import { EditDiff } from "../EditDiff"
import { ImageBlock } from "../ImageBlock"
import type { ToolDiff } from "../grouping"
import type { Category } from "../groupSummary"
import { MoreHint } from "../MoreHint"
import { headLines, tailLines } from "../preview"
import { ToolCard } from "../ToolCard"
import {
  assertExhaustive,
  Field,
  Header,
  ToolResultContent,
  ToolTitle,
  toolResultImages,
  toolResultText,
} from "../shared"
import type { GrokToolEntry } from "./types"

type ReadInput = { target_file: string; offset?: number; limit?: number }
type TerminalInput = { command: string; description?: string; block_until_ms?: number }
type EditInput = {
  file_path: string
  old_string: string
  new_string: string
  replace_all?: boolean
}
type WriteInput = { file_path: string; content: string }
type GrepInput = { pattern: string; glob?: string; head_limit?: number }
type ListInput = { target_directory: string }

type InputSchema = {
  required: Record<string, "string" | "number" | "boolean">
  optional?: Record<string, "string" | "number" | "boolean">
  category: Category
}

const SCHEMAS: Record<string, InputSchema> = {
  read_file: {
    required: { target_file: "string" },
    optional: { offset: "number", limit: "number" },
    category: "read",
  },
  run_terminal_command: {
    required: { command: "string" },
    optional: { description: "string", block_until_ms: "number" },
    category: "command",
  },
  search_replace: {
    required: { file_path: "string", old_string: "string", new_string: "string" },
    optional: { replace_all: "boolean" },
    category: "edit",
  },
  write: { required: { file_path: "string", content: "string" }, category: "create" },
  grep: {
    required: { pattern: "string" },
    optional: { glob: "string", head_limit: "number" },
    category: "search",
  },
  list_dir: { required: { target_directory: "string" }, category: "command" },
}

// Unknown fields and malformed arguments get the generic card, so they remain
// inspectable instead of being silently discarded by a specialized component.
export function grokToolCategory(entry: GrokToolEntry): Category | undefined {
  const schema = Object.hasOwn(SCHEMAS, entry.name) ? SCHEMAS[entry.name] : undefined
  if (!schema) return undefined
  const fields = { ...schema.required, ...schema.optional }
  if (Object.entries(schema.required).some(([key, type]) => typeof entry.input[key] !== type)) {
    return undefined
  }
  if (
    Object.entries(entry.input).some(
      ([key, value]) => !Object.hasOwn(fields, key) || typeof value !== fields[key],
    )
  ) {
    return undefined
  }
  return schema.category
}

export function grokToolDiffs(entry: GrokToolEntry): ToolDiff[] {
  if (entry.name !== "search_replace" || grokToolCategory(entry) !== "edit") return []
  const { file_path, old_string, new_string } = entry.input as EditInput
  return [{ kind: "edit", filePath: file_path, oldString: old_string, newString: new_string }]
}

export function grokToolHasImages(entry: GrokToolEntry): boolean {
  return entry.output.content.some((part) => part.type === "image")
}

function valueText(value: unknown): string {
  return typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? String(value))
}

function ResultPreview({ entry }: { entry: GrokToolEntry }) {
  const text = toolResultText(entry.output)
  const preview = entry.name === "run_terminal_command" ? tailLines(text, 3) : headLines(text, 3)
  const images = toolResultImages(entry.output)
  return (
    <>
      {text && (
        <>
          <pre className={`tool-preview-snippet${entry.output.isError ? " snippet-error" : ""}`}>
            {preview.text}
          </pre>
          <MoreHint count={preview.remaining} />
        </>
      )}
      {images.map((source, index) => (
        <ImageBlock key={index} source={source} />
      ))}
      {!entry.hasResult && <div className="tool-preview-line">No result recorded</div>}
    </>
  )
}

function Card({
  entry,
  detail,
  children,
  preview,
}: {
  entry: GrokToolEntry
  detail?: ReactNode
  children?: ReactNode
  preview?: ReactNode
}) {
  return (
    <ToolCard.Root
      status={entry.output.isError ? "error" : entry.exitCode === 0 ? "success" : undefined}
    >
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name={entry.name} detail={detail} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Preview clickable={!grokToolHasImages(entry)}>
        {preview}
        <ResultPreview entry={entry} />
      </ToolCard.Preview>
      <ToolCard.Content>
        {children}
        {!entry.hasResult && <div className="tool-preview-line">No result recorded</div>}
        <ToolResultContent output={entry.output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function ReadTool({ entry, input }: { entry: GrokToolEntry; input: ReadInput }) {
  const { target_file, offset, limit, ...rest } = input
  assertExhaustive(rest)
  return (
    <Card entry={entry} detail={target_file}>
      <dl className="tool-fields">
        <Field name="target_file" value={target_file} />
        {offset != null && <Field name="offset" value={offset} />}
        {limit != null && <Field name="limit" value={limit} />}
      </dl>
    </Card>
  )
}

function TerminalTool({ entry, input }: { entry: GrokToolEntry; input: TerminalInput }) {
  const { command, description, block_until_ms, ...rest } = input
  assertExhaustive(rest)
  return (
    <Card
      entry={entry}
      detail={command}
      preview={
        entry.exitCode != null && entry.exitCode !== 0 ? (
          <div className="tool-preview-line snippet-error">Exit code {entry.exitCode}</div>
        ) : undefined
      }
    >
      <pre className="output cmd">{command}</pre>
      <dl className="tool-fields">
        {description != null && <Field name="description" value={description} />}
        {block_until_ms != null && <Field name="block_until_ms" value={block_until_ms} />}
        {entry.exitCode != null && <Field name="exit code" value={entry.exitCode} />}
      </dl>
    </Card>
  )
}

function EditTool({ entry, input }: { entry: GrokToolEntry; input: EditInput }) {
  const { file_path, old_string, new_string, replace_all, ...rest } = input
  assertExhaustive(rest)
  const diff = <EditDiff filePath={file_path} oldString={old_string} newString={new_string} />
  return (
    <Card entry={entry} detail={file_path} preview={diff}>
      <dl className="tool-fields">
        <Field name="file_path" value={file_path} />
        {replace_all != null && <Field name="replace_all" value={String(replace_all)} />}
      </dl>
      {diff}
    </Card>
  )
}

function WriteTool({ entry, input }: { entry: GrokToolEntry; input: WriteInput }) {
  const { file_path, content, ...rest } = input
  assertExhaustive(rest)
  const preview = headLines(content, 3)
  return (
    <Card
      entry={entry}
      detail={file_path}
      preview={
        <>
          <pre className="tool-preview-snippet">{preview.text}</pre>
          <MoreHint count={preview.remaining} />
        </>
      }
    >
      <dl className="tool-fields">
        <Field name="file_path" value={file_path} />
      </dl>
      <pre className="output">{content}</pre>
    </Card>
  )
}

function GrepTool({ entry, input }: { entry: GrokToolEntry; input: GrepInput }) {
  const { pattern, glob, head_limit, ...rest } = input
  assertExhaustive(rest)
  return (
    <Card entry={entry} detail={pattern}>
      <dl className="tool-fields">
        <Field name="pattern" value={pattern} />
        {glob != null && <Field name="glob" value={glob} />}
        {head_limit != null && <Field name="head_limit" value={head_limit} />}
      </dl>
    </Card>
  )
}

function ListTool({ entry, input }: { entry: GrokToolEntry; input: ListInput }) {
  const { target_directory, ...rest } = input
  assertExhaustive(rest)
  return (
    <Card entry={entry} detail={target_directory}>
      <dl className="tool-fields">
        <Field name="target_directory" value={target_directory} />
      </dl>
    </Card>
  )
}

export function GrokTool({ entry }: { entry: GrokToolEntry }) {
  if (grokToolCategory(entry)) {
    switch (entry.name) {
      case "read_file":
        return <ReadTool entry={entry} input={entry.input as ReadInput} />
      case "run_terminal_command":
        return <TerminalTool entry={entry} input={entry.input as TerminalInput} />
      case "search_replace":
        return <EditTool entry={entry} input={entry.input as EditInput} />
      case "write":
        return <WriteTool entry={entry} input={entry.input as WriteInput} />
      case "grep":
        return <GrepTool entry={entry} input={entry.input as GrepInput} />
      case "list_dir":
        return <ListTool entry={entry} input={entry.input as ListInput} />
    }
  }
  return (
    <Card entry={entry} detail={Object.keys(entry.input).join(", ") || undefined}>
      <dl className="tool-fields">
        {Object.entries(entry.input).map(([key, value]) => (
          <Field key={key} name={key} value={valueText(value)} />
        ))}
      </dl>
    </Card>
  )
}
