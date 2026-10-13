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

test("shows model, prompt, prose and explicit boundaries for an empty second run", () => {
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
  expect(html).toContain('aria-label="Run 2"')
  expect(html).toContain("No user prompt text recorded")
  expect(html).toContain("No completion recorded")
  expect(html.match(/class="user-bubble"/g)?.length).toBe(1)
  expect(html).not.toContain("turn-separator")
  expect(html).not.toContain("Invalid Date")
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
