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
  expect(container.querySelector("details")).toBeNull()
})

test("incomplete and cancelled calls are never styled as successful", () => {
  for (const status of ["unknown", "running", "cancelled"] satisfies MuseToolStatus[]) {
    const html = renderToStaticMarkup(<MuseTool entry={entry({ status })} />)
    expect(html).not.toContain("tool-card-success")
    expect(html).not.toContain("tool-card-error")
  }
})

test("empty shell text adds no prose and its recorded envelope remains available", async () => {
  const output = JSON.stringify({ output: "", exit_code: 0, unfamiliar: "retained" })
  await act(async () => root.render(<MuseTool entry={entry({ output })} />))
  expect(container.textContent).toBe("bash")
  await act(async () => container.querySelector<HTMLButtonElement>(".tool-row")!.click())
  expect(container.textContent).not.toContain("No result text recorded")
  expect(container.textContent).not.toContain("Tool arguments are not available")
  expect(container.querySelector(".output")).toBeNull()
  expect(container.textContent).toContain("Full recorded result")
  expect(container.textContent).toContain(output)
})

test("recorded arguments preserve every field without fabricating an edit diff", async () => {
  const input = {
    file_path: "recipes/soup.md",
    content: "Add a pinch of salt.",
    unfamiliar: { values: [null, true, 7] },
  }
  await act(async () =>
    root.render(<MuseTool entry={entry({ name: "edit_file", input, output: "Updated" })} />),
  )
  expect(container.querySelector(".tool-title-detail")?.textContent).toBe("recipes/soup.md")
  await act(async () => container.querySelector<HTMLButtonElement>(".tool-row")!.click())
  expect(container.textContent).toContain("Arguments")
  expect(container.textContent).toContain(JSON.stringify(input, null, 2))
  expect(container.textContent).not.toContain("Tool arguments are not available")
  expect(container.querySelector(".edit-diff-wrap")).toBeNull()
})

test("non-object arguments remain available rather than being treated as absent", async () => {
  for (const input of [null, ["soup", 2], "unparsed arguments", {}]) {
    await act(async () =>
      root.render(<MuseTool key={JSON.stringify(input)} entry={entry({ input })} />),
    )
    await act(async () => container.querySelector<HTMLButtonElement>(".tool-row")!.click())
    expect(container.querySelector(".tool-field dd code")?.textContent).toBe(
      typeof input === "string" ? input : JSON.stringify(input, null, 2),
    )
    expect(container.textContent).not.toContain("Tool arguments are not available")
  }
})

test("an unfinished call with no output or metadata remains a neutral empty card", async () => {
  await act(async () => root.render(<MuseTool entry={entry({ status: "unknown" })} />))
  expect(container.textContent).toBe("bash")
  expect(container.querySelector(".tool-row.clickable")).toBeNull()
  expect(container.querySelector(".tool-card-success, .tool-card-error")).toBeNull()
  expect(container.querySelector(".tool-fields, .tool-preview, .output")).toBeNull()
})

test("recorded cancellation and failure details remain in the expanded shared fields", async () => {
  for (const status of ["cancelled", "rejected", "running"] satisfies MuseToolStatus[]) {
    await act(async () =>
      root.render(
        <MuseTool
          key={status}
          entry={entry({ status, reason: "Recorded task reason", durationMs: 4200 })}
        />,
      ),
    )
    expect(container.querySelector(".tool-row")?.textContent).toBe("bash")
    expect(container.textContent).not.toContain("Recorded task reason")
    expect(container.textContent).not.toContain("4.2s")
    await act(async () => container.querySelector<HTMLButtonElement>(".tool-row")!.click())
    const fields = [...container.querySelectorAll(".tool-field")].map((field) => [
      field.querySelector("dt")?.textContent,
      field.querySelector("dd code")?.textContent,
    ])
    expect(fields).toContainEqual(["Status", status])
    expect(fields).toContainEqual(["Reason", "Recorded task reason"])
    expect(fields).toContainEqual(["Duration", "4.2s"])
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
  expect(html).toContain(image.output)
  expect(html).toContain("/tmp/preview.png")
  expect(html).not.toContain("<img")
  await act(async () =>
    root.render(
      <SettingsProvider initial={{ viewMode: "compact" }}>
        <MuseTool entry={image} />
      </SettingsProvider>,
    ),
  )
  expect(container.textContent).not.toContain(image.output)
  await act(async () => container.querySelector<HTMLButtonElement>(".tool-row")!.click())
  expect(container.querySelector(".output")?.textContent).toBe(image.output)
  expect(container.querySelector("img")).toBeNull()
})

test("unknown outcomes keep embedded images visible without status prose or success styling", async () => {
  const data =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/hhkAAAAASUVORK5CYII="
  const image = entry({
    name: "read_file",
    input: { path: "preview.png" },
    output: "Read image file `preview.png` as model-visible image output.",
    status: "unknown",
    images: [{ mediaType: "image/png", data }],
  })
  await act(async () => root.render(<MuseTool entry={image} />))
  expect(container.querySelector(".image-block img")?.getAttribute("src")).toBe(
    `data:image/png;base64,${data}`,
  )
  expect(container.querySelector(".tool-preview-clickable")).toBeNull()
  expect(container.querySelector(".tool-card-success, .tool-card-error")).toBeNull()
  expect(container.querySelector(".tool-row")?.textContent).toBe("read_file(preview.png)")
  await act(async () =>
    root.render(
      <SettingsProvider initial={{ viewMode: "compact" }}>
        <MuseTool entry={image} />
      </SettingsProvider>,
    ),
  )
  expect(container.querySelector("img")).toBeNull()
  await act(async () => container.querySelector<HTMLButtonElement>(".tool-row")!.click())
  expect(container.querySelectorAll(".image-block img").length).toBe(1)
  expect(container.querySelector(".image-block img")?.getAttribute("src")).toBe(
    `data:image/png;base64,${data}`,
  )
  expect(container.querySelector(".tool-card-success, .tool-card-error")).toBeNull()
  expect([...container.querySelectorAll("dt")].map((field) => field.textContent)).not.toContain(
    "Status",
  )
  expect(container.textContent).not.toContain("Outcome not recorded")
})

test("tool result HTML and SVG are always escaped text", async () => {
  const output = '<svg onload="alert(1)"><path d="M0 0"/></svg><script>bad()</script>'
  await act(async () => root.render(<MuseTool entry={entry({ name: "read_file", output })} />))
  expect(container.textContent).toContain(output)
  expect(
    container.querySelector(
      ".output > svg, .output script, .tool-preview-snippet > svg, .tool-preview-snippet script",
    ),
  ).toBeNull()
  await act(async () => container.querySelector<HTMLButtonElement>(".tool-row")!.click())
  expect(container.textContent).toContain(output)
  expect(
    container.querySelector(
      ".output > svg, .output script, .tool-preview-snippet > svg, .tool-preview-snippet script",
    ),
  ).toBeNull()
})
