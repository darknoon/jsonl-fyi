export type GrokOutputPart =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "url"; url: string } }

export type GrokEntry =
  | {
      kind: "message"
      id: string
      role: "user" | "assistant" | "system" | "context" | "reasoning"
      text: string
      label?: string
      model?: string
    }
  | {
      kind: "tool"
      id: string
      name: string
      input: Record<string, unknown>
      output: { content: GrokOutputPart[]; isError: boolean }
      hasResult: boolean
      exitCode?: number
    }
  | { kind: "unknown"; id: string; label: string; raw: unknown }

export type GrokToolEntry = Extract<GrokEntry, { kind: "tool" }>

export interface GrokSession {
  entries: GrokEntry[]
  models: string[]
}
