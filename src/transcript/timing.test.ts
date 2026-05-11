import { test, expect } from "bun:test"
import { formatChatStart, formatDuration, buildTranscriptItems, type RenderItem } from "./timing"
import type { Block, Entry, MessageEntry } from "../types"

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
  const synSep = items.find((i) => i.kind === "separator" && i.afterUuid === "syn")
  if (synSep?.kind !== "separator") throw new Error("expected synthetic separator")
  expect(synSep.model).toBeNull()
})

// ---------------------------------------------------------------------------
// Chat-mode grouping tests
// ---------------------------------------------------------------------------

function mkAssistant(uuid: string, blocks: Block[]): MessageEntry {
  return {
    type: "assistant",
    uuid,
    message: { role: "assistant", content: blocks },
  }
}

test("buildTranscriptItems chat: 3 consecutive tool_use → one tool_group with items.length === 3", () => {
  const entries: Entry[] = [
    mkAssistant("a1", [
      { type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.ts" } },
      { type: "tool_use", id: "t2", name: "Read", input: { file_path: "b.ts" } },
      { type: "tool_use", id: "t3", name: "Bash", input: { command: "ls" } },
    ]),
  ]
  const { items } = buildTranscriptItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(3)
  expect(groups[0].items[0].kind === "tool" && groups[0].items[0].block.id).toBe("t1")
  expect(groups[0].items[1].kind === "tool" && groups[0].items[1].block.id).toBe("t2")
  expect(groups[0].items[2].kind === "tool" && groups[0].items[2].block.id).toBe("t3")
})

test("buildTranscriptItems chat: [text, tool_use, text, tool_use] → two single-item groups", () => {
  const entries: Entry[] = [
    mkAssistant("a1", [
      { type: "text", text: "Let me check" },
      { type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.ts" } },
      { type: "text", text: "Also:" },
      { type: "tool_use", id: "t2", name: "Read", input: { file_path: "b.ts" } },
    ]),
  ]
  const { items } = buildTranscriptItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(2)
})

test("buildTranscriptItems chat: [tool_use×2, text, tool_use×2] → two tool_groups", () => {
  const entries: Entry[] = [
    mkAssistant("a1", [
      { type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.ts" } },
      { type: "tool_use", id: "t2", name: "Read", input: { file_path: "b.ts" } },
      { type: "text", text: "middle" },
      { type: "tool_use", id: "t3", name: "Bash", input: { command: "ls" } },
      { type: "tool_use", id: "t4", name: "Bash", input: { command: "pwd" } },
    ]),
  ]
  const { items } = buildTranscriptItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(2)
})

test("buildTranscriptItems normal: multi-tool input → zero tool_group items", () => {
  const entries: Entry[] = [
    mkAssistant("a1", [
      { type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.ts" } },
      { type: "tool_use", id: "t2", name: "Read", input: { file_path: "b.ts" } },
      { type: "tool_use", id: "t3", name: "Bash", input: { command: "ls" } },
    ]),
  ]
  const { items } = buildTranscriptItems(entries, { viewMode: "normal" })
  expect(items.filter((i) => i.kind === "tool_group")).toHaveLength(0)
})

test("buildTranscriptItems chat: Edit block → items[0].diffs[0] has correct shape", () => {
  const entries: Entry[] = [
    mkAssistant("a1", [
      {
        type: "tool_use",
        id: "t1",
        name: "Edit",
        input: { file_path: "src/foo.ts", old_string: "x", new_string: "y" },
      },
      {
        type: "tool_use",
        id: "t2",
        name: "Edit",
        input: { file_path: "src/bar.ts", old_string: "a", new_string: "b" },
      },
    ]),
  ]
  const { items } = buildTranscriptItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  const item0 = groups[0].items[0]
  if (item0.kind !== "tool") throw new Error()
  const diff = item0.diffs[0]
  expect(diff).toEqual({
    kind: "edit",
    filePath: "src/foo.ts",
    oldString: "x",
    newString: "y",
  })
})

test("buildTranscriptItems chat: MultiEdit with 2 edits → items[0].diffs.length === 2", () => {
  const entries: Entry[] = [
    mkAssistant("a1", [
      {
        type: "tool_use",
        id: "t1",
        name: "MultiEdit",
        input: {
          file_path: "src/foo.ts",
          edits: [
            { old_string: "x", new_string: "y" },
            { old_string: "a", new_string: "b" },
          ],
        },
      },
      {
        type: "tool_use",
        id: "t2",
        name: "Bash",
        input: { command: "ls" },
      },
    ]),
  ]
  const { items } = buildTranscriptItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  const item0 = groups[0].items[0]
  if (item0.kind !== "tool") throw new Error()
  expect(item0.diffs).toHaveLength(2)
})

// ---------------------------------------------------------------------------
// Cross-entry grouping tests (Claude emits one tool_use per assistant message)
// ---------------------------------------------------------------------------

test("buildTranscriptItems chat: two assistant entries each with one tool_use, separated by synthesized user (tool_result only) → group of 2", () => {
  const entries: Entry[] = [
    mkAssistant("a1", [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.ts" } }]),
    {
      type: "user",
      uuid: "u1",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: [] }],
      },
    },
    mkAssistant("a2", [{ type: "tool_use", id: "t2", name: "Read", input: { file_path: "b.ts" } }]),
  ]
  const { items } = buildTranscriptItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(2)
  expect(groups[0].items[0].kind === "tool" && groups[0].items[0].block.id).toBe("t1")
  expect(groups[0].items[1].kind === "tool" && groups[0].items[1].block.id).toBe("t2")
})

test("buildTranscriptItems chat: three assistant entries each with one tool_use, real user between → solo group + group of 2", () => {
  const entries: Entry[] = [
    mkAssistant("a1", [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.ts" } }]),
    {
      type: "user",
      uuid: "u1",
      message: {
        role: "user",
        // real user message: has text block, not just tool_result
        content: [
          { type: "tool_result", tool_use_id: "t1", content: [] },
          { type: "text", text: "ok continue" },
        ],
      },
    },
    mkAssistant("a2", [{ type: "tool_use", id: "t2", name: "Read", input: { file_path: "b.ts" } }]),
    {
      type: "user",
      uuid: "u2",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t2", content: [] }],
      },
    },
    mkAssistant("a3", [{ type: "tool_use", id: "t3", name: "Bash", input: { command: "ls" } }]),
  ]
  const { items } = buildTranscriptItems(entries, { viewMode: "chat" })
  // t1 alone (real u1 flushes), then t2+t3 across synthesized u2.
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(2)
  if (groups[0].kind !== "tool_group" || groups[1].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(1)
  expect(groups[0].items[0].kind === "tool" && groups[0].items[0].block.id).toBe("t1")
  expect(groups[1].items).toHaveLength(2)
  expect(groups[1].items[0].kind === "tool" && groups[1].items[0].block.id).toBe("t2")
  expect(groups[1].items[1].kind === "tool" && groups[1].items[1].block.id).toBe("t3")
})

test("buildTranscriptItems chat: two assistant entries with one tool_use each, followed by assistant with text → group of 2 then text entry", () => {
  const entries: Entry[] = [
    mkAssistant("a1", [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.ts" } }]),
    {
      type: "user",
      uuid: "u1",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: [] }],
      },
    },
    mkAssistant("a2", [{ type: "tool_use", id: "t2", name: "Read", input: { file_path: "b.ts" } }]),
    {
      type: "user",
      uuid: "u2",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t2", content: [] }],
      },
    },
    mkAssistant("a3", [{ type: "text", text: "All done." }]),
  ]
  const { items } = buildTranscriptItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(2)
  // The text entry (a3) should appear after the group
  const groupIdx = items.findIndex((i) => i.kind === "tool_group")
  const a3Idx = items.findIndex((i) => i.kind === "entry" && i.entry.uuid === "a3")
  expect(a3Idx).toBeGreaterThan(groupIdx)
})

test("buildTranscriptItems chat: assistant entry with [tool, text, tool] → two single-item groups", () => {
  const entries: Entry[] = [
    mkAssistant("a1", [
      { type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.ts" } },
      { type: "text", text: "middle" },
      { type: "tool_use", id: "t2", name: "Read", input: { file_path: "b.ts" } },
    ]),
  ]
  const { items } = buildTranscriptItems(entries, { viewMode: "chat" })
  expect(items.filter((i) => i.kind === "tool_group")).toHaveLength(2)
})

test("buildTranscriptItems chat: assistant entry with [tool, tool, text] → group of 2 before the entry", () => {
  const entries: Entry[] = [
    mkAssistant("a1", [
      { type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.ts" } },
      { type: "tool_use", id: "t2", name: "Read", input: { file_path: "b.ts" } },
      { type: "text", text: "done" },
    ]),
  ]
  const { items } = buildTranscriptItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(2)
})

test("buildTranscriptItems chat: Skill tool_use + user-text absorption still works", () => {
  // The Skill tool emits a user text block immediately after the tool_result.
  // That text block must be absorbed into skipKeys even when chat grouping is active.
  const skillText =
    "Base directory for this skill: /skills/my-skill\n\n# My Skill\n\nsome body text"
  const entries: Entry[] = [
    {
      type: "assistant",
      uuid: "a1",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id: "s1", name: "Skill", input: { name: "my-skill" } }],
      },
    },
    {
      type: "user",
      uuid: "u1",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "s1",
            content: [{ type: "text", text: "ok" }],
          },
          { type: "text", text: skillText },
        ],
      },
    },
  ]
  const { skipKeys } = buildTranscriptItems(entries, { viewMode: "chat" })
  // The skill body text is at index 1 of the user entry blocks.
  expect(skipKeys.has("u1:1")).toBe(true)
})

// ---------------------------------------------------------------------------
// Thinking absorption tests (new for errata)
// ---------------------------------------------------------------------------

test("buildTranscriptItems chat: 2 tools + 1 thinking interleaved → group emitted; items.length === 3; thinking in skipKeys", () => {
  const entries: Entry[] = [
    mkAssistant("a1", [
      { type: "thinking", thinking: "let me think" },
      { type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.ts" } },
      { type: "tool_use", id: "t2", name: "Edit", input: { file_path: "b.ts", old_string: "", new_string: "" } },
    ]),
  ]
  const { items, skipKeys } = buildTranscriptItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(3)
  expect(groups[0].items[0].kind).toBe("thinking")
  expect(groups[0].items[1].kind).toBe("tool")
  expect(groups[0].items[2].kind).toBe("tool")
  // thinking block index 0 should be in skipKeys
  expect(skipKeys.has("a1:0")).toBe(true)
  // tool indices 1 and 2 in skipKeys
  expect(skipKeys.has("a1:1")).toBe(true)
  expect(skipKeys.has("a1:2")).toBe(true)
})

test("buildTranscriptItems chat: 1 tool + 1 thinking → group emitted (relaxed threshold)", () => {
  const entries: Entry[] = [
    mkAssistant("a1", [
      { type: "thinking", thinking: "thinking..." },
      { type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.ts" } },
    ]),
  ]
  const { items } = buildTranscriptItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(2)
  expect(groups[0].items[0].kind).toBe("thinking")
  expect(groups[0].items[1].kind).toBe("tool")
})

test("buildTranscriptItems chat: 1 tool + 0 thinking → solo group", () => {
  const entries: Entry[] = [
    mkAssistant("a1", [
      { type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.ts" } },
    ]),
  ]
  const { items } = buildTranscriptItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(1)
})

test("buildTranscriptItems chat: 0 tools + 1 thinking → solo thinking-only group", () => {
  const entries: Entry[] = [
    mkAssistant("a1", [
      { type: "thinking", thinking: "just thinking" },
    ]),
  ]
  const { items } = buildTranscriptItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  expect(groups[0].items).toHaveLength(1)
  expect(groups[0].items[0].kind).toBe("thinking")
})

test("buildTranscriptItems chat: thinking block in group has correct entry+blockIndex", () => {
  const entries: Entry[] = [
    mkAssistant("a1", [
      { type: "thinking", thinking: "pondering" },
      { type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } },
    ]),
  ]
  const { items } = buildTranscriptItems(entries, { viewMode: "chat" })
  const groups = items.filter((i) => i.kind === "tool_group")
  expect(groups).toHaveLength(1)
  if (groups[0].kind !== "tool_group") throw new Error()
  const thinkItem = groups[0].items[0]
  if (thinkItem.kind !== "thinking") throw new Error()
  expect(thinkItem.entry.uuid).toBe("a1")
  expect(thinkItem.blockIndex).toBe(0)
})
