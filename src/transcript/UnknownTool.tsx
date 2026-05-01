import type { ToolResult } from "../types"
import { ToolCard } from "./ToolCard"
import { Header, Field, ToolResultContent, ToolTitle, hasOutput, toolResultText } from "./shared"
import { headLines } from "./preview"
import { MoreHint } from "./MoreHint"

// Unknown / MCP tool outputs are usually prose status messages
// ("Task #3 created successfully…"), not CLI output. Render as plain
// text rather than the code-styled `.output` block used by Bash and
// other shell-family tools.
export function UnknownTool({
  name,
  input,
  output,
}: {
  name: string
  input: Record<string, unknown>
  output: ToolResult
}) {
  const keys = Object.keys(input)
  const hasContent = keys.length > 0 || hasOutput(output)
  const text = toolResultText(output)
  const hasMixedContent = output.content.some((item) => item.type === "image")
  const head = !hasMixedContent && text ? headLines(text, 3) : null
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name={name} />
        </Header>
      </ToolCard.Trigger>
      {hasMixedContent ? (
        <ToolCard.Preview>
          {keys.length > 0 && <div className="tool-preview-line">{keys.join(", ")}</div>}
          <ToolResultContent output={output} />
        </ToolCard.Preview>
      ) : head ? (
        <ToolCard.Preview>
          {keys.length > 0 && <div className="tool-preview-line">{keys.join(", ")}</div>}
          <div className="tool-preview-prose">{head.text}</div>
          <MoreHint count={head.remaining} />
        </ToolCard.Preview>
      ) : keys.length > 0 ? (
        <ToolCard.Preview>
          <div className="tool-preview-line">{keys.join(", ")}</div>
        </ToolCard.Preview>
      ) : null}
      <ToolCard.Content>
        {keys.length > 0 && (
          <dl className="tool-fields">
            {keys.map((k) => {
              const v = input[k]
              return (
                <Field
                  key={k}
                  name={k}
                  value={typeof v === "string" ? v : JSON.stringify(v, null, 2)}
                />
              )
            })}
          </dl>
        )}
        <ToolResultContent output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}
