import { test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { SettingsProvider, type Settings } from "../../settings"
import type { ToolResult } from "../../types"
import { PiTool } from "./Tool"

const okOutput: ToolResult = { content: [], isError: false }

function renderTool(
  name: string,
  input: Record<string, unknown>,
  output: ToolResult = okOutput,
  details?: unknown,
  settings: Partial<Settings> = {},
): string {
  return renderToStaticMarkup(
    <SettingsProvider initial={{ renderMarkdown: true, viewMode: "normal", ...settings }}>
      <PiTool call={{ type: "toolCall", id: "c1", name, arguments: input }} output={output} details={details} />
    </SettingsProvider>,
  )
}

test("PiTool: bash renders command and tail preview", () => {
  const html = renderTool("bash", { command: "ls -la", timeout: 10 }, { ...okOutput, content: [{ type: "text", text: "1\n2\n3\n4" }] })
  expect(html).toContain("bash")
  expect(html).toContain("ls -la")
  expect(html).toContain("2\n3\n4")
})

test("PiTool: read renders path and output summary", () => {
  const html = renderTool("read", { path: "/tmp/file.ts", offset: 1, limit: 20 }, { ...okOutput, content: [{ type: "text", text: "a\nb" }] })
  expect(html).toContain("read")
  expect(html).toContain("file.ts")
  expect(html).toContain("Read 2 lines")
})

test("PiTool: plan_tracker renders progress preview", () => {
  const html = renderTool(
    "plan_tracker",
    { action: "update", index: 0, status: "complete" },
    okOutput,
    { action: "update", tasks: [{ name: "Explore", status: "complete" }, { name: "Build", status: "pending" }] },
  )
  expect(html).toContain("plan_tracker")
  expect(html).toContain("1 / 2 complete")
})

test("PiTool: subagent renders mode and result preview", () => {
  const html = renderTool(
    "subagent",
    { agent: "scout", task: "inspect" },
    { ...okOutput, content: [{ type: "text", text: "Scout found parser files" }] },
    { mode: "single", results: [{ agent: "scout", exitCode: 0 }] },
  )
  expect(html).toContain("subagent")
  expect(html).toContain("single")
  expect(html).toContain("Scout found parser files")
})

test("PiTool: read preserves ordered mixed text and image result content", () => {
  const image = { type: "base64" as const, media_type: "image/png", data: "abc" }
  const html = renderTool(
    "read",
    { path: "/tmp/file.ts" },
    {
      ...okOutput,
      content: [
        { type: "text", text: "before" },
        { type: "image", source: image },
        { type: "text", text: "after" },
      ],
    },
  )
  expect(html.indexOf("before")).toBeLessThan(html.indexOf("image-block"))
  expect(html.indexOf("image-block")).toBeLessThan(html.indexOf("after"))
})

test("PiTool: unknown tool uses integrated fallback", () => {
  const html = renderTool("my_extension_tool", { action: "go" }, { ...okOutput, content: [{ type: "text", text: "Done" }] })
  expect(html).toContain("my_extension_tool")
  expect(html).toContain("action")
  expect(html).toContain("Done")
})
