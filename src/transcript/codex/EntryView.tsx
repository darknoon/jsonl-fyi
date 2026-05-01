import type { ReactNode } from "react"
import type { CodexResponseItem } from "./types"
import { ThinkingBlock } from "../ThinkingBlock"
import { ImageBlock } from "../ImageBlock"
import { TextBlock } from "../claude/TextBlock"
import { CodexFunctionCall, CodexCustomToolCall, WebSearchCall } from "./Tool"
import type { ToolResult } from "../../types"

const EMPTY_RESULT: ToolResult = { text: "", images: [], toolRefs: [], isError: false }

type Props = {
  entry: CodexResponseItem
  results: Map<string, ToolResult>
  agentNicknames?: Map<string, string>
}

export function EntryView({ entry, results, agentNicknames }: Props) {
  const p = entry.payload

  switch (p.type) {
    case "message": {
      // Drop harness-injected messages entirely:
      //   - `developer` / `system` roles carry permissions instructions and tool
      //     specs the model received; not user-authored.
      //   - `user` role messages whose first text block opens with
      //     <environment_context> are auto-injected per-turn context.
      if (p.role === "developer" || p.role === "system") return null
      const isEnvContext =
        p.role === "user" &&
        p.content[0]?.type === "input_text" &&
        p.content[0].text.startsWith("<environment_context>")
      if (isEnvContext) return null
      const role = p.role
      const nodes: ReactNode[] = []
      p.content.forEach((c, i) => {
        if (c.type === "input_text" || c.type === "output_text") {
          nodes.push(<TextBlock key={i} role={role} text={c.text} />)
        } else if (c.type === "input_image") {
          nodes.push(<ImageBlock key={i} source={{ type: "url", url: c.image_url }} role={role} />)
        }
      })
      return <>{nodes}</>
    }

    case "reasoning": {
      const text = p.summary.map((s) => s.text).join("\n\n")
      return text ? <ThinkingBlock text={text} /> : null
    }

    case "function_call": {
      const out = results.get(p.call_id) ?? EMPTY_RESULT
      return <CodexFunctionCall name={p.name} argumentsJson={p.arguments} output={out} agentNicknames={agentNicknames} />
    }

    case "custom_tool_call": {
      const out = results.get(p.call_id) ?? EMPTY_RESULT
      return <CodexCustomToolCall name={p.name} input={p.input} output={out} />
    }

    case "function_call_output":
    case "custom_tool_call_output":
      // Already attached to its call via the results map. Skip.
      return null

    case "web_search_call":
      return <WebSearchCall status={p.status} query={p.action?.query} queries={p.action?.queries} />

    case "ghost_snapshot":
      // Not rendered in v1 — see spec §13.
      return null

    default: {
      // Forward-compat: unknown response_item subtypes are silently dropped.
      const _exhaustive: never = p
      void _exhaustive
      return null
    }
  }
}
