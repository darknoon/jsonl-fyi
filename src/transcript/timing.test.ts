import { test, expect } from "bun:test"
import {
  formatChatStart,
  formatDuration,
  buildTranscriptItems,
  type RenderItem,
} from "./timing"
import type { Entry } from "../types"

// Render the item list as a one-line-per-item string so inline snapshots stay
// readable and focused on what `buildTranscriptItems` actually decides
// (ordering, anchoring, filtering) rather than dumping entry payloads.
function summarize(items: RenderItem[]): string {
  return items
    .map(i => {
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
  expect(
    formatChatStart(ts, { now, locale: "en-US", timeZone: "UTC" }),
  ).toBe("Today, 7:15 PM")
})

test("formatChatStart: yesterday", () => {
  const now = new Date("2026-04-29T12:00:00Z")
  const ts = "2026-04-28T14:15:00Z"
  expect(
    formatChatStart(ts, { now, locale: "en-US", timeZone: "UTC" }),
  ).toBe("Yesterday, 2:15 PM")
})

test("formatChatStart: within last 6 days uses weekday", () => {
  // 2026-04-24 is a Friday
  const now = new Date("2026-04-29T12:00:00Z")
  const ts = "2026-04-24T14:15:00Z"
  expect(
    formatChatStart(ts, { now, locale: "en-US", timeZone: "UTC" }),
  ).toBe("Friday, 2:15 PM")
})

test("formatChatStart: same year, more than 6 days ago, uses month + day", () => {
  const now = new Date("2026-04-29T12:00:00Z")
  const ts = "2026-02-16T14:15:00Z"
  expect(
    formatChatStart(ts, { now, locale: "en-US", timeZone: "UTC" }),
  ).toBe("February 16, 2:15 PM")
})

test("formatChatStart: prior years include the year", () => {
  const now = new Date("2026-04-29T12:00:00Z")
  const ts = "2024-04-16T14:15:00Z"
  expect(
    formatChatStart(ts, { now, locale: "en-US", timeZone: "UTC" }),
  ).toBe("April 16, 2024, 2:15 PM")
})

test("buildTranscriptItems: empty input → empty list", () => {
  expect(buildTranscriptItems([])).toEqual([])
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
  expect(summarize(buildTranscriptItems(entries))).toMatchInlineSnapshot(`
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
  expect(summarize(buildTranscriptItems(entries))).toMatchInlineSnapshot(`
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
  expect(summarize(buildTranscriptItems(entries))).toMatchInlineSnapshot(`
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
  expect(summarize(buildTranscriptItems(entries))).toMatchInlineSnapshot(`
    "header  2026-04-29T20:00:00Z
    entry   u1
    entry   a1
    sep     after=a1 5000ms"
  `)
})
