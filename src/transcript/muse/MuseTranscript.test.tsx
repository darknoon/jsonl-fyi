import { expect, test } from "bun:test"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { SettingsProvider, type ViewMode } from "../../settings"
import { MuseTranscript } from "./MuseTranscript"
import type { MuseEntry, MuseRun, MuseSession, MuseToolEntry } from "./types"

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function tool(id: string, changes: Partial<MuseToolEntry> = {}): MuseToolEntry {
  return {
    kind: "tool",
    id,
    name: "read_file",
    output: "Recipe contents",
    status: "success",
    ...changes,
  }
}

function run(entries: MuseEntry[], changes: Partial<MuseRun> = {}): MuseRun {
  return {
    id: "run-1",
    sessionId: "session",
    prompt: "Please improve this recipe.",
    entries,
    ...changes,
  }
}

function session(runs: MuseRun[], changes: Partial<MuseSession> = {}): MuseSession {
  return { models: [{ raw: "muse-test", label: "Muse test model" }], runs, ...changes }
}

function render(value: MuseSession, viewMode: ViewMode = "normal") {
  return renderToStaticMarkup(
    <SettingsProvider initial={{ viewMode }}>
      <MuseTranscript session={value} />
    </SettingsProvider>,
  )
}

test("empty and missing prompts preserve assistant continuations without extra labels", () => {
  const model = { raw: "muse-test", label: "Muse test model" }
  const html = render(
    session([
      run([{ kind: "message", id: "answer", text: "The recipe is ready." }], {
        terminal: "completed",
        durationMs: 1000,
        model,
      }),
      run([{ kind: "message", id: "empty", text: "The quantities are checked." }], {
        id: "run-2",
        prompt: "",
        model,
      }),
      run([{ kind: "message", id: "missing", text: "The recipe is saved." }], {
        id: "run-3",
        prompt: undefined,
        model,
      }),
    ]),
  )
  expect(html).toContain("The recipe is ready.")
  expect(html).toContain("The quantities are checked.")
  expect(html).toContain("The recipe is saved.")
  expect(html.match(/Muse test model/g)?.length).toBe(1)
  expect(html.match(/class="user-bubble"/g)?.length).toBe(1)
  expect(html.match(/class="turn-separator"/g)?.length).toBe(1)
  expect(html).not.toContain("Follow-up")
  expect(html).not.toContain("User prompt unavailable")
  expect(html).not.toContain("No user prompt text recorded")
  expect(html).not.toContain("No completion recorded")
  expect(html).not.toContain("muse-run-heading")
})

test("subsequent recorded user prompts use the standard user bubble", () => {
  const html = render(
    session([run([]), run([], { id: "run-2", prompt: "Make a shopping list too." })]),
  )
  expect(html).toContain("Make a shopping list too.")
  expect(html.match(/class="user-bubble"/g)?.length).toBe(2)
  expect(html).not.toContain("Next turn")
})

test("session bookkeeping and raw run records do not add transcript rows", () => {
  const raw = { id: "metadata", payload: { status: "recorded" } }
  const html = render(
    session([
      run([{ kind: "diagnostic", id: "runtime", label: "Runtime records", raw }], {
        id: "metadata-1",
        prompt: undefined,
        isContext: true,
        records: [raw],
      }),
      run([{ kind: "message", id: "answer", text: "The recipe is ready." }], {
        terminal: "completed",
        records: [raw],
      }),
    ]),
  )
  expect(html).toContain("The recipe is ready.")
  expect(html).not.toContain("Session records")
  expect(html).not.toContain("Source records")
  expect(html).not.toContain("Runtime records")
  expect(html).not.toContain("tool-card")
})

test("unsupported session content remains available in a shared fallback card", async () => {
  const container = document.createElement("div")
  const root = createRoot(container)
  const raw = { id: "metadata", payload: { unfamiliar: "Retained metadata value" } }
  const context = run(
    [{ kind: "unknown", id: "unknown-metadata", label: "Unrecognized metadata", raw }],
    { id: "metadata", prompt: undefined, isContext: true, records: [raw] },
  )
  try {
    await act(async () => root.render(<MuseTranscript session={session([context])} />))
    expect(container.textContent).toContain("Unrecognized metadata")
    expect(container.textContent).not.toContain("Retained metadata value")
    expect(container.querySelector("details")).toBeNull()
    expect(container.querySelector(".tool-card")).not.toBeNull()
    await act(async () => container.querySelector<HTMLButtonElement>(".tool-row")!.click())
    expect(container.textContent).toContain(JSON.stringify(raw, null, 2))
    expect(container.textContent).not.toContain("Source records")
  } finally {
    act(() => root.unmount())
  }
})

test("untrustworthy timing stays absent without adding a transcript notice", () => {
  const value = session(
    [run([tool("read", { durationMs: 4200 })], { terminal: "completed", durationMs: 9000 })],
    {
      startTimestamp: "2024-01-01T12:00:00Z",
      timingIssue: "This log has rewritten timestamps; elapsed time is unavailable.",
    },
  )
  const html = render(value)
  expect(html).not.toContain(value.timingIssue!)
  expect(html).not.toContain("4.2s")
  expect(html).not.toContain("9.0s")
  expect(html).not.toContain("January 1")
  expect(html).not.toContain("turn-separator")
  expect(html).not.toContain("tokens")
})

test("trustworthy timing uses shared duration formatting without fabricated usage", () => {
  const html = render(
    session(
      [run([tool("read", { durationMs: 4200 })], { terminal: "completed", durationMs: 9000 })],
      {
        startTimestamp: "2024-01-01T12:00:00Z",
      },
    ),
  )
  expect(html).not.toContain("4.2s")
  expect(html).toContain("9.0s")
  expect(html).toContain("turn-separator")
  expect(html).not.toContain("turn-separator-usage")
})

test("Chat keeps unknown outcomes and missing images outside groups", () => {
  const html = render(
    session([
      run([
        tool("one"),
        tool("two"),
        tool("running", { name: "bash", status: "running", output: "" }),
        tool("image", { output: "Read image file `preview.png` as model-visible image output." }),
        tool("cancelled", { name: "bash_input", status: "cancelled", output: "" }),
        tool("last", { status: "error", output: "Not found" }),
      ]),
    ]),
    "chat",
  )
  expect(html).toContain("Read 2 files")
  expect(html).toContain("Read 1 file (1 failure)")
  expect(html).toContain("bash")
  expect(html).toContain("bash_input")
  expect(html).toContain("Read image file `preview.png` as model-visible image output.")
  expect(html).not.toContain("Still running when recorded")
  expect(html).not.toContain("Cancelled")
  expect(html).not.toContain("<img")
  expect(html).not.toContain("Recipe contents")
})

test("Chat keeps embedded images visible outside collapsed tool groups", () => {
  const html = render(
    session([
      run([
        tool("before"),
        tool("image", {
          output: "Image result",
          images: [{ mediaType: "image/png", data: "c3ludGhldGlj" }],
        }),
        tool("after"),
      ]),
    ]),
    "chat",
  )
  expect(html).toContain("data:image/png;base64,c3ludGhldGlj")
  expect(html).toContain("Image result")
  expect(html.match(/Read 1 file/g)?.length).toBe(2)
  expect(html).not.toContain("Read 3 files")
})

test("recorded reasoning uses the shared thinking view and can expand within Chat groups", async () => {
  const value = session([
    run([
      tool("read"),
      { kind: "thinking", id: "reasoning", text: "Check the ingredient quantities." },
    ]),
  ])
  expect(render(value)).toContain('aria-label="Thinking"')
  expect(render(value)).toContain("Check the ingredient quantities.")
  const container = document.createElement("div")
  const root = createRoot(container)
  try {
    await act(async () =>
      root.render(
        <SettingsProvider initial={{ viewMode: "chat" }}>
          <MuseTranscript session={value} />
        </SettingsProvider>,
      ),
    )
    expect(container.textContent).toContain("Read 1 file and thought")
    expect(container.textContent).not.toContain("Check the ingredient quantities.")
    await act(async () => container.querySelector<HTMLButtonElement>(".tool-group-row")!.click())
    expect(container.querySelector(".thinking-content")?.textContent).toBe(
      "Check the ingredient quantities.",
    )
  } finally {
    act(() => root.unmount())
  }
})

test("normal and Compact preserve individual tool cards", () => {
  for (const viewMode of ["normal", "compact"] as const) {
    const html = render(session([run([tool("one"), tool("two")])]), viewMode)
    expect(html.match(/tool-title-name/g)?.length).toBe(2)
    expect(html).not.toContain("tool-group-row")
    expect(html.includes("Recipe contents")).toBe(viewMode === "normal")
  }
})

test("non-completed runs retain the recorded outcome without a success separator", async () => {
  const container = document.createElement("div")
  const root = createRoot(container)
  const value = session([
    run([], { terminal: "cancelled", reason: "Recipe work stopped", durationMs: 1000 }),
  ])
  try {
    await act(async () => root.render(<MuseTranscript session={value} />))
    expect(container.textContent).toContain("Run cancelled")
    expect(container.textContent).not.toContain("Recipe work stopped")
    expect(container.querySelector(".turn-separator")).toBeNull()
    expect(container.querySelector(".tool-card-success")).toBeNull()
    await act(async () => container.querySelector<HTMLButtonElement>(".tool-row")!.click())
    expect(container.textContent).toContain("Recipe work stopped")
  } finally {
    act(() => root.unmount())
  }
})

test("multiple models use the existing turn separator model field", () => {
  const first = { raw: "model-a", label: "Model A" }
  const second = { raw: "model-b", label: "Model B" }
  const html = render(
    session(
      [
        run([], { model: first, terminal: "completed", durationMs: 1000 }),
        run([], { id: "run-2", model: second, terminal: "completed", durationMs: 2000 }),
      ],
      { models: [first, second] },
    ),
  )
  expect(html).toContain('class="turn-separator-model" title="model-a">Model A')
  expect(html).toContain('class="turn-separator-model" title="model-b">Model B')
})
