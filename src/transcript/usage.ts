import type { MessageEntry } from "../types"
import type { CodexEventMsgTokenCount } from "./codex/types"

export type TurnUsage = {
  input: number
  output: number
  cacheRead: number
}

export function extractClaudeTurnUsage(entry: MessageEntry): TurnUsage | null {
  if (entry.type !== "assistant") return null
  const u = entry.message?.usage
  if (!u) return null
  return {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
  }
}

export function extractCodexTurnUsage(
  ev: CodexEventMsgTokenCount,
): TurnUsage | null {
  const last = ev.payload.info?.last_token_usage
  if (!last) return null
  const totalIn = last.input_tokens ?? 0
  const cached = last.cached_input_tokens ?? 0
  const fresh = Math.max(0, totalIn - cached)
  return {
    input: fresh,
    output: last.output_tokens ?? 0,
    cacheRead: cached,
  }
}

export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0"
  if (n < 1000) return String(Math.round(n))
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}
