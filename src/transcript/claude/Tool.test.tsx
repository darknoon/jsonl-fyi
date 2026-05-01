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

test("Read preview: counts lines from output text", () => {
  const html = renderToolHtml(
    { name: "Read", input: { file_path: "/x.ts" } } as ToolUse,
    { ...okOutput, text: "a\nb\nc" },
  )
  expect(html).toContain("Read 3 lines")
})

test("Read preview: trailing newline doesn't inflate count", () => {
  const html = renderToolHtml(
    { name: "Read", input: { file_path: "/x.ts" } } as ToolUse,
    { ...okOutput, text: "a\nb\n" },
  )
  expect(html).toContain("Read 2 lines")
})

test("Read preview: singular line", () => {
  const html = renderToolHtml(
    { name: "Read", input: { file_path: "/x.ts" } } as ToolUse,
    { ...okOutput, text: "a" },
  )
  expect(html).toContain("Read 1 line")
  expect(html).not.toContain("Read 1 lines")
})

test("Read preview: empty output", () => {
  const html = renderToolHtml(
    { name: "Read", input: { file_path: "/x.ts" } } as ToolUse,
    okOutput,
  )
  expect(html).toContain("(no output)")
})

test("Edit: diff renders inside Preview slot in normal mode", () => {
  const html = renderToolHtml(
    {
      name: "Edit",
      input: { file_path: "/foo.ts", old_string: "old line", new_string: "new line" },
    } as ToolUse,
    okOutput,
  )
  expect(html).toContain("tool-preview")
  // EditDiff renders as a web component (diffs-container) in SSR
  expect(html).toContain("edit-diff")
})

test("Edit: in compact mode collapsed shows nothing below trigger", () => {
  const html = renderToolHtml(
    {
      name: "Edit",
      input: { file_path: "/foo.ts", old_string: "a", new_string: "b" },
    } as ToolUse,
    okOutput,
    { viewMode: "compact" },
  )
  // Trigger is rendered (button)
  expect(html).toContain("tool-row")
  // No preview/content shown
  expect(html).not.toContain("tool-preview")
})

test("ExitPlanMode: plan markdown renders inside Preview slot", () => {
  const html = renderToolHtml(
    { name: "ExitPlanMode", input: { plan: "# Title\n\nbody text" } } as ToolUse,
    okOutput,
  )
  expect(html).toContain("tool-preview")
  // Markdown rendered the heading
  expect(html).toMatch(/<h1[^>]*>Title<\/h1>/)
})

test("NotebookEdit: new_source renders inside Preview slot", () => {
  const html = renderToolHtml(
    {
      name: "NotebookEdit",
      input: { notebook_path: "/n.ipynb", new_source: "print('hi')", cell_id: "c1" },
    } as ToolUse,
    okOutput,
  )
  expect(html).toContain("tool-preview")
  expect(html).toContain("print(&#x27;hi&#x27;)")  // single quotes get HTML-escaped by React
})

test("Write preview: first 10 lines + MoreHint when content has more", () => {
  const lines = Array.from({ length: 15 }, (_, i) => `line ${i + 1}`).join("\n")
  const html = renderToolHtml(
    { name: "Write", input: { file_path: "/foo.ts", content: lines } } as ToolUse,
    okOutput,
  )
  expect(html).toContain("tool-preview-snippet snippet-tall")
  expect(html).toContain("line 1\n")
  expect(html).toContain("line 10")
  expect(html).not.toMatch(/snippet[^"]*">[^<]*line 11/) // line 11 not in snippet
  expect(html).toContain("+5 lines")
})

test("Write preview: no MoreHint when content fits", () => {
  const html = renderToolHtml(
    { name: "Write", input: { file_path: "/foo.ts", content: "a\nb" } } as ToolUse,
    okOutput,
  )
  expect(html).toContain("tool-preview-snippet snippet-tall")
  expect(html).not.toContain("tool-more-hint")
})

test("Glob preview: file count, plural", () => {
  const html = renderToolHtml(
    { name: "Glob", input: { pattern: "*.ts" } } as ToolUse,
    { ...okOutput, text: "/a.ts\n/b.ts\n/c.ts" },
  )
  expect(html).toContain("Found 3 files")
})

test("Glob preview: singular", () => {
  const html = renderToolHtml(
    { name: "Glob", input: { pattern: "*.ts" } } as ToolUse,
    { ...okOutput, text: "/a.ts" },
  )
  expect(html).toContain("Found 1 file")
  expect(html).not.toContain("Found 1 files")
})

test("Grep preview: matches count", () => {
  const html = renderToolHtml(
    { name: "Grep", input: { pattern: "foo" } } as ToolUse,
    { ...okOutput, text: "match1\nmatch2" },
  )
  expect(html).toContain("Found 2 matches")
})

test("Grep preview: files_with_matches mode says 'files'", () => {
  const html = renderToolHtml(
    { name: "Grep", input: { pattern: "foo", output_mode: "files_with_matches" } } as ToolUse,
    { ...okOutput, text: "/a.ts\n/b.ts" },
  )
  expect(html).toContain("Found 2 files")
})

test("ToolSearch preview: loaded count", () => {
  const html = renderToolHtml(
    { name: "ToolSearch", input: { query: "x" } } as ToolUse,
    { ...okOutput, toolRefs: ["Read", "Edit"] },
  )
  expect(html).toContain("Loaded 2 tools")
})

test("ToolSearch preview: zero loaded", () => {
  const html = renderToolHtml(
    { name: "ToolSearch", input: { query: "x" } } as ToolUse,
    okOutput,
  )
  expect(html).toContain("No tools loaded")
})

test("WebFetch preview: first non-empty line", () => {
  const html = renderToolHtml(
    { name: "WebFetch", input: { url: "https://x", prompt: "summarize" } } as ToolUse,
    { ...okOutput, text: "\nFirst content line\nrest..." },
  )
  expect(html).toContain("First content line")
})

test("WebFetch preview: fallback when output empty", () => {
  const html = renderToolHtml(
    { name: "WebFetch", input: { url: "https://x", prompt: "y" } } as ToolUse,
    okOutput,
  )
  expect(html).toContain("Fetched")
})

test("WebSearch preview: counts markdown links", () => {
  const html = renderToolHtml(
    { name: "WebSearch", input: { query: "x" } } as ToolUse,
    { ...okOutput, text: "Some [first](http://a) [second](http://b) result" },
  )
  expect(html).toContain("2 results")
})

test("Agent preview: first 3 lines of output + MoreHint", () => {
  const text = "result line 1\nresult line 2\nresult line 3\nresult line 4"
  const html = renderToolHtml(
    { name: "Agent", input: { description: "Search docs", prompt: "..." } } as ToolUse,
    { ...okOutput, text },
  )
  expect(html).toContain("tool-preview-snippet")
  expect(html).toContain("result line 1\nresult line 2\nresult line 3")
  expect(html).not.toMatch(/snippet[^"]*">[^<]*result line 4/)
  expect(html).toContain("+1 line")
})

test("Agent preview: no MoreHint when output fits", () => {
  const html = renderToolHtml(
    { name: "Agent", input: { description: "x", prompt: "..." } } as ToolUse,
    { ...okOutput, text: "one\ntwo" },
  )
  expect(html).toContain("tool-preview-snippet")
  expect(html).not.toContain("tool-more-hint")
})

test("TodoWrite preview: detail = activeForm of in-progress todo, body = M / N complete", () => {
  const html = renderToolHtml(
    {
      name: "TodoWrite",
      input: {
        todos: [
          { content: "Do A", activeForm: "Doing A", status: "completed" },
          { content: "Do B", activeForm: "Doing B", status: "in_progress" },
          { content: "Do C", activeForm: "Doing C", status: "pending" },
        ],
      },
    } as ToolUse,
    okOutput,
  )
  expect(html).toContain("Doing B")
  expect(html).toContain("1 / 3 complete")
})

test("TodoWrite preview: no in-progress → no parens in header", () => {
  const html = renderToolHtml(
    {
      name: "TodoWrite",
      input: {
        todos: [
          { content: "Do A", activeForm: "Doing A", status: "completed" },
          { content: "Do B", activeForm: "Doing B", status: "pending" },
        ],
      },
    } as ToolUse,
    okOutput,
  )
  expect(html).not.toContain("Doing")
  expect(html).toContain("1 / 2 complete")
})

test("TodoWrite preview: all complete shows N / N complete", () => {
  const html = renderToolHtml(
    {
      name: "TodoWrite",
      input: {
        todos: [
          { content: "A", activeForm: "Aing", status: "completed" },
          { content: "B", activeForm: "Bing", status: "completed" },
        ],
      },
    } as ToolUse,
    okOutput,
  )
  expect(html).toContain("2 / 2 complete")
})

test("Skill preview: shows description from injectedText frontmatter", () => {
  const injected = `---
name: brainstorming
description: Help turn ideas into designs through dialogue
---
body`
  const html = renderToolHtml(
    { name: "Skill", input: { skill: "brainstorming" } } as ToolUse,
    { ...okOutput, injectedText: injected },
  )
  expect(html).toContain("Help turn ideas into designs through dialogue")
  expect(html).toContain("tool-preview-line")
})

test("Skill preview: no preview when injectedText missing", () => {
  const html = renderToolHtml(
    { name: "Skill", input: { skill: "x" } } as ToolUse,
    okOutput,
  )
  expect(html).not.toContain("tool-preview-line")
})

test("UnknownTool preview: first 3 lines of output + MoreHint", () => {
  const html = renderToolHtml(
    { name: "mcp__custom__do_thing", input: {} } as ToolUse,
    { ...okOutput, text: "a\nb\nc\nd\ne" },
  )
  expect(html).toContain("tool-preview-snippet")
  expect(html).toContain("a\nb\nc")
  expect(html).not.toMatch(/snippet[^"]*">[^<]*d/)
  expect(html).toContain("+2 lines")
})
