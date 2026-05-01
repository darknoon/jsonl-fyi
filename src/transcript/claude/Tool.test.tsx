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
