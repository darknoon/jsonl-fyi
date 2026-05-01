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
  expect(html).toContain("2 more lines")
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
  expect(html).toContain("1 more line")
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

test("update_plan preview: M / N complete with explanation in header detail", () => {
  const html = renderFnHtml(
    "update_plan",
    {
      explanation: "Refactoring auth",
      plan: [
        { step: "Read files", status: "completed" },
        { step: "Update fn", status: "in_progress" },
        { step: "Run tests", status: "pending" },
      ],
    },
    okOutput,
  )
  expect(html).toContain("Refactoring auth")
  expect(html).toContain("1 / 3 complete")
})

test("update_plan preview: empty plan shows 0 / 0 complete", () => {
  const html = renderFnHtml("update_plan", { explanation: "Starting" }, okOutput)
  expect(html).toContain("0 / 0 complete")
})

test("spawn_agent preview: nickname · message line", () => {
  const html = renderFnHtml(
    "spawn_agent",
    { agent_type: "explorer", message: "Inspect commit b29189..." },
    { ...okOutput, text: '{"agent_id":"019d","nickname":"Bacon"}' },
  )
  expect(html).toContain("tool-preview-line")
  expect(html).toContain("Bacon · Inspect commit b29189...")
})

test("spawn_agent preview: nickname only when message missing", () => {
  const html = renderFnHtml(
    "spawn_agent",
    { agent_type: "worker" },
    { ...okOutput, text: '{"agent_id":"019d","nickname":"Faraday"}' },
  )
  expect(html).toContain("tool-preview-line")
  expect(html).toContain("Faraday")
  expect(html).not.toContain("·")
})

test("spawn_agent preview: message only when output missing nickname", () => {
  const html = renderFnHtml(
    "spawn_agent",
    { agent_type: "worker", message: "do thing" },
    okOutput,
  )
  expect(html).toContain("tool-preview-line")
  expect(html).toContain("do thing")
})

test("spawn_agent preview: no preview when nothing to show", () => {
  const html = renderFnHtml("spawn_agent", { agent_type: "worker" }, okOutput)
  expect(html).not.toContain("tool-preview-line")
})

test("wait_agent preview: string output (abort) shown as one line", () => {
  const html = renderFnHtml(
    "wait_agent",
    { targets: ["019d"], timeout_ms: 60000 },
    { ...okOutput, text: '"aborted by user after 274.4s"' },
  )
  expect(html).toContain("tool-preview-line")
  expect(html).toContain("aborted by user after 274.4s")
})

test("wait_agent preview: empty status + timed_out → 'Timed out after Ns'", () => {
  const html = renderFnHtml(
    "wait_agent",
    { targets: ["019d"], timeout_ms: 600000 },
    { ...okOutput, text: '{"status":{},"timed_out":true}' },
  )
  expect(html).toContain("Timed out after 600s")
})

test("wait_agent preview: empty status + not timed out → '(no agent results)'", () => {
  const html = renderFnHtml(
    "wait_agent",
    { targets: ["019d"], timeout_ms: 60000 },
    { ...okOutput, text: '{"status":{},"timed_out":false}' },
  )
  expect(html).toContain("(no agent results)")
})

test("wait_agent preview: populated status renders one row per agent", () => {
  const out = JSON.stringify({
    status: {
      "019d-A": { Completed: { message: "Refactor done" } },
      "019d-B": { Errored: { error: "test failed: x.test.ts:42" } },
    },
    timed_out: false,
  })
  const html = renderFnHtml(
    "wait_agent",
    { targets: ["019d-A", "019d-B"], timeout_ms: 60000 },
    { ...okOutput, text: out },
  )
  expect(html).toContain("Completed")
  expect(html).toContain("Refactor done")
  expect(html).toContain("Errored")
  expect(html).toContain("test failed: x.test.ts:42")
})

test("wait_agent preview: simple string status (InProgress) renders without dash", () => {
  const out = JSON.stringify({
    status: { "019d-X": "InProgress" },
    timed_out: false,
  })
  const html = renderFnHtml(
    "wait_agent",
    { targets: ["019d-X"], timeout_ms: 60000 },
    { ...okOutput, text: out },
  )
  expect(html).toContain("InProgress")
  expect(html).not.toMatch(/InProgress\s*—/)
})

test("wait_agent preview: empty output → no preview slot", () => {
  const html = renderFnHtml(
    "wait_agent",
    { targets: ["019d"], timeout_ms: 60000 },
    okOutput,
  )
  expect(html).not.toContain("tool-preview")
})
