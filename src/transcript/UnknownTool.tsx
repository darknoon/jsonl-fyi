import type { ToolResult } from "../types"
import { ToolCard } from "./ToolCard"
import { Header, Field, Output, Extras, ToolTitle, hasOutput } from "./shared"

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
  return (
    <ToolCard.Root hasContent={hasContent} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name={name} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Content>
        {keys.length > 0 && (
          <dl className="tool-fields">
            {keys.map(k => {
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
        <Output output={output} />
        <Extras output={output} />
      </ToolCard.Content>
    </ToolCard.Root>
  )
}
