import type { ReactNode } from "react"
import type { ToolResult } from "../../types"
import { ToolCard } from "../ToolCard"
import { Header, Field, Output, ToolTitle, hasOutput } from "../shared"
import { UnknownTool } from "../UnknownTool"
import { ImageBlock } from "../ImageBlock"
import { ApplyPatch } from "./ApplyPatch"
import { tailLines } from "../preview"
import { MoreHint } from "../MoreHint"

function shellTailPreview(output: ToolResult): {
  text: string
  remaining: number
  className: string
} | null {
  if (!output.text) return null
  const tailN = output.isError ? 10 : 3
  const tail = tailLines(output.text, tailN)
  const className = output.isError
    ? "tool-preview-snippet snippet-error"
    : "tool-preview-snippet"
  return { ...tail, className }
}

// Helper: extract exit code from a Codex shell-tool output. Used to derive
// `isError` for the tool result and (optionally) for header decoration.
export function extractExitCode(raw: string): number | null {
  const m = /^Exit code: (\d+)/m.exec(raw)
  return m ? Number(m[1]) : null
}

// ---------------------------------------------------------------------------
// Shell-family components
// ---------------------------------------------------------------------------

type ShellCommandInput = {
  command?: string
  workdir?: string
  timeout_ms?: number
  login?: boolean
  sandbox_permissions?: unknown
  justification?: string
}

function ShellCommand({ input, output }: { input: ShellCommandInput; output: ToolResult }) {
  const { command, workdir, timeout_ms, login, sandbox_permissions, justification } = input
  const fields: Array<[string, ReactNode]> = []
  if (workdir) fields.push(["workdir", workdir])
  if (timeout_ms != null) fields.push(["timeout_ms", `${timeout_ms}`])
  if (login != null) fields.push(["login", String(login)])
  if (sandbox_permissions) fields.push(["sandbox_permissions", JSON.stringify(sandbox_permissions)])
  if (justification) fields.push(["justification", justification])
  const hasContent = !!command || fields.length > 0 || hasOutput(output)
  const tail = shellTailPreview(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="shell_command" detail={command} />
        </Header>
      </ToolCard.Trigger>
      {tail && (
        <ToolCard.Preview>
          <pre className={tail.className}>{tail.text}</pre>
          <MoreHint count={tail.remaining} />
        </ToolCard.Preview>
      )}
      <ToolCard.Content>
        {command && <pre className="output cmd">{command}</pre>}
        {fields.length > 0 && (
          <dl className="tool-fields">
            {fields.map(([k, v]) => (
              <Field key={k} name={k} value={v} />
            ))}
          </dl>
        )}
        <Output output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

type ExecCommandInput = {
  cmd?: string
  workdir?: string
  tty?: boolean
  yield_time_ms?: number
  max_output_tokens?: number
  prefix_rule?: unknown
  sandbox_permissions?: unknown
  justification?: string
}

function ExecCommand({ input, output }: { input: ExecCommandInput; output: ToolResult }) {
  const {
    cmd,
    workdir,
    tty,
    yield_time_ms,
    max_output_tokens,
    prefix_rule,
    sandbox_permissions,
    justification,
  } = input
  const fields: Array<[string, ReactNode]> = []
  if (workdir) fields.push(["workdir", workdir])
  if (tty != null) fields.push(["tty", String(tty)])
  if (yield_time_ms != null) fields.push(["yield_time_ms", `${yield_time_ms}`])
  if (max_output_tokens != null) fields.push(["max_output_tokens", `${max_output_tokens}`])
  if (prefix_rule) fields.push(["prefix_rule", JSON.stringify(prefix_rule)])
  if (sandbox_permissions) fields.push(["sandbox_permissions", JSON.stringify(sandbox_permissions)])
  if (justification) fields.push(["justification", justification])
  const hasContent = !!cmd || fields.length > 0 || hasOutput(output)
  const tail = shellTailPreview(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="exec_command" detail={cmd} />
        </Header>
      </ToolCard.Trigger>
      {tail && (
        <ToolCard.Preview>
          <pre className={tail.className}>{tail.text}</pre>
          <MoreHint count={tail.remaining} />
        </ToolCard.Preview>
      )}
      <ToolCard.Content>
        {cmd && <pre className="output cmd">{cmd}</pre>}
        {fields.length > 0 && (
          <dl className="tool-fields">
            {fields.map(([k, v]) => (
              <Field key={k} name={k} value={v} />
            ))}
          </dl>
        )}
        <Output output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

type ShellInput = {
  command?: string[]
  workdir?: string
  timeout_ms?: number
  with_escalated_permissions?: boolean
  justification?: string
}

function Shell({ input, output }: { input: ShellInput; output: ToolResult }) {
  const { command, workdir, timeout_ms, with_escalated_permissions, justification } = input
  const joined = Array.isArray(command) ? command.join(" ") : ""
  const fields: Array<[string, ReactNode]> = []
  if (workdir) fields.push(["workdir", workdir])
  if (timeout_ms != null) fields.push(["timeout_ms", `${timeout_ms}`])
  if (with_escalated_permissions) fields.push(["with_escalated_permissions", "true"])
  if (justification) fields.push(["justification", justification])
  const hasContent = !!joined || fields.length > 0 || hasOutput(output)
  const tail = shellTailPreview(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="shell" detail={joined} />
        </Header>
      </ToolCard.Trigger>
      {tail && (
        <ToolCard.Preview>
          <pre className={tail.className}>{tail.text}</pre>
          <MoreHint count={tail.remaining} />
        </ToolCard.Preview>
      )}
      <ToolCard.Content>
        {joined && <pre className="output cmd">{joined}</pre>}
        {fields.length > 0 && (
          <dl className="tool-fields">
            {fields.map(([k, v]) => (
              <Field key={k} name={k} value={v} />
            ))}
          </dl>
        )}
        <Output output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

// ---------------------------------------------------------------------------
// UpdatePlan, ViewImage, WebSearchCall components
// ---------------------------------------------------------------------------

type UpdatePlanInput = {
  explanation?: string
  plan?: { step: string; status: "pending" | "in_progress" | "completed" }[]
}

function UpdatePlan({ input, output }: { input: UpdatePlanInput; output: ToolResult }) {
  const { explanation, plan } = input
  const hasContent = !!explanation || (plan && plan.length > 0) || hasOutput(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="update_plan" detail={explanation} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {plan && plan.length > 0 && (
          <ul className="todo-list">
            {plan.map((p, i) => (
              <li key={i} className={`todo todo-${p.status}`}>
                <span className="todo-status">{p.status}</span>
                <span>{p.step}</span>
              </li>
            ))}
          </ul>
        )}
        <Output output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

type ViewImageInput = { path?: string }

function ViewImage({ input, output }: { input: ViewImageInput; output: ToolResult }) {
  const { path } = input
  const basename = path ? path.split("/").pop() : ""
  // Output may contain [{"type":"input_image","image_url":"data:..."}].
  // If so, render the image inline. Otherwise render the raw output.
  const embeddedImage = tryParseEmbeddedImage(output.text)
  return (
    <ToolCard.Root hasContent={true} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="view_image" detail={basename} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Preview>
        {path && (
          <dl className="tool-fields">
            <Field name="path" value={path} />
          </dl>
        )}
        {embeddedImage ? <ImageBlock source={embeddedImage} /> : <Output output={output} />}
      </ToolCard.Preview>
    </ToolCard.Root>
  )
}

function tryParseEmbeddedImage(raw: string): { type: "url"; url: string } | null {
  if (!raw || !raw.startsWith("[")) return null
  try {
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return null
    for (const item of arr) {
      if (
        item &&
        typeof item === "object" &&
        (item as { type?: unknown }).type === "input_image" &&
        typeof (item as { image_url?: unknown }).image_url === "string"
      ) {
        return { type: "url", url: (item as { image_url: string }).image_url }
      }
    }
  } catch {
    /* not json — fall through */
  }
  return null
}

type WebSearchCallProps = {
  query?: string
  queries?: string[]
  status?: string
}

export function WebSearchCall({ query, queries, status }: WebSearchCallProps) {
  const extra = queries && queries.length > 1 ? queries.filter((q) => q !== query) : []
  const hasContent = extra.length > 0 || !!status
  return (
    <ToolCard.Root hasContent={hasContent} status="success">
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="web_search" detail={query} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {extra.length > 0 && (
          <dl className="tool-fields">
            {extra.map((q, i) => (
              <Field key={i} name={`query ${i + 1}`} value={q} />
            ))}
          </dl>
        )}
        {status && (
          <dl className="tool-fields">
            <Field name="status" value={status} />
          </dl>
        )}
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

// ---------------------------------------------------------------------------
// SpawnAgent, WaitAgent components
// ---------------------------------------------------------------------------

type SpawnAgentInput = {
  agent_type?: string
  fork_context?: boolean
  model?: string
  reasoning_effort?: string
  message?: string
}

function SpawnAgent({ input, output }: { input: SpawnAgentInput; output: ToolResult }) {
  const { agent_type, fork_context, model, reasoning_effort, message } = input
  const fields: Array<[string, ReactNode]> = []
  if (agent_type) fields.push(["agent_type", agent_type])
  if (model) fields.push(["model", model])
  if (reasoning_effort) fields.push(["reasoning_effort", reasoning_effort])
  if (fork_context != null) fields.push(["fork_context", String(fork_context)])
  // Output is JSON: {"agent_id":"...","nickname":"..."}; surface those fields.
  const meta = tryParseAgentSpawnOutput(output.text)
  if (meta.nickname) fields.push(["nickname", meta.nickname])
  if (meta.agentId) fields.push(["agent_id", meta.agentId])
  return (
    <ToolCard.Root hasContent={true} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="spawn_agent" detail={agent_type} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {message && <pre className="output">{message}</pre>}
        {fields.length > 0 && (
          <dl className="tool-fields">
            {fields.map(([k, v]) => (
              <Field key={k} name={k} value={v} />
            ))}
          </dl>
        )}
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function tryParseAgentSpawnOutput(raw: string): { nickname?: string; agentId?: string } {
  if (!raw || !raw.startsWith("{")) return {}
  try {
    const v = JSON.parse(raw) as { agent_id?: unknown; nickname?: unknown }
    return {
      nickname: typeof v.nickname === "string" ? v.nickname : undefined,
      agentId: typeof v.agent_id === "string" ? v.agent_id : undefined,
    }
  } catch {
    return {}
  }
}

type WaitAgentInput = { targets?: string[]; timeout_ms?: number }

function WaitAgent({ input, output }: { input: WaitAgentInput; output: ToolResult }) {
  const { targets, timeout_ms } = input
  const fields: Array<[string, ReactNode]> = []
  if (targets && targets.length > 0) fields.push(["targets", targets.join(", ")])
  if (timeout_ms != null) fields.push(["timeout_ms", `${timeout_ms}`])
  return (
    <ToolCard.Root hasContent={true} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="wait_agent" />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {fields.length > 0 && (
          <dl className="tool-fields">
            {fields.map(([k, v]) => (
              <Field key={k} name={k} value={v} />
            ))}
          </dl>
        )}
        <Output output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

// ---------------------------------------------------------------------------
// Dispatchers
// ---------------------------------------------------------------------------

export function CodexFunctionCall({
  name,
  argumentsJson,
  output,
}: {
  name: string
  argumentsJson: string
  output: ToolResult
}) {
  let parsed: Record<string, unknown> = {}
  try {
    const v = JSON.parse(argumentsJson)
    if (v && typeof v === "object") parsed = v as Record<string, unknown>
  } catch {
    parsed = { _raw: argumentsJson }
  }

  switch (name) {
    case "shell_command":
      return <ShellCommand input={parsed as ShellCommandInput} output={output} />
    case "exec_command":
      return <ExecCommand input={parsed as ExecCommandInput} output={output} />
    case "shell":
      return <Shell input={parsed as ShellInput} output={output} />
    case "update_plan":
      return <UpdatePlan input={parsed as UpdatePlanInput} output={output} />
    case "view_image":
      return <ViewImage input={parsed as ViewImageInput} output={output} />
    case "spawn_agent":
      return <SpawnAgent input={parsed as SpawnAgentInput} output={output} />
    case "wait_agent":
      return <WaitAgent input={parsed as WaitAgentInput} output={output} />
    default:
      return <UnknownTool name={name} input={parsed} output={output} />
  }
}

export function CodexCustomToolCall({
  name,
  input,
  output,
}: {
  name: string
  input: string
  output: ToolResult
}) {
  switch (name) {
    case "apply_patch":
      return <ApplyPatch patch={input} output={output} />
    default:
      return <UnknownTool name={name} input={{ _raw: input }} output={output} />
  }
}
