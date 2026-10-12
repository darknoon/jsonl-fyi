import { expect, test } from "bun:test"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { SettingsProvider, type Settings } from "../../settings"
import { GrokTranscript } from "./GrokTranscript"
import type { GrokEntry, GrokSession, GrokToolEntry } from "./types"

function render(entries: GrokEntry[], viewMode: Settings["viewMode"] = "normal") {
  const session: GrokSession = { models: ["grok-test"], entries }
  return renderToStaticMarkup(
    <SettingsProvider initial={{ viewMode }}>
      <GrokTranscript session={session} />
    </SettingsProvider>,
  )
}

function read(id: string): GrokEntry {
  return {
    kind: "tool",
    id,
    name: "read_file",
    input: { target_file: "recipes/soup.md" },
    output: { content: [{ type: "text", text: "Recipe contents" }], isError: false },
    hasResult: true,
  }
}

test("renders available model without fabricated date, timing, or usage", () => {
  const html = render([
    { kind: "message", id: "user", role: "user", text: "Please update my soup recipe." },
  ])
  expect(html).toContain("grok-test")
  expect(html).toContain("user-bubble")
  expect(html).toContain("Please update my soup recipe.")
  expect(html).not.toContain(" • ")
  expect(html).not.toContain("Invalid Date")
  expect(html).not.toContain("turn-separator")
})

test("system/context entries and unknown records start collapsed", () => {
  const html = render([
    { kind: "message", id: "system", role: "system", text: "Hidden system text" },
    { kind: "message", id: "context", role: "context", text: "Hidden context text" },
    {
      kind: "unknown",
      id: "unknown",
      label: "Unknown record",
      raw: { example: "Hidden raw value" },
    },
  ])
  expect(html).toContain("System prompt")
  expect(html).toContain("Context")
  expect(html).toContain("Unknown record")
  expect(html).not.toContain("Hidden")
})

test("chat groups consecutive tools through blank assistant messages and breaks at prose", () => {
  const html = render(
    [
      read("first"),
      { kind: "message", id: "blank", role: "assistant", text: " \n " },
      read("second"),
      { kind: "message", id: "answer", role: "assistant", text: "I found the recipe." },
      read("third"),
    ],
    "chat",
  )
  expect(html).toContain("Read 2 files")
  expect(html).toContain("I found the recipe.")
  expect(html).toContain("Read 1 file")
  expect(html).not.toContain("Recipe contents")
  expect(html.match(/class="assistant-text"/g)?.length).toBe(1)
})

test("generic tools break chat groups and remain visible", () => {
  const html = render(
    [
      read("first"),
      {
        kind: "tool",
        id: "generic",
        name: "search_tool",
        input: { query: "illustrate" },
        output: { content: [], isError: false },
        hasResult: true,
      },
      read("second"),
    ],
    "chat",
  )
  expect(html.match(/Read 1 file/g)?.length).toBe(2)
  expect(html).toContain("search_tool")
})

test("Chat keeps every image-bearing tool visible between collapsed tool groups", () => {
  const imageCalls: Array<Pick<GrokToolEntry, "name" | "input">> = [
    { name: "read_file", input: { target_file: "recipes/soup.png" } },
    { name: "run_terminal_command", input: { command: "render recipe" } },
    { name: "draw_recipe", input: { subject: "Soup" } },
  ]
  for (const call of imageCalls) {
    const html = render(
      [
        read("before"),
        {
          kind: "tool",
          id: "image",
          ...call,
          output: {
            content: [
              {
                type: "image",
                source: { type: "url", url: "data:image/png;base64,synthetic-recipe" },
              },
            ],
            isError: false,
          },
          hasResult: true,
        },
        read("after"),
      ],
      "chat",
    )
    expect(html.match(/Read 1 file/g)?.length).toBe(2)
    expect(html).toContain(call.name)
    expect(html).toContain('aria-label="View image"')
    expect(html).toContain('src="data:image/png;base64,synthetic-recipe"')
    expect(html).not.toContain("Recipe contents")
    expect(html).not.toContain("tool-group-expanded")
  }
})

test("normal/compact modes keep individual tools", () => {
  for (const viewMode of ["normal", "compact"] as const) {
    const html = render([read("first"), read("second")], viewMode)
    expect(html.match(/tool-title-name/g)?.length).toBe(2)
    expect(html).not.toContain("tool-group-row")
    expect(html.includes("Recipe contents")).toBe(viewMode === "normal")
  }
})

test("chat edit diffs appear when the group expands and unmount when it collapses", async () => {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const session: GrokSession = {
    models: [],
    entries: [
      {
        kind: "tool",
        id: "recipe-edit",
        name: "search_replace",
        input: { file_path: "recipes/soup.md", old_string: "Serves 2", new_string: "Serves 4" },
        output: { content: [], isError: false },
        hasResult: true,
      },
    ],
  }
  try {
    await act(async () =>
      root.render(
        <SettingsProvider initial={{ viewMode: "chat" }}>
          <GrokTranscript session={session} />
        </SettingsProvider>,
      ),
    )
    expect(container.textContent).toContain("Edited 1 file")
    expect(container.querySelector(".edit-diff-wrap")).toBeNull()
    const button = container.querySelector<HTMLButtonElement>(".tool-group-row")!
    await act(async () => button.click())
    expect(button.getAttribute("aria-expanded")).toBe("true")
    expect(container.querySelector(".edit-diff-wrap")).not.toBeNull()
    expect(container.textContent).toContain("recipes/soup.md")
    await act(async () => button.click())
    expect(container.querySelector(".edit-diff-wrap")).toBeNull()
  } finally {
    act(() => root.unmount())
    container.remove()
  }
})
