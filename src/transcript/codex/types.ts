// Wire-shape types for OpenAI Codex rollout-*.jsonl files.
// See docs/codex-corpus-stats.md for prevalence and observed shapes.

export type CodexInputText = { type: "input_text"; text: string }
export type CodexOutputText = { type: "output_text"; text: string }
export type CodexInputImage = { type: "input_image"; image_url: string }
export type CodexContentItem = CodexInputText | CodexOutputText | CodexInputImage

export type CodexReasoningSummary = { type: "summary_text"; text: string }

export type CodexResponseItemPayload =
  | { type: "message"; role: "user" | "assistant"; content: CodexContentItem[] }
  | {
      type: "reasoning"
      summary: CodexReasoningSummary[]
      content?: unknown
      encrypted_content?: string
    }
  | { type: "function_call"; name: string; arguments: string; call_id: string }
  | { type: "function_call_output"; call_id: string; output: string }
  | { type: "custom_tool_call"; name: string; input: string; call_id: string; status?: string }
  | { type: "custom_tool_call_output"; call_id: string; output: string }
  | { type: "ghost_snapshot"; ghost_commit: { id: string; parent: string } }
  | {
      type: "web_search_call"
      status?: string
      action?: { type: "search"; query?: string; queries?: string[] }
    }

export type CodexResponseItem = {
  type: "response_item"
  timestamp?: string
  payload: CodexResponseItemPayload
}

export type CodexSessionMeta = {
  type: "session_meta"
  payload: {
    id: string
    timestamp?: string
    cwd?: string
    originator?: string
    cli_version?: string
    source?: string
    model_provider?: string
    git?: { commit_hash?: string; branch?: string; repository_url?: string } | null
  }
}

export type CodexTurnContext = {
  type: "turn_context"
  payload: {
    cwd?: string
    model?: string
    effort?: string
    sandbox_policy?: unknown
    approval_policy?: string
    summary?: string
  }
}

export type CodexCompacted = {
  type: "compacted"
  payload: { message?: unknown; replacement_history?: unknown }
}

// `event_msg` lines exist in the wire format but we drop them — see spec §4.
export type CodexEventMsg = { type: "event_msg"; payload: unknown }

export type CodexEntry =
  | CodexSessionMeta
  | CodexTurnContext
  | CodexResponseItem
  | CodexCompacted
