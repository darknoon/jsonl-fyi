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
  // Treat cache-creation as input the model freshly processed this turn:
  // those tokens are billed and seen for the first time. `input_tokens`
  // alone is fresh-non-cached and collapses to ~1 on most turns, which
  // makes the inline arrow useless. Cache-read stays in its own slot.
  const fresh = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
  return {
    input: fresh,
    output: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
  }
}

export function extractCodexTurnUsage(ev: CodexEventMsgTokenCount): TurnUsage | null {
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
