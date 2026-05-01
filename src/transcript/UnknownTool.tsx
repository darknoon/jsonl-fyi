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
  previewInputKeys = false,
}: {
  name: string
  input: Record<string, unknown>
  output: ToolResult
  previewInputKeys?: boolean
}) {
  const keys = Object.keys(input)
  const hasContent = keys.length > 0 || hasOutput(output)
  const text = toolResultText(output)
  const hasMixedContent = output.content.some((item) => item.type === "image")
  const head = !hasMixedContent && text ? headLines(text, 3) : null
  const inputKeysPreview = previewInputKeys && keys.length > 0 ? keys.join(", ") : null
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name={name} />
        </Header>
      </ToolCard.Trigger>
      {hasMixedContent ? (
        <ToolCard.Preview>
          {inputKeysPreview && <div className="tool-preview-line">{inputKeysPreview}</div>}
          <ToolResultContent output={output} />
        </ToolCard.Preview>
      ) : head ? (
        <ToolCard.Preview>
          {inputKeysPreview && <div className="tool-preview-line">{inputKeysPreview}</div>}
          <div className="tool-preview-prose">{head.text}</div>
          <MoreHint count={head.remaining} />
        </ToolCard.Preview>
      ) : inputKeysPreview ? (
        <ToolCard.Preview>
          <div className="tool-preview-line">{inputKeysPreview}</div>
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
