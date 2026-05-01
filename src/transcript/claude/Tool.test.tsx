import { test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Tool } from "./Tool"
import { SettingsProvider, type Settings } from "../../settings"
import type { ToolResult } from "../../types"
import type { ToolUse } from "./toolTypes"

export function renderToolHtml(
  use: ToolUse,
  output: ToolResult,
  settings: Partial<Settings> = {},
): string {
  return renderToStaticMarkup(
    <SettingsProvider initial={{ renderMarkdown: true, viewMode: "normal", ...settings }}>
      <Tool use={use} output={output} />
    </SettingsProvider>,
  )
}

export const okOutput: ToolResult = {
  text: "",
  images: [],
  toolRefs: [],
  isError: false,
}

test("Tool.test.tsx scaffolding loads", () => {
  expect(typeof renderToolHtml).toBe("function")
  expect(okOutput.isError).toBe(false)
})

test("Bash preview: last 3 lines + MoreHint when more", () => {
  const html = renderToolHtml(
    { name: "Bash", input: { command: "ls" } } as ToolUse,
    { ...okOutput, text: "1\n2\n3\n4\n5" },
  )
  expect(html).toContain('class="tool-preview-snippet"')
  expect(html).toContain("3\n4\n5")
  expect(html).not.toContain("<pre class=\"tool-preview-snippet\">1\n2\n3\n4\n5") // not rendering full
  expect(html).toContain("+2 lines")
})

test("Bash preview: 10-line tail on error with snippet-error class", () => {
  const text = Array.from({ length: 15 }, (_, i) => String(i + 1)).join("\n")
  const html = renderToolHtml(
    { name: "Bash", input: { command: "fail" } } as ToolUse,
    { ...okOutput, text, isError: true },
  )
  expect(html).toContain('class="tool-preview-snippet snippet-error"')
  expect(html).toContain("6\n7\n8\n9\n10\n11\n12\n13\n14\n15")
  expect(html).toContain("+5 lines")
})

test("Bash preview: no MoreHint when output fits", () => {
  const html = renderToolHtml(
    { name: "Bash", input: { command: "echo hi" } } as ToolUse,
    { ...okOutput, text: "hi" },
  )
  expect(html).toContain("hi")
  expect(html).not.toContain("tool-more-hint")
})

test("Bash preview: compact mode shows no preview", () => {
  const html = renderToolHtml(
    { name: "Bash", input: { command: "ls" } } as ToolUse,
    { ...okOutput, text: "1\n2\n3" },
    { viewMode: "compact" },
  )
  expect(html).not.toContain("tool-preview-snippet")
})
