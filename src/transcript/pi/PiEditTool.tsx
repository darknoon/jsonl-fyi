import type { ToolResult } from "../../types"
import { EditDiff } from "../EditDiff"
import { ToolCard } from "../ToolCard"
import { Header, ToolResultContent, ToolTitle, hasOutput } from "../shared"
import type { PiToolCallContent } from "./types"

type PiEdit = { oldText: string; newText: string }

function shortPath(path: string): string {
  const parts = path.split("/").filter(Boolean)
  return parts.at(-1) ?? path
}

export function parsePiEdits(
  args: Record<string, unknown>,
): { path: string; edits: PiEdit[] } | null {
  const path = typeof args.path === "string" ? args.path : null
  const rawEdits = Array.isArray(args.edits) ? args.edits : null
  if (!path || !rawEdits) return null
  const edits: PiEdit[] = []
  for (const e of rawEdits) {
    if (e && typeof e === "object") {
      const o = e as Record<string, unknown>
      const oldText = typeof o.oldText === "string" ? o.oldText : ""
      const newText = typeof o.newText === "string" ? o.newText : ""
      edits.push({ oldText, newText })
    }
  }
  return { path, edits }
}

export function PiEditTool({ call, output }: { call: PiToolCallContent; output: ToolResult }) {
  const parsed = parsePiEdits(call.arguments)
  if (!parsed) {
    return (
      <ToolCard.Root hasContent={hasOutput(output)} status={output.isError ? "error" : "success"}>
        <ToolCard.Trigger>
          <Header>
            <ToolTitle name="edit" />
          </Header>
        </ToolCard.Trigger>
        <ToolCard.Content>
          <ToolResultContent output={output} />
        </ToolCard.Content>
      </ToolCard.Root>
    )
  }

  const { path, edits } = parsed
  return (
    <ToolCard.Root hasContent status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="edit" detail={shortPath(path)} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Preview>
        {edits.map((ed, i) => (
          <EditDiff key={i} filePath={path} oldString={ed.oldText} newString={ed.newText} />
        ))}
      </ToolCard.Preview>
      <ToolCard.Content>
        {edits.map((ed, i) => (
          <EditDiff key={i} filePath={path} oldString={ed.oldText} newString={ed.newText} />
        ))}
        {hasOutput(output) && <ToolResultContent output={output} />}
      </ToolCard.Content>
    </ToolCard.Root>
  )
}
