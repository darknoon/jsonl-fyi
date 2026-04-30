import type { Entry, MessageEntry, TurnDurationEntry } from "../types"
import { extractClaudeTurnUsage, type TurnUsage } from "./usage"

export type FormatChatStartOptions = {
  now?: Date
  locale?: string | string[]
  timeZone?: string
}

export function formatChatStart(
  isoTimestamp: string,
  opts: FormatChatStartOptions = {},
): string {
  const date = new Date(isoTimestamp)
  const now = opts.now ?? new Date()
  const locale = opts.locale
  const timeZone = opts.timeZone

  const time = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  })
    .format(date)
    .replace(/ /g, " ")

  const days = calendarDayDelta(date, now, timeZone)

  if (days === 0) return `Today, ${time}`
  if (days === 1) return `Yesterday, ${time}`
  if (days >= 2 && days <= 6) {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone }).format(date)
    return `${weekday}, ${time}`
  }

  const sameYear = sameCalendarYear(date, now, timeZone)
  const dateLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    timeZone,
  }).format(date)
  return `${dateLabel}, ${time}`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const totalSeconds = Math.floor(ms / 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}m ${s}s`
}

export type RenderItem =
  | { kind: "header"; chatStartIso: string }
  | { kind: "entry"; entry: MessageEntry }
  | {
      kind: "separator"
      afterUuid: string
      durationMs: number
      usage: TurnUsage | null
    }

export function buildTranscriptItems(entries: Entry[]): RenderItem[] {
  if (entries.length === 0) return []

  // Pass 1: index turn durations from system rows by the assistant uuid they
  // reference (parentUuid).
  const durations = new Map<string, number>()
  for (const entry of entries) {
    if (entry.type === "system" && entry.subtype === "turn_duration") {
      const td = entry as TurnDurationEntry
      if (td.parentUuid && typeof td.durationMs === "number") {
        durations.set(td.parentUuid, td.durationMs)
      }
    }
  }

  // Pass 2: emit items in source order, with header at the top and a separator
  // after each assistant entry whose uuid has a duration.
  const items: RenderItem[] = []
  const startTimestamp = entries.find(e => e.timestamp)?.timestamp
  if (startTimestamp) {
    items.push({ kind: "header", chatStartIso: startTimestamp })
  }

  for (const entry of entries) {
    if (entry.type === "system") continue
    if (entry.isSidechain) continue
    if (entry.type !== "user" && entry.type !== "assistant") continue
    items.push({ kind: "entry", entry })
    if (entry.type === "assistant" && entry.uuid) {
      const ms = durations.get(entry.uuid)
      if (ms != null) {
        items.push({
          kind: "separator",
          afterUuid: entry.uuid,
          durationMs: ms,
          usage: extractClaudeTurnUsage(entry),
        })
      }
    }
  }

  return items
}

function calendarDayDelta(date: Date, now: Date, timeZone?: string): number {
  const a = ymdInZone(now, timeZone)
  const b = ymdInZone(date, timeZone)
  return daysBetween(b, a) // a - b in days; positive if date is in the past
}

function sameCalendarYear(date: Date, now: Date, timeZone?: string): boolean {
  return ymdInZone(date, timeZone).y === ymdInZone(now, timeZone).y
}

type Ymd = { y: number; m: number; d: number }

function ymdInZone(date: Date, timeZone?: string): Ymd {
  // Use Intl to get year/month/day in the target zone reliably.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value)
  return { y: get("year"), m: get("month"), d: get("day") }
}

function daysBetween(from: Ymd, to: Ymd): number {
  const a = Date.UTC(from.y, from.m - 1, from.d)
  const b = Date.UTC(to.y, to.m - 1, to.d)
  return Math.round((b - a) / 86_400_000)
}
