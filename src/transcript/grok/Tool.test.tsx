import { afterEach, beforeEach, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { SettingsProvider, type Settings } from "../../settings"
import { GrokTool, grokToolDiffs } from "./Tool"
import type { GrokToolEntry } from "./types"

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const imageUrl = "data:image/png;base64,synthetic-image"

function entry(overrides: Partial<GrokToolEntry> = {}): GrokToolEntry {
  return {
    kind: "tool",
    id: "test-call",
    name: "read_file",
    input: { target_file: "recipes/soup.png" },
    output: {
      content: [{ type: "image", source: { type: "url", url: imageUrl } }],
      isError: false,
    },
    hasResult: true,
    ...overrides,
  }
}

function tool(toolEntry: GrokToolEntry, viewMode: Settings["viewMode"] = "normal") {
  return (
    <SettingsProvider initial={{ viewMode }}>
      <GrokTool entry={toolEntry} />
    </SettingsProvider>
  )
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

test("known and generic image-only results show previews except in Compact mode", async () => {
  for (const name of ["read_file", "draw_recipe"]) {
    for (const mode of ["normal", "compact", "chat"] as const) {
      await act(async () =>
        root.render(<div key={`${name}-${mode}`}>{tool(entry({ name }), mode)}</div>),
      )
      expect(container.querySelector("img")?.getAttribute("src") ?? null).toBe(
        mode === "compact" ? null : imageUrl,
      )
      expect(container.textContent).not.toContain("expand to view")
      await act(async () => container.querySelector<HTMLButtonElement>(".tool-row")!.click())
      expect(container.querySelector("img")?.getAttribute("src")).toBe(imageUrl)
      expect(container.querySelector(".image-block")?.getAttribute("aria-label")).toBe("View image")
      await act(async () => container.querySelector<HTMLButtonElement>(".tool-row")!.click())
      expect(container.querySelector("img")?.getAttribute("src") ?? null).toBe(
        mode === "compact" ? null : imageUrl,
      )
    }
  }
})

test("clicking a preview image enlarges it without expanding the tool card", async () => {
  for (const mode of ["normal", "chat"] as const) {
    await act(async () => root.render(<div key={mode}>{tool(entry(), mode)}</div>))
    expect(container.querySelector(".tool-fields")).toBeNull()
    await act(async () => container.querySelector<HTMLButtonElement>(".image-block")!.click())
    expect(container.querySelector("dialog[open]")).not.toBeNull()
    expect(container.querySelector(".tool-preview")).not.toBeNull()
    expect(container.querySelector(".tool-fields")).toBeNull()
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click(),
    )
    expect(container.querySelector("dialog")).toBeNull()
    expect(container.querySelector(".image-block img")?.getAttribute("src")).toBe(imageUrl)
  }
})

test("expanded mixed results preserve text/image/text order", async () => {
  const result = entry({
    output: {
      content: [
        { type: "text", text: "Before the image" },
        { type: "image", source: { type: "url", url: imageUrl } },
        { type: "text", text: "After the image" },
      ],
      isError: false,
    },
  })
  await act(async () => root.render(tool(result)))
  await act(async () => container.querySelector<HTMLButtonElement>(".tool-row")!.click())
  const html = container.innerHTML
  expect(html.indexOf("Before the image")).toBeLessThan(html.indexOf('class="image-block'))
  expect(html.indexOf('class="image-block')).toBeLessThan(html.indexOf("After the image"))
})

test("unknown input fields and invalid arguments remain inspectable in the fallback", async () => {
  await act(async () =>
    root.render(tool(entry({ input: { target_file: 7, extra: { keep: "every field" } } }))),
  )
  await act(async () => container.querySelector<HTMLButtonElement>(".tool-row")!.click())
  expect(container.textContent).toContain("target_file")
  expect(container.textContent).toContain("7")
  expect(container.textContent).toContain("every field")
  expect(container.querySelector("img")).not.toBeNull()
})

test("terminal failure shows exit status and preserves full output on expansion", async () => {
  const failure = entry({
    name: "run_terminal_command",
    input: { command: "bun test", description: "Check recipes", block_until_ms: 1000 },
    exitCode: 2,
    output: { content: [{ type: "text", text: "one\ntwo\nthree\nfour" }], isError: true },
  })
  await act(async () => root.render(tool(failure)))
  expect(container.textContent).toContain("Exit code 2")
  expect(container.querySelector(".tool-card-error")).not.toBeNull()
  await act(async () => container.querySelector<HTMLButtonElement>(".tool-row")!.click())
  expect(container.textContent).toContain("one\ntwo\nthree\nfour")
  expect(container.textContent).toContain("Check recipes")
  expect(container.textContent).toContain("1000")
})

test("missing results are labelled without claiming success", () => {
  const html = renderToStaticMarkup(
    tool(entry({ hasResult: false, output: { content: [], isError: false } })),
  )
  expect(html).toContain("No result recorded")
  expect(html).not.toContain("tool-card-success")
})

test("edits show the shared diff and any result images in their preview", () => {
  const html = renderToStaticMarkup(
    tool(
      entry({
        name: "search_replace",
        input: {
          file_path: "recipes/soup.md",
          old_string: "Serves 2",
          new_string: "Serves 4",
          replace_all: false,
        },
      }),
    ),
  )
  expect(html).toContain("edit-diff-wrap")
  expect(html).toContain("recipes/soup.md")
  expect(html).toContain(imageUrl)
})

test("only validated edits contribute group diff metadata", () => {
  const input = { file_path: "recipes/soup.md", old_string: "Serves 2", new_string: "Serves 4" }
  expect(grokToolDiffs(entry({ name: "search_replace", input }))).toEqual([
    { kind: "edit", filePath: "recipes/soup.md", oldString: "Serves 2", newString: "Serves 4" },
  ])
  expect(
    grokToolDiffs(entry({ name: "search_replace", input: { ...input, new_string: 7 } })),
  ).toEqual([])
  expect(
    grokToolDiffs(entry({ name: "search_replace", input: { ...input, unfamiliar: true } })),
  ).toEqual([])
  expect(grokToolDiffs(entry())).toEqual([])
})
