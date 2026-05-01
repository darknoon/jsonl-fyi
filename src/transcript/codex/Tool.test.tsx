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

test("shell_command preview: last 3 lines tail", () => {
  const html = renderFnHtml(
    "shell_command",
    { command: "ls" },
    { ...okOutput, text: "1\n2\n3\n4\n5" },
  )
  expect(html).toContain('class="tool-preview-snippet"')
  expect(html).toContain("3\n4\n5")
  expect(html).toContain("+2 lines")
})

test("exec_command preview: last 10 lines on error with snippet-error class", () => {
  const text = Array.from({ length: 12 }, (_, i) => String(i + 1)).join("\n")
  const html = renderFnHtml(
    "exec_command",
    { cmd: "fail" },
    { ...okOutput, text, isError: true },
  )
  expect(html).toContain("snippet-error")
  expect(html).toContain("3\n4\n5\n6\n7\n8\n9\n10\n11\n12")
})

test("shell preview: last 3 lines tail with array command", () => {
  const html = renderFnHtml(
    "shell",
    { command: ["ls", "-la"] },
    { ...okOutput, text: "a\nb\nc\nd" },
  )
  expect(html).toContain("ls -la")
  expect(html).toContain('class="tool-preview-snippet"')
  expect(html).toContain("b\nc\nd")
  expect(html).toContain("+1 line")
})

test("shell_command preview: no preview when output empty", () => {
  const html = renderFnHtml("shell_command", { command: "noop" }, okOutput)
  expect(html).not.toContain("tool-preview-snippet")
})

test("view_image: renders inside Preview slot", () => {
  const html = renderFnHtml("view_image", { path: "/foo.png" }, okOutput)
  expect(html).toContain("tool-preview")
  // Path field present
  expect(html).toContain("foo.png")
})

test("apply_patch: full patch renders inside Preview slot", () => {
  const patch = `*** Begin Patch
*** Add File: hello.ts
+console.log("hi")
*** End Patch`
  const html = renderCustomHtml("apply_patch", patch, okOutput)
  expect(html).toContain("tool-preview")
  // Header detail uses the file name
  expect(html).toContain("hello.ts")
})
