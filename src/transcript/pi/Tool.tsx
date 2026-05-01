import type { ReactNode } from "react"
import type { ToolResult } from "../../types"
import { MoreHint } from "../MoreHint"
import { headLines, tailLines } from "../preview"
import { ToolCard } from "../ToolCard"
import { UnknownTool } from "../UnknownTool"
import { Field, Header, ToolResultContent, ToolTitle, hasOutput, toolResultText } from "../shared"
import type { PiToolCallContent } from "./types"

function shortPath(path: string): string {
  const parts = path.split("/").filter(Boolean)
  return parts.at(-1) ?? path
}

function readSummary(text: string): string {
  if (!text) return "(no output)"
  const trimmed = text.endsWith("\n") ? text.slice(0, -1) : text
  const n = trimmed ? trimmed.split("\n").length : 0
  return `Read ${n} ${n === 1 ? "line" : "lines"}`
}

function objectDetails(details: unknown): Record<string, unknown> | null {
  return details && typeof details === "object" && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : null
}

function fieldValue(value: unknown): ReactNode {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2)
}

function hasImages(output: ToolResult): boolean {
  return output.content.some((item) => item.type === "image")
}

function ShellTool({ call, output }: { call: PiToolCallContent; output: ToolResult }) {
  const command = typeof call.arguments.command === "string" ? call.arguments.command : undefined
  const timeout = typeof call.arguments.timeout === "number" ? call.arguments.timeout : undefined
  const outputText = toolResultText(output)
  const tail = outputText ? tailLines(outputText, output.isError ? 10 : 3) : null
  const snippetClass = output.isError ? "tool-preview-snippet snippet-error" : "tool-preview-snippet"

  return (
    <ToolCard.Root
      hasContent={!!command || timeout != null || hasOutput(output)}
      status={output.isError ? "error" : "success"}
    >
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="bash" detail={command} />
        </Header>
      </ToolCard.Trigger>
      {hasImages(output) ? (
        <ToolCard.Preview>
          <ToolResultContent output={output} />
        </ToolCard.Preview>
      ) : tail ? (
        <ToolCard.Preview>
          <pre className={snippetClass}>{tail.text}</pre>
          <MoreHint count={tail.remaining} />
        </ToolCard.Preview>
      ) : null}
      <ToolCard.Content>
        {command && <pre className="output cmd">{command}</pre>}
        {timeout != null && (
          <dl className="tool-fields">
            <Field name="timeout" value={`${timeout}s`} />
          </dl>
        )}
        <ToolResultContent output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function ReadTool({ call, output }: { call: PiToolCallContent; output: ToolResult }) {
  const path = typeof call.arguments.path === "string" ? call.arguments.path : undefined
  const offset = typeof call.arguments.offset === "number" ? call.arguments.offset : undefined
  const limit = typeof call.arguments.limit === "number" ? call.arguments.limit : undefined

  return (
    <ToolCard.Root
      hasContent={offset != null || limit != null || hasOutput(output)}
      status={output.isError ? "error" : "success"}
    >
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="read" detail={path && shortPath(path)} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Preview>
        {hasImages(output) ? (
          <ToolResultContent output={output} />
        ) : (
          <div className="tool-preview-line">{readSummary(toolResultText(output))}</div>
        )}
      </ToolCard.Preview>
      <ToolCard.Content>
        {(offset != null || limit != null) && (
          <dl className="tool-fields">
            {offset != null && <Field name="offset" value={offset} />}
            {limit != null && <Field name="limit" value={limit} />}
          </dl>
        )}
        <ToolResultContent output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function GenericFileTool({ call, output }: { call: PiToolCallContent; output: ToolResult }) {
  const path = typeof call.arguments.path === "string" ? call.arguments.path : undefined
  const outputText = toolResultText(output)
  const head = outputText ? headLines(outputText, 3) : null
  const keys = Object.keys(call.arguments)

  return (
    <ToolCard.Root
      hasContent={keys.length > 0 || hasOutput(output)}
      status={output.isError ? "error" : "success"}
    >
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name={call.name} detail={path && shortPath(path)} />
        </Header>
      </ToolCard.Trigger>
      {hasImages(output) ? (
        <ToolCard.Preview>
          <ToolResultContent output={output} />
        </ToolCard.Preview>
      ) : head ? (
        <ToolCard.Preview>
          <pre className="tool-preview-snippet">{head.text}</pre>
          <MoreHint count={head.remaining} />
        </ToolCard.Preview>
      ) : null}
      <ToolCard.Content>
        {keys.length > 0 && (
          <dl className="tool-fields">
            {Object.entries(call.arguments).map(([key, value]) => (
              <Field key={key} name={key} value={fieldValue(value)} />
            ))}
          </dl>
        )}
        <ToolResultContent output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function PlanTrackerTool({
  call,
  output,
  details,
}: {
  call: PiToolCallContent
  output: ToolResult
  details?: unknown
}) {
  const d = objectDetails(details)
  const tasks = Array.isArray(d?.tasks) ? d.tasks : []
  const done = tasks.filter((task) => objectDetails(task)?.status === "complete").length
  const total = tasks.length
  const action = typeof call.arguments.action === "string" ? call.arguments.action : "plan_tracker"

  return (
    <ToolCard.Root
      hasContent={Object.keys(call.arguments).length > 0 || total > 0 || hasOutput(output)}
      status={output.isError ? "error" : "success"}
    >
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="plan_tracker" detail={action} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Preview>
        <div className="tool-preview-line">{done} / {total} complete</div>
      </ToolCard.Preview>
      <ToolCard.Content>
        {total > 0 && (
          <ul className="todo-list">
            {tasks.map((task, i) => {
              const t = objectDetails(task)
              const name = typeof t?.name === "string" ? t.name : `Task ${i + 1}`
              const status = typeof t?.status === "string" ? t.status : "unknown"
              return (
                <li key={i} className={`todo todo-${status}`}>
                  <span className="todo-status">{status}</span>
                  <span>{name}</span>
                </li>
              )
            })}
          </ul>
        )}
        <ToolResultContent output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function SubagentTool({
  call,
  output,
  details,
}: {
  call: PiToolCallContent
  output: ToolResult
  details?: unknown
}) {
  const d = objectDetails(details)
  const mode = typeof d?.mode === "string" ? d.mode : undefined
  const outputText = toolResultText(output)
  const head = outputText ? headLines(outputText, 3) : null
  const fields: Array<[string, ReactNode]> = []
  if (typeof call.arguments.agent === "string") fields.push(["agent", call.arguments.agent])
  if (typeof call.arguments.task === "string") fields.push(["task", call.arguments.task])
  if (mode) fields.push(["mode", mode])

  return (
    <ToolCard.Root
      hasContent={fields.length > 0 || hasOutput(output)}
      status={output.isError ? "error" : "success"}
    >
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="subagent" detail={mode ?? (call.arguments.agent as string | undefined)} />
        </Header>
      </ToolCard.Trigger>
      {hasImages(output) ? (
        <ToolCard.Preview>
          <ToolResultContent output={output} />
        </ToolCard.Preview>
      ) : head ? (
        <ToolCard.Preview>
          <div className="tool-preview-prose">{head.text}</div>
          <MoreHint count={head.remaining} />
        </ToolCard.Preview>
      ) : null}
      <ToolCard.Content>
        {fields.length > 0 && (
          <dl className="tool-fields">
            {fields.map(([key, value]) => (
              <Field key={key} name={key} value={value} />
            ))}
          </dl>
        )}
        <ToolResultContent output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

export function PiTool({
  call,
  output,
  details,
}: {
  call: PiToolCallContent
  output: ToolResult
  details?: unknown
}) {
  switch (call.name) {
    case "bash":
      return <ShellTool call={call} output={output} />
    case "read":
      return <ReadTool call={call} output={output} />
    case "write":
    case "edit":
    case "grep":
    case "find":
    case "ls":
      return <GenericFileTool call={call} output={output} />
    case "plan_tracker":
      return <PlanTrackerTool call={call} output={output} details={details} />
    case "subagent":
      return <SubagentTool call={call} output={output} details={details} />
    default:
      return <UnknownTool name={call.name} input={call.arguments} output={output} />
  }
}
