import { test, expect } from "bun:test"
import { parseJsonl } from "./parse"
import { shortPath } from "./transcript/claude/toolMeta"
import {
  narrowToolUse,
  isKnownToolUse,
  type ToolUse,
} from "./transcript/claude/toolTypes"

// Pull a short representative string out of any tool_use input — used only
// here to render the fixture as a one-line-per-call script. Real UI labels
// live on each tool's component.
function toolTitle(use: ToolUse): string {
  if (!isKnownToolUse(use)) return ""
  switch (use.name) {
    case "Bash":
      return use.input.command
    case "Read":
    case "Edit":
    case "MultiEdit":
    case "Write":
      return use.input.file_path
    case "Glob":
    case "Grep":
      return use.input.pattern
    case "WebFetch":
      return use.input.url
    case "WebSearch":
    case "ToolSearch":
      return use.input.query
    case "Task":
    case "Agent":
      return use.input.description
    case "NotebookEdit":
      return use.input.notebook_path
    case "Skill":
      return use.input.skill
    case "TodoWrite":
    case "EnterPlanMode":
    case "ExitPlanMode":
      return ""
  }
}

// Render the fixture in a Claude-Code-style script form: tool calls as
// `ToolName(short title)`, tool results as `↳ result`, and user/assistant
// text/thinking/image as `<role|none> <type>`. Tool calls drop the role
// because tool_use is always assistant-driven; tool_result drops it because
// it's always paired with the call above. This mirrors the way Claude Code
// itself surfaces a transcript and makes regression diffs read naturally.
function renderEntry(entry: { type: string; message?: { role?: string; content?: unknown } }): string {
  const role = entry.message?.role ?? entry.type
  const c = entry.message?.content
  if (!c) return `${role}:-`
  if (typeof c === "string") {
    const snippet = c.replace(/\s+/g, " ").trim()
    return `${role}: ${truncate(snippet, 60)}`
  }
  if (!Array.isArray(c)) return `${role}:?`
  return c
    .map(b => {
      if (!b || typeof b !== "object") return `${role}:?`
      const block = b as Record<string, unknown>
      switch (block.type) {
        case "text": {
          const t = String(block.text ?? "").replace(/\s+/g, " ").trim()
          return `${role}: ${truncate(t, 60)}`
        }
        case "thinking": {
          const t = String(block.thinking ?? "").replace(/\s+/g, " ").trim()
          return `thinking: ${truncate(t, 60)}`
        }
        case "image":
          return `[image]`
        case "tool_use": {
          const title = toolTitle(
            narrowToolUse({
              name: String(block.name),
              input: (block.input as Record<string, unknown>) ?? {},
            }),
          )
          const display = title ? shortPath(title) : ""
          return `${String(block.name)}(${truncate(display, 60)})`
        }
        case "tool_result":
          return `↳ result`
        default:
          return `${role}:?${String(block.type)}`
      }
    })
    .join("\n")
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s
}

test("parseJsonl renders the fixture as a Claude-style script", async () => {
  const text = await Bun.file(
    new URL("./__fixtures__/sample.jsonl", import.meta.url),
  ).text()
  const { entries, skipped } = parseJsonl(text)

  const typeCounts = new Map<string, number>()
  for (const e of entries) typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1)
  const types = [...typeCounts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join(" ")

  const script = entries.map(renderEntry).join("\n")

  const summary = [
    `entries=${entries.length} skipped=${skipped}`,
    `types: ${types}`,
    `---`,
    script,
  ].join("\n")

  expect(summary).toMatchInlineSnapshot(`
    "entries=25 skipped=0
    types: assistant=15 user=10
    ---
    [image]
    user: Can you fix this issue where the markdown toolbar shows up …
    thinking: Let me understand the issue from the screenshot: there's an…
    ToolSearch(select:mcp__project__RenameChat)
    ↳ result
    mcp__project__RenameChat()
    ↳ result
    Agent(Find markdown toolbar code)
    ↳ result
    Read(REDACTED_TOKEN.tsx)
    ↳ result
    Read(REDACTED_TOKEN.tsx)
    ↳ result
    thinking: Now I understand the issue. The \`EditorToolbar\` always uses…
    assistant: The toolbar is always \`fixed\` to the viewport bottom. For t…
    Edit(REDACTED_TOKEN.tsx)
    ↳ result
    Edit(REDACTED_TOKEN.tsx)
    ↳ result
    assistant: Now pass \`inline\` from \`InlineMarkdownEditor\`:
    Edit(REDACTED_TOKEN.tsx)
    ↳ result
    assistant: Let me verify the final state of both files:
    Read(REDACTED_TOKEN.tsx)
    ↳ result
    assistant: The changes are: 1. **\`EditorToolbar.tsx\`** - Added an \`inl…"
  `)
})

test("malformed lines increment skipped, valid lines keep parsing", () => {
  const text = [
    `{"type":"user","message":{"role":"user","content":"hi"}}`,
    `not json`,
    ``,
    `{"type":"file-history-snapshot"}`,
    `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hello"}]}}`,
  ].join("\n")
  const { entries, skipped } = parseJsonl(text)
  const summary = `entries=${entries.length} skipped=${skipped} kept=${entries.map(e => e.type).join(",")}`
  expect(summary).toMatchInlineSnapshot(`"entries=2 skipped=1 kept=user,assistant"`)
})
