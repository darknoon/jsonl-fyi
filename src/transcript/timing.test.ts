import { test, expect } from "bun:test"
import { formatChatStart, formatDuration, buildTranscriptItems, type RenderItem } from "./timing"
import type { Entry } from "../types"

// Render the item list as a one-line-per-item string so inline snapshots stay
// readable and focused on what `buildTranscriptItems` actually decides
// (ordering, anchoring, filtering) rather than dumping entry payloads.
function summarize(items: RenderItem[]): string {
  return items
    .map((i) => {
      switch (i.kind) {
        case "header":
          return `header  ${i.chatStartIso}`
        case "entry":
          return `entry   ${i.entry.uuid}`
        case "separator":
          return `sep     after=${i.afterUuid} ${i.durationMs}ms`
      }
    })
    .join("\n")
}

// All `formatChatStart` tests force `en-US` and a fixed timezone so output is
// stable across machines. The function itself uses the runtime locale; the
// `locale` and `timeZone` arguments are test seams.

test("formatDuration: <1s shows ms", () => {
  expect(formatDuration(0)).toBe("0ms")
  expect(formatDuration(420)).toBe("420ms")
  expect(formatDuration(999)).toBe("999ms")
})

test("formatDuration: <60s shows seconds with one decimal", () => {
  expect(formatDuration(1000)).toBe("1.0s")
  expect(formatDuration(3400)).toBe("3.4s")
  expect(formatDuration(59_900)).toBe("59.9s")
})

test("formatDuration: ≥60s shows m s", () => {
  expect(formatDuration(60_000)).toBe("1m 0s")
  expect(formatDuration(83_000)).toBe("1m 23s")
  expect(formatDuration(3_600_000)).toBe("60m 0s")
})

test("formatChatStart: today renders 'Today, h:mm AM/PM'", () => {
  const now = new Date("2026-04-29T18:00:00Z")
  const ts = "2026-04-29T19:15:00Z" // same day in UTC; test uses UTC tz
  expect(formatChatStart(ts, { now, locale: "en-US", timeZone: "UTC" })).toBe("Today, 7:15 PM")
})

test("formatChatStart: yesterday", () => {
  const now = new Date("2026-04-29T12:00:00Z")
  const ts = "2026-04-28T14:15:00Z"
  expect(formatChatStart(ts, { now, locale: "en-US", timeZone: "UTC" })).toBe("Yesterday, 2:15 PM")
})

test("formatChatStart: within last 6 days uses weekday", () => {
  // 2026-04-24 is a Friday
  const now = new Date("2026-04-29T12:00:00Z")
  const ts = "2026-04-24T14:15:00Z"
  expect(formatChatStart(ts, { now, locale: "en-US", timeZone: "UTC" })).toBe("Friday, 2:15 PM")
})

test("formatChatStart: same year, more than 6 days ago, uses month + day", () => {
  const now = new Date("2026-04-29T12:00:00Z")
  const ts = "2026-02-16T14:15:00Z"
  expect(formatChatStart(ts, { now, locale: "en-US", timeZone: "UTC" })).toBe(
    "February 16, 2:15 PM",
  )
})

test("formatChatStart: prior years include the year", () => {
  const now = new Date("2026-04-29T12:00:00Z")
  const ts = "2024-04-16T14:15:00Z"
  expect(formatChatStart(ts, { now, locale: "en-US", timeZone: "UTC" })).toBe(
    "April 16, 2024, 2:15 PM",
  )
})

test("buildTranscriptItems: empty input → empty list", () => {
  expect(buildTranscriptItems([]).items).toEqual([])
  expect(buildTranscriptItems([]).models).toEqual([])
})

test("buildTranscriptItems: prefers system.turn_duration when present", () => {
  const entries: Entry[] = [
    {
      type: "user",
      uuid: "u1",
      timestamp: "2026-04-29T20:00:00Z",
      message: { role: "user", content: "hi" },
    },
    {
      type: "assistant",
      uuid: "a1",
      timestamp: "2026-04-29T20:00:05Z",
      message: { role: "assistant", content: [{ type: "text", text: "hello" }] },
    },
    {
      type: "system",
      subtype: "turn_duration",
      parentUuid: "a1",
      durationMs: 4321,
      timestamp: "2026-04-29T20:00:05.500Z",
    },
  ]
  expect(summarize(buildTranscriptItems(entries).items)).toMatchInlineSnapshot(`
    "header  2026-04-29T20:00:00Z
    entry   u1
    entry   a1
    sep     after=a1 4321ms"
  `)
})

test("buildTranscriptItems: assistant turn with no turn_duration row has no separator", () => {
  // No system row → no separator (we don't fall back to wall clock).
  const entries: Entry[] = [
    {
      type: "user",
      uuid: "u1",
      timestamp: "2026-04-29T20:00:00Z",
      message: { role: "user", content: "hi" },
    },
    {
      type: "assistant",
      uuid: "a1",
      timestamp: "2026-04-29T20:00:05Z",
      message: { role: "assistant", content: [{ type: "text", text: "hello" }] },
    },
  ]
  expect(summarize(buildTranscriptItems(entries).items)).toMatchInlineSnapshot(`
    "header  2026-04-29T20:00:00Z
    entry   u1
    entry   a1"
  `)
})

test("buildTranscriptItems: in-progress turn has no separator", () => {
  const entries: Entry[] = [
    {
      type: "user",
      uuid: "u1",
      timestamp: "2026-04-29T20:00:00Z",
      message: { role: "user", content: "hi" },
    },
    // no assistant entry yet
  ]
  expect(summarize(buildTranscriptItems(entries).items)).toMatchInlineSnapshot(`
    "header  2026-04-29T20:00:00Z
    entry   u1"
  `)
})

test("buildTranscriptItems: ignores sidechain entries", () => {
  const entries: Entry[] = [
    {
      type: "user",
      uuid: "u1",
      timestamp: "2026-04-29T20:00:00Z",
      message: { role: "user", content: "hi" },
    },
    {
      type: "assistant",
      uuid: "side",
      isSidechain: true,
      timestamp: "2026-04-29T20:00:02Z",
      message: { role: "assistant", content: [{ type: "text", text: "in subagent" }] },
    },
    {
      type: "assistant",
      uuid: "a1",
      timestamp: "2026-04-29T20:00:05Z",
      message: { role: "assistant", content: [{ type: "text", text: "main reply" }] },
    },
    {
      type: "system",
      subtype: "turn_duration",
      parentUuid: "a1",
      durationMs: 5000,
      timestamp: "2026-04-29T20:00:05.500Z",
    },
  ]
  expect(summarize(buildTranscriptItems(entries).items)).toMatchInlineSnapshot(`
    "header  2026-04-29T20:00:00Z
    entry   u1
    entry   a1
    sep     after=a1 5000ms"
  `)
})

test("buildTranscriptItems: attaches usage from the duration-anchor assistant row", () => {
  const entries: Entry[] = [
    {
      type: "assistant",
      uuid: "a1",
      timestamp: "2026-04-29T20:00:00.000Z",
      message: {
        role: "assistant",
        content: [],
        usage: {
          input_tokens: 6,
          cache_read_input_tokens: 28960,
          output_tokens: 165,
        },
      },
    },
    {
      type: "system",
      subtype: "turn_duration",
      durationMs: 1234,
      parentUuid: "a1",
    } as Entry,
  ]
  const { items } = buildTranscriptItems(entries)
  const sep = items.find((i) => i.kind === "separator")
  expect(sep).toBeDefined()
  if (sep?.kind !== "separator") throw new Error("expected separator")
  expect(sep.durationMs).toBe(1234)
  expect(sep.usage).toEqual({ input: 6, output: 165, cacheRead: 28960 })
})

test("buildTranscriptItems: separator usage is null when assistant entry has no usage", () => {
  const entries: Entry[] = [
    { type: "assistant", uuid: "a1", message: { role: "assistant", content: [] } },
    {
      type: "system",
      subtype: "turn_duration",
      durationMs: 500,
      parentUuid: "a1",
    } as Entry,
  ]
  const { items } = buildTranscriptItems(entries)
  const sep = items.find((i) => i.kind === "separator")
  if (sep?.kind !== "separator") throw new Error("expected separator")
  expect(sep.usage).toBeNull()
})

test("buildTranscriptItems: returns models list and items", () => {
  const entries: Entry[] = [
    {
      type: "assistant",
      uuid: "a1",
      message: { role: "assistant", content: [], model: "claude-opus-4-7" },
    },
    { type: "system", subtype: "turn_duration", durationMs: 100, parentUuid: "a1" } as Entry,
  ]
  const { items, models } = buildTranscriptItems(entries)
  expect(items.find((i) => i.kind === "separator")).toBeDefined()
  expect(models).toEqual([{ label: "Opus 4.7", raw: "claude-opus-4-7" }])
})

test("buildTranscriptItems: single-model session — separator carries no model", () => {
  const entries: Entry[] = [
    {
      type: "assistant",
      uuid: "a1",
      message: { role: "assistant", content: [], model: "claude-opus-4-7" },
    },
    { type: "system", subtype: "turn_duration", durationMs: 100, parentUuid: "a1" } as Entry,
  ]
  const { items } = buildTranscriptItems(entries)
  const sep = items.find((i) => i.kind === "separator")
  if (sep?.kind !== "separator") throw new Error("expected separator")
  expect(sep.model).toBeNull()
})

test("buildTranscriptItems: multi-model session — every separator carries its turn's model", () => {
  const entries: Entry[] = [
    {
      type: "assistant",
      uuid: "a1",
      message: { role: "assistant", content: [], model: "claude-opus-4-7" },
    },
    { type: "system", subtype: "turn_duration", durationMs: 100, parentUuid: "a1" } as Entry,
    {
      type: "assistant",
      uuid: "a2",
      message: { role: "assistant", content: [], model: "claude-sonnet-4-6" },
    },
    { type: "system", subtype: "turn_duration", durationMs: 200, parentUuid: "a2" } as Entry,
    {
      type: "assistant",
      uuid: "a3",
      message: { role: "assistant", content: [], model: "claude-opus-4-7" },
    },
    { type: "system", subtype: "turn_duration", durationMs: 300, parentUuid: "a3" } as Entry,
  ]
  const { items, models } = buildTranscriptItems(entries)
  expect(models).toEqual([
    { label: "Opus 4.7", raw: "claude-opus-4-7" },
    { label: "Sonnet 4.6", raw: "claude-sonnet-4-6" },
  ])
  const seps = items.filter((i) => i.kind === "separator")
  expect(seps).toHaveLength(3)
  expect(seps[0].kind === "separator" && seps[0].model?.raw).toBe("claude-opus-4-7")
  expect(seps[1].kind === "separator" && seps[1].model?.raw).toBe("claude-sonnet-4-6")
  expect(seps[2].kind === "separator" && seps[2].model?.raw).toBe("claude-opus-4-7")
})

test("buildTranscriptItems: synthetic model rows excluded from discovery and per-turn labels", () => {
  const entries: Entry[] = [
    {
      type: "assistant",
      uuid: "a1",
      message: { role: "assistant", content: [], model: "claude-opus-4-7" },
    },
    { type: "system", subtype: "turn_duration", durationMs: 100, parentUuid: "a1" } as Entry,
    {
      type: "assistant",
      uuid: "syn",
      message: { role: "assistant", content: [], model: "<synthetic>" },
    },
    { type: "system", subtype: "turn_duration", durationMs: 50, parentUuid: "syn" } as Entry,
    {
      type: "assistant",
      uuid: "a2",
      message: { role: "assistant", content: [], model: "claude-sonnet-4-6" },
    },
    { type: "system", subtype: "turn_duration", durationMs: 100, parentUuid: "a2" } as Entry,
  ]
  const { items, models } = buildTranscriptItems(entries)
  expect(models.map((m) => m.raw)).toEqual(["claude-opus-4-7", "claude-sonnet-4-6"])
  const synSep = items.find(
    (i) => i.kind === "separator" && i.afterUuid === "syn",
  )
  if (synSep?.kind !== "separator") throw new Error("expected synthetic separator")
  expect(synSep.model).toBeNull()
})
