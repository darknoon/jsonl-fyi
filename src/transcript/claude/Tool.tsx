import type { ReactNode } from "react"
import type { ToolResult } from "../../types"
import { isKnownToolUse } from "./toolTypes"
import type {
  ToolUse,
  BashInput,
  ReadInput,
  EditInput,
  MultiEditInput,
  WriteInput,
  GlobInput,
  GrepInput,
  WebFetchInput,
  WebSearchInput,
  AgentInput,
  TodoWriteInput,
  EnterPlanModeInput,
  ExitPlanModeInput,
  NotebookEditInput,
  ToolSearchInput,
  SkillInput,
} from "./toolTypes"
import { EditDiff } from "../EditDiff"
import { ToolCard } from "../ToolCard"
import { tailLines } from "../preview"
import { MoreHint } from "../MoreHint"
import { shortPath } from "./toolMeta"
import {
  assertExhaustive,
  Header,
  Field,
  Output,
  Extras,
  ToolTitle,
  hasOutput,
  type CardProps,
} from "../shared"
import { UnknownTool } from "../UnknownTool"
import { Markdown } from "../Markdown"

// ---------------------------------------------------------------------------
// Per-tool components — each destructures every input field; `assertExhaustive`
// guarantees no field is silently dropped if the input type grows.
// ---------------------------------------------------------------------------

function readSummary(text: string): string {
  if (!text) return "(no output)"
  const trimmed = text.endsWith("\n") ? text.slice(0, -1) : text
  const n = trimmed.split("\n").length
  return `Read ${n} ${n === 1 ? "line" : "lines"}`
}

function Bash({ input, output }: CardProps<BashInput>) {
  const { command, description, timeout, run_in_background, dangerouslyDisableSandbox, ...rest } =
    input
  assertExhaustive(rest)
  const hasContent =
    !!command ||
    !!description ||
    timeout != null ||
    run_in_background != null ||
    dangerouslyDisableSandbox != null ||
    hasOutput(output)
  const tailN = output.isError ? 10 : 3
  const tail = output.text ? tailLines(output.text, tailN) : null
  const snippetClass = output.isError
    ? "tool-preview-snippet snippet-error"
    : "tool-preview-snippet"
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="Bash" detail={command || "Done"} />
        </Header>
      </ToolCard.Trigger>
      {tail && (
        <ToolCard.Preview>
          <pre className={snippetClass}>{tail.text}</pre>
          <MoreHint count={tail.remaining} />
        </ToolCard.Preview>
      )}
      <ToolCard.Content>
        {command && <pre className="output cmd">{command}</pre>}
        {(description || timeout != null || run_in_background || dangerouslyDisableSandbox) && (
          <dl className="tool-fields">
            {description && <Field name="description" value={description} />}
            {timeout != null && <Field name="timeout" value={`${timeout}ms`} />}
            {run_in_background && <Field name="run_in_background" value="true" />}
            {dangerouslyDisableSandbox && <Field name="dangerouslyDisableSandbox" value="true" />}
          </dl>
        )}
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function Read({ input, output }: CardProps<ReadInput>) {
  const { file_path, offset, limit, pages, ...rest } = input
  assertExhaustive(rest)
  const hasContent = offset != null || limit != null || !!pages || hasOutput(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="Read" detail={file_path && shortPath(file_path)} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Preview>
        <div className="tool-preview-line">{readSummary(output.text)}</div>
      </ToolCard.Preview>
      <ToolCard.Content>
        {(offset != null || limit != null || pages) && (
          <dl className="tool-fields">
            {offset != null && <Field name="offset" value={offset} />}
            {limit != null && <Field name="limit" value={limit} />}
            {pages && <Field name="pages" value={pages} />}
          </dl>
        )}
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function Edit({ input, output }: CardProps<EditInput>) {
  const { file_path, old_string, new_string, replace_all, ...rest } = input
  assertExhaustive(rest)
  const hasDiff = !!old_string || !!new_string
  const hasContent = hasDiff || replace_all || hasOutput(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="Edit" detail={file_path && shortPath(file_path)} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {hasDiff && <EditDiff filePath={file_path} oldString={old_string} newString={new_string} />}
        {replace_all && (
          <dl className="tool-fields">
            <Field name="replace_all" value="true" />
          </dl>
        )}
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function MultiEdit({ input, output }: CardProps<MultiEditInput>) {
  const { file_path, edits, ...rest } = input
  assertExhaustive(rest)
  const hasContent = edits.length > 0 || hasOutput(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="MultiEdit" detail={file_path && shortPath(file_path)} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        <div className="multi-edit">
          {edits.map((e, i) => {
            const { old_string, new_string, replace_all, ...editRest } = e
            assertExhaustive(editRest)
            return (
              <div key={i} className="multi-edit-item">
                {replace_all && (
                  <div className="tool-field-inline">
                    <span className="tool-field-key">replace_all</span> true
                  </div>
                )}
                <EditDiff filePath={file_path} oldString={old_string} newString={new_string} />
              </div>
            )
          })}
        </div>
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function Write({ input, output }: CardProps<WriteInput>) {
  const { file_path, content, ...rest } = input
  assertExhaustive(rest)
  const hasContent = !!content || hasOutput(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="Write" detail={file_path && shortPath(file_path)} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {content && <pre className="output">{content}</pre>}
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function Glob({ input, output }: CardProps<GlobInput>) {
  const { pattern, path, ...rest } = input
  assertExhaustive(rest)
  const hasContent = !!path || hasOutput(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="Glob" detail={pattern && shortPath(pattern)} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {path && (
          <dl className="tool-fields">
            <Field name="path" value={path} />
          </dl>
        )}
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function Grep({ input, output }: CardProps<GrepInput>) {
  const {
    pattern,
    path,
    glob,
    type,
    output_mode,
    "-i": caseInsensitive,
    "-n": lineNumbers,
    "-A": after,
    "-B": before,
    "-C": context,
    head_limit,
    multiline,
    ...rest
  } = input
  assertExhaustive(rest)
  const opts: Array<[string, ReactNode]> = []
  if (path) opts.push(["path", path])
  if (glob) opts.push(["glob", glob])
  if (type) opts.push(["type", type])
  if (output_mode) opts.push(["output_mode", output_mode])
  if (caseInsensitive) opts.push(["-i", "true"])
  if (lineNumbers) opts.push(["-n", "true"])
  if (after != null) opts.push(["-A", after])
  if (before != null) opts.push(["-B", before])
  if (context != null) opts.push(["-C", context])
  if (head_limit != null) opts.push(["head_limit", head_limit])
  if (multiline) opts.push(["multiline", "true"])
  const hasContent = opts.length > 0 || hasOutput(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="Grep" detail={pattern && shortPath(pattern)} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {opts.length > 0 && (
          <dl className="tool-fields">
            {opts.map(([k, v]) => (
              <Field key={k} name={k} value={v} />
            ))}
          </dl>
        )}
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function WebFetch({ input, output }: CardProps<WebFetchInput>) {
  const { url, prompt, ...rest } = input
  assertExhaustive(rest)
  const hasContent = !!prompt || hasOutput(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="WebFetch" detail={url && shortPath(url)} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {prompt && (
          <dl className="tool-fields">
            <Field name="prompt" value={prompt} />
          </dl>
        )}
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function WebSearch({ input, output }: CardProps<WebSearchInput>) {
  const { query, allowed_domains, blocked_domains, ...rest } = input
  assertExhaustive(rest)
  const hasContent =
    (allowed_domains && allowed_domains.length > 0) ||
    (blocked_domains && blocked_domains.length > 0) ||
    hasOutput(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="WebSearch" detail={query && shortPath(query)} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {((allowed_domains && allowed_domains.length > 0) ||
          (blocked_domains && blocked_domains.length > 0)) && (
          <dl className="tool-fields">
            {allowed_domains && allowed_domains.length > 0 && (
              <Field name="allowed_domains" value={allowed_domains.join(", ")} />
            )}
            {blocked_domains && blocked_domains.length > 0 && (
              <Field name="blocked_domains" value={blocked_domains.join(", ")} />
            )}
          </dl>
        )}
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function Agent({ input, output, name }: CardProps<AgentInput> & { name: "Task" | "Agent" }) {
  const {
    description,
    prompt,
    subagent_type,
    model,
    mode,
    team_name,
    name: agentName,
    isolation,
    run_in_background,
    ...rest
  } = input
  assertExhaustive(rest)
  const opts: Array<[string, ReactNode]> = []
  if (subagent_type) opts.push(["subagent_type", subagent_type])
  if (model) opts.push(["model", model])
  if (mode) opts.push(["mode", mode])
  if (team_name) opts.push(["team_name", team_name])
  if (agentName) opts.push(["name", agentName])
  if (isolation) opts.push(["isolation", isolation])
  if (run_in_background) opts.push(["run_in_background", "true"])
  const hasContent = !!prompt || opts.length > 0 || hasOutput(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name={name} detail={description && shortPath(description)} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {prompt && <Markdown source={prompt} />}
        {opts.length > 0 && (
          <dl className="tool-fields">
            {opts.map(([k, v]) => (
              <Field key={k} name={k} value={v} />
            ))}
          </dl>
        )}
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function TodoWrite({ input, output }: CardProps<TodoWriteInput>) {
  const { todos, ...rest } = input
  assertExhaustive(rest)
  return (
    <ToolCard.Root
      hasContent={todos.length > 0 || hasOutput(output)}
      status={output.isError ? "error" : "success"}
    >
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="TodoWrite" />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        <ul className="todo-list">
          {todos.map((t, i) => {
            const { content, status, activeForm, ...todoRest } = t
            assertExhaustive(todoRest)
            return (
              <li key={i} className={`todo todo-${status}`}>
                <span className="todo-status">{status}</span>
                <span>
                  <Markdown source={status === "in_progress" ? activeForm : content} inline />
                </span>
              </li>
            )
          })}
        </ul>
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function EnterPlanMode({ input, output }: CardProps<EnterPlanModeInput>) {
  const rest: Record<string, never> = input
  assertExhaustive(rest)
  return (
    <ToolCard.Root hasContent={hasOutput(output)} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="EnterPlanMode" />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function ExitPlanMode({ input, output }: CardProps<ExitPlanModeInput>) {
  const { plan, ...rest } = input
  assertExhaustive(rest)
  const hasContent = !!plan || hasOutput(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="ExitPlanMode" />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {plan && <Markdown source={plan} />}
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function NotebookEdit({ input, output }: CardProps<NotebookEditInput>) {
  const { notebook_path, new_source, cell_id, cell_type, edit_mode, ...rest } = input
  assertExhaustive(rest)
  const opts: Array<[string, ReactNode]> = []
  if (cell_id) opts.push(["cell_id", cell_id])
  if (cell_type) opts.push(["cell_type", cell_type])
  if (edit_mode) opts.push(["edit_mode", edit_mode])
  const hasContent = !!new_source || opts.length > 0 || hasOutput(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="NotebookEdit" detail={notebook_path && shortPath(notebook_path)} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {new_source && <pre className="output">{new_source}</pre>}
        {opts.length > 0 && (
          <dl className="tool-fields">
            {opts.map(([k, v]) => (
              <Field key={k} name={k} value={v} />
            ))}
          </dl>
        )}
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function ToolSearch({ input, output }: CardProps<ToolSearchInput>) {
  const { query, max_results, ...rest } = input
  assertExhaustive(rest)
  const hasContent = max_results != null || hasOutput(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="ToolSearch" detail={query && shortPath(query)} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {max_results != null && (
          <dl className="tool-fields">
            <Field name="max_results" value={max_results} />
          </dl>
        )}
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

function Skill({ input, output }: CardProps<SkillInput>) {
  const { skill, args, ...rest } = input
  assertExhaustive(rest)
  const hasContent = !!args || !!output.injectedText || hasOutput(output)
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="Skill" detail={skill && shortPath(skill)} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {args && (
          <dl className="tool-fields">
            <Field name="args" value={args} />
          </dl>
        )}
        {output.injectedText && <pre className="output">{output.injectedText}</pre>}
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}

// ---------------------------------------------------------------------------
// Dispatcher component — exhaustive on KnownToolUse (TS errors on missing case).
// ---------------------------------------------------------------------------

export function Tool({ use, output }: { use: ToolUse; output: ToolResult }) {
  if (!isKnownToolUse(use)) {
    return <UnknownTool name={use.name} input={use.input} output={output} />
  }
  switch (use.name) {
    case "Bash":
      return <Bash input={use.input} output={output} />
    case "Read":
      return <Read input={use.input} output={output} />
    case "Edit":
      return <Edit input={use.input} output={output} />
    case "MultiEdit":
      return <MultiEdit input={use.input} output={output} />
    case "Write":
      return <Write input={use.input} output={output} />
    case "Glob":
      return <Glob input={use.input} output={output} />
    case "Grep":
      return <Grep input={use.input} output={output} />
    case "WebFetch":
      return <WebFetch input={use.input} output={output} />
    case "WebSearch":
      return <WebSearch input={use.input} output={output} />
    case "Task":
    case "Agent":
      return <Agent name={use.name} input={use.input} output={output} />
    case "TodoWrite":
      return <TodoWrite input={use.input} output={output} />
    case "EnterPlanMode":
      return <EnterPlanMode input={use.input} output={output} />
    case "ExitPlanMode":
      return <ExitPlanMode input={use.input} output={output} />
    case "NotebookEdit":
      return <NotebookEdit input={use.input} output={output} />
    case "ToolSearch":
      return <ToolSearch input={use.input} output={output} />
    case "Skill":
      return <Skill input={use.input} output={output} />
  }
}
