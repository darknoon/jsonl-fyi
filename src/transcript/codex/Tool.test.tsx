import { test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { CodexFunctionCall, CodexCustomToolCall } from "./Tool"
import { SettingsProvider, type Settings } from "../../settings"
import type { ToolResult } from "../../types"

export function renderFnHtml(
  name: string,
  args: unknown,
  output: ToolResult,
  settings: Partial<Settings> = {},
): string {
  return renderToStaticMarkup(
    <SettingsProvider initial={{ renderMarkdown: true, viewMode: "normal", ...settings }}>
      <CodexFunctionCall name={name} argumentsJson={JSON.stringify(args)} output={output} />
    </SettingsProvider>,
  )
}

export function renderCustomHtml(
  name: string,
  rawInput: string,
  output: ToolResult,
  settings: Partial<Settings> = {},
): string {
  return renderToStaticMarkup(
    <SettingsProvider initial={{ renderMarkdown: true, viewMode: "normal", ...settings }}>
      <CodexCustomToolCall name={name} input={rawInput} output={output} />
    </SettingsProvider>,
  )
}

export const okOutput: ToolResult = {
  text: "",
  images: [],
  toolRefs: [],
  isError: false,
}

test("Codex Tool.test.tsx scaffolding loads", () => {
  expect(typeof renderFnHtml).toBe("function")
  expect(typeof renderCustomHtml).toBe("function")
  expect(okOutput.isError).toBe(false)
})
