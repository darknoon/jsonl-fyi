import { afterEach, beforeEach, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { SettingsProvider } from "../../settings"
import { MuseTool } from "./Tool"
import type { MuseToolEntry, MuseToolStatus } from "./types"

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function entry(changes: Partial<MuseToolEntry> = {}): MuseToolEntry {
  return { kind: "tool", id: "tool", name: "bash", output: "", status: "success", ...changes }
}

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  container = document.createElement("div")
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
})

test("shell cards show readable output and retain result metadata on expansion", async () => {
  const output = JSON.stringify({
    command: "printf recipe",
    description: "Read recipe",
    output: "one\ntwo\nthree\nfour",
    unfamiliar: "keep this",
    exit_code: 2,
  })
  await act(async () =>
    root.render(
      <MuseTool
        entry={entry({
          command: "printf recipe",
          description: "Read recipe",
          output,
          status: "error",
          taskId: "task-1",
          callId: "call-1",
          outputRefs: [{ path: "result-ref" }],
        })}
      />,
    ),
  )
  expect(container.textContent).toContain("two\nthree\nfour")
  expect(container.textContent).not.toContain("keep this")
  expect(container.querySelector(".tool-card-error")).not.toBeNull()
  await act(async () => container.querySelector<HTMLButtonElement>(".tool-row")!.click())
  expect(container.textContent).toContain("Command recorded in result")
  expect(container.textContent).toContain("one\ntwo\nthree\nfour")
  expect(container.textContent).toContain("Full recorded result")
  expect(container.textContent).toContain(output)
  expect(container.textContent).toContain("result-ref")
  expect(container.textContent).toContain("task-1")
  expect(container.textContent).toContain("call-1")
})

test("incomplete and cancelled calls are never styled as successful", () => {
  for (const status of ["unknown", "running", "cancelled"] satisfies MuseToolStatus[]) {
    const html = renderToStaticMarkup(<MuseTool entry={entry({ status })} />)
    expect(html).not.toContain("tool-card-success")
    expect(html).not.toContain("tool-card-error")
  }
})

test("edit result metadata supplies a title path and retains every field", async () => {
  const editFacts = {
    path: "recipe.md",
    added: 3,
    removed: 1,
    tool_name: "edit_file",
    extra: "retained",
  }
  await act(async () =>
    root.render(<MuseTool entry={entry({ name: "edit_file", output: "edited", editFacts })} />),
  )
  expect(container.querySelector(".tool-title-detail")?.textContent).toContain("recipe.md")
  await act(async () => container.querySelector<HTMLButtonElement>(".tool-row")!.click())
  expect(container.textContent).toContain("Path recorded in result")
  expect(container.textContent).toContain("Edit details")
  expect(container.textContent).toContain(JSON.stringify(editFacts, null, 2))
})

test("image references stay visible without trying to load files; Compact expands them", async () => {
  const image = entry({
    name: "read_file",
    output: "Read image file `/tmp/preview.png` as model-visible image output.",
  })
  const html = renderToStaticMarkup(<MuseTool entry={image} />)
  expect(html).toContain("Image not included in this log")
  expect(html).toContain("/tmp/preview.png")
  expect(html).not.toContain("<img")
  await act(async () =>
    root.render(
      <SettingsProvider initial={{ viewMode: "compact" }}>
        <MuseTool entry={image} />
      </SettingsProvider>,
    ),
  )
  expect(container.textContent).not.toContain("Image not included")
  await act(async () => container.querySelector<HTMLButtonElement>(".tool-row")!.click())
  expect(container.textContent).toContain("Image not included in this log")
  expect(container.querySelector("img")).toBeNull()
})

test("tool result HTML and SVG are always escaped text", async () => {
  const output = '<svg onload="alert(1)"><path d="M0 0"/></svg><script>bad()</script>'
  await act(async () => root.render(<MuseTool entry={entry({ name: "read_file", output })} />))
  expect(container.textContent).toContain(output)
  expect(
    container.querySelector(
      ".output svg, .output script, .tool-preview-snippet svg, .tool-preview-snippet script",
    ),
  ).toBeNull()
  await act(async () => container.querySelector<HTMLButtonElement>(".tool-row")!.click())
  expect(container.textContent).toContain(output)
  expect(
    container.querySelector(
      ".output svg, .output script, .tool-preview-snippet svg, .tool-preview-snippet script",
    ),
  ).toBeNull()
})
