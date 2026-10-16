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

test("labels an empty subsequent prompt as a follow-up without inventing its cause", () => {
  const html = render(
    session([
      run([{ kind: "message", id: "answer", text: "The recipe is ready." }], {
        terminal: "completed",
      }),
      run([], { id: "run-2", prompt: "" }),
    ]),
  )
  expect(html).toContain("Muse test model")
  expect(html).toContain("The recipe is ready.")
  expect(html).toContain('aria-label="Conversation (Run 1)"')
  expect(html).toContain('aria-label="Follow-up (Run 2)"')
  expect(html).toContain('title="Run ID: run-2"')
  expect(html).toContain("No user prompt text recorded")
  expect(html).not.toContain("background")
  expect(html).toContain("No completion recorded")
  expect(html.match(/class="user-bubble"/g)?.length).toBe(1)
  expect(html).not.toContain("turn-separator")
  expect(html).not.toContain("Invalid Date")
})

test("distinguishes a missing prompt from an explicitly empty prompt", () => {
  const html = render(session([run([]), run([], { id: "run-2", prompt: undefined })]))
  expect(html).toContain('aria-label="Recorded activity (Run 2)"')
  expect(html).toContain("User prompt unavailable")
  expect(html).not.toContain("No user prompt text recorded")
  expect(html).not.toContain("Follow-up")
})

test("a subsequent user prompt starts the next turn", () => {
  const html = render(
    session([run([]), run([], { id: "run-2", prompt: "Make a shopping list too." })]),
  )
  expect(html).toContain('aria-label="Next turn (Run 2)"')
  expect(html).toContain("Make a shopping list too.")
  expect(html.match(/class="user-bubble"/g)?.length).toBe(2)
  expect(html).not.toContain("Follow-up")
})

test("session metadata does not take a conversation turn or completion label", () => {
  const html = render(
    session([
      run([], { id: "metadata-1", prompt: undefined, isContext: true }),
      run([], { terminal: "completed" }),
      run([], { id: "metadata-2", prompt: undefined, isContext: true }),
      run([], { id: "run-2", prompt: "", terminal: "completed" }),
    ]),
  )
  expect(html.match(/<summary>Session records<\/summary>/g)?.length).toBe(2)
  expect(html).toContain('aria-label="Conversation (Run 1)"')
  expect(html).toContain('aria-label="Follow-up (Run 2)"')
  expect(html).not.toContain("Run 3")
  expect(html).not.toContain("Next turn")
  expect(html).not.toContain("User prompt unavailable")
  expect(html).not.toContain("No completion recorded")
})

test("session record expansion preserves unknown metadata and original source", async () => {
  const container = document.createElement("div")
  const root = createRoot(container)
  const raw = { id: "metadata", payload: { unfamiliar: "Retained metadata value" } }
  const context = run(
    [{ kind: "unknown", id: "unknown-metadata", label: "Unrecognized metadata", raw }],
    { id: "metadata", prompt: undefined, isContext: true, records: [raw] },
  )
  try {
    await act(async () => root.render(<MuseTranscript session={session([context])} />))
    const disclosure = container.querySelector<HTMLDetailsElement>(".muse-session-records")!
    expect(disclosure.open).toBe(false)
    expect(container.textContent).not.toContain("Unrecognized metadata")
    expect(container.querySelector(".muse-run-heading")).toBeNull()
    expect(container.querySelector(".muse-run-ending")).toBeNull()
    await act(async () => {
      disclosure.open = true
      disclosure.dispatchEvent(new Event("toggle"))
    })
    expect(container.textContent).toContain("Unrecognized metadata")
    expect(container.textContent).toContain("Source records")
    await act(async () => container.querySelector<HTMLButtonElement>(".tool-row")!.click())
    expect(container.textContent).toContain(JSON.stringify(raw, null, 2))
    const source = disclosure.querySelector("details")!
    await act(async () => {
      source.open = true
      source.dispatchEvent(new Event("toggle"))
    })
    expect(source.querySelector("pre")?.textContent).toBe(JSON.stringify([raw], null, 2))
  } finally {
    act(() => root.unmount())
  }
})

test("source records render only while their disclosure is expanded", async () => {
  const container = document.createElement("div")
  const root = createRoot(container)
  const records = [{ id: "source-1", payload: { unfamiliar: "Original recorded value" } }]
  try {
    await act(async () => root.render(<MuseTranscript session={session([run([], { records })])} />))
    const disclosure = container.querySelector("details")
    expect(disclosure?.querySelector("summary")?.textContent).toBe("Source records")
    expect(disclosure?.open).toBe(false)
    expect(disclosure?.querySelector("pre")).toBeNull()
    await act(async () => {
      disclosure!.open = true
      disclosure!.dispatchEvent(new Event("toggle"))
    })
    expect(disclosure?.querySelector("pre")?.textContent).toBe(JSON.stringify(records, null, 2))
    await act(async () => {
      disclosure!.open = false
      disclosure!.dispatchEvent(new Event("toggle"))
    })
    expect(disclosure?.querySelector("pre")).toBeNull()
  } finally {
    act(() => root.unmount())
  }
})

test("timing warning suppresses untrustworthy dates and durations", () => {
  const value = session(
    [run([tool("read", { durationMs: 4200 })], { terminal: "completed", durationMs: 9000 })],
    {
      startTimestamp: "2024-01-01T12:00:00Z",
      timingIssue: "This log has rewritten timestamps; elapsed time is unavailable.",
    },
  )
  const html = render(value)
  expect(html).toContain(value.timingIssue!)
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
  expect(html).toContain("4.2s")
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
  expect(html).toContain("Still running when recorded")
  expect(html).toContain("Cancelled")
  expect(html).toContain("Image not included in this log")
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

test("runtime failures are collapsed diagnostics without failed tool styling", async () => {
  const container = document.createElement("div")
  const root = createRoot(container)
  const value = session([
    run([
      {
        kind: "diagnostic",
        id: "runtime",
        label: "Runtime events (1 rejected task)",
        raw: { reason: "superseded model request" },
      },
    ]),
  ])
  try {
    await act(async () => root.render(<MuseTranscript session={value} />))
    expect(container.textContent).toContain("Runtime events (1 rejected task)")
    expect(container.textContent).not.toContain("superseded model request")
    expect(container.querySelector(".tool-card-error")).toBeNull()
    await act(async () => container.querySelector<HTMLButtonElement>(".tool-row")!.click())
    expect(container.textContent).toContain("superseded model request")
  } finally {
    act(() => root.unmount())
  }
})
