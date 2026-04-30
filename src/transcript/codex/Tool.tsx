import type { ReactNode } from "react"
import type { ToolResult } from "../../types"
import { ToolCard } from "../ToolCard"
import { Header, Field, Output, ToolTitle, hasOutput } from "../shared"
import { UnknownTool } from "../UnknownTool"

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
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="shell_command" detail={command} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {command && <pre className="output cmd">{command}</pre>}
        {fields.length > 0 && (
          <dl className="tool-fields">
            {fields.map(([k, v]) => <Field key={k} name={k} value={v} />)}
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
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="exec_command" detail={cmd} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {cmd && <pre className="output cmd">{cmd}</pre>}
        {fields.length > 0 && (
          <dl className="tool-fields">
            {fields.map(([k, v]) => <Field key={k} name={k} value={v} />)}
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
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="shell" detail={joined} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {joined && <pre className="output cmd">{joined}</pre>}
        {fields.length > 0 && (
          <dl className="tool-fields">
            {fields.map(([k, v]) => <Field key={k} name={k} value={v} />)}
          </dl>
        )}
        <Output output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

// ---------------------------------------------------------------------------
// Dispatchers — Tasks 10–12 will add more cases.
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
  // Task 10 will add ApplyPatch handling. For now, fall through.
  return <UnknownTool name={name} input={{ _raw: input }} output={output} />
}
