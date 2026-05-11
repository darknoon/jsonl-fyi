import { describe, it, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { SettingsProvider } from "../../settings"
import type { ToolResult } from "../../types"
import { PiEditTool, parsePiEdits } from "./PiEditTool"

const okOutput: ToolResult = { content: [], isError: false }

function render(
  args: Record<string, unknown>,
  output: ToolResult = okOutput,
): string {
  return renderToStaticMarkup(
    <SettingsProvider initial={{ renderMarkdown: true, viewMode: "normal" }}>
      <PiEditTool
        call={{ type: "toolCall", id: "1", name: "edit", arguments: args }}
        output={output}
      />
    </SettingsProvider>,
  )
}

describe("parsePiEdits", () => {
  it("parses well-formed input", () => {
    const r = parsePiEdits({ path: "a.ts", edits: [{ oldText: "x", newText: "y" }] })
    expect(r).toEqual({ path: "a.ts", edits: [{ oldText: "x", newText: "y" }] })
  })
  it("returns null when path missing", () => {
    expect(parsePiEdits({ edits: [] })).toBeNull()
  })
  it("returns null when edits missing", () => {
    expect(parsePiEdits({ path: "a.ts" })).toBeNull()
  })
  it("tolerates malformed edit entries", () => {
    expect(parsePiEdits({ path: "a.ts", edits: [{}] })).toEqual({
      path: "a.ts",
      edits: [{ oldText: "", newText: "" }],
    })
  })
})

describe("PiEditTool", () => {
  it("renders the file basename in the title", () => {
    const html = render({ path: "src/foo/bar.ts", edits: [{ oldText: "a", newText: "b" }] })
    expect(html).toContain("bar.ts")
  })

  it("shows edit tool name", () => {
    const html = render({ path: "src/foo/bar.ts", edits: [{ oldText: "a", newText: "b" }] })
    expect(html).toContain("edit")
  })

  it("falls back gracefully on bad input", () => {
    const html = render({})
    expect(html).toContain("edit") // title still rendered
  })

  it("renders error status when output.isError is true", () => {
    const html = render(
      { path: "a.ts", edits: [{ oldText: "x", newText: "y" }] },
      { content: [{ type: "text", text: "fail" }], isError: true },
    )
    expect(html).toContain("error")
  })
})
