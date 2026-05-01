import type { ToolResult } from "../types"
import { ToolCard } from "./ToolCard"
import { Header, Field, Extras, ToolTitle, hasOutput } from "./shared"
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
  const head = output.text ? headLines(output.text, 3) : null
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name={name} />
        </Header>
      </ToolCard.Trigger>
      {head && (
        <ToolCard.Preview>
          <div className="tool-preview-prose">{head.text}</div>
          <MoreHint count={head.remaining} />
        </ToolCard.Preview>
      )}
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
        {output.text && <div className="tool-output-prose">{output.text}</div>}
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}
