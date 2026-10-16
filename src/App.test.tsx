import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { App } from "./App"

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const STORAGE_KEY = "jsonl-fyi:last"
const browser = window as unknown as { happyDOM: { setURL(url: string): void } }
let container: HTMLDivElement
let root: Root
let originalUrl: string

beforeEach(async () => {
  originalUrl = window.location.href
  browser.happyDOM.setURL("http://localhost/")
  sessionStorage.clear()
  window.history.replaceState(null, "", "/")
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<App />))
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  sessionStorage.clear()
  browser.happyDOM.setURL(originalUrl)
})

function transcript(message: string): string {
  return JSON.stringify({
    type: "response_item",
    payload: { type: "message", role: "user", content: [{ type: "input_text", text: message }] },
  })
}

function streamedFile(
  name: string,
  text: string,
  size = new TextEncoder().encode(text).length,
): File {
  const file = new File([], name)
  Object.defineProperties(file, {
    size: { value: size },
    text: {
      value: () => {
        throw new Error("Whole-file reads are unavailable")
      },
    },
    stream: {
      value: () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(text))
            controller.close()
          },
        }),
    },
  })
  return file
}

async function selectFile(file: File) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, "files", { configurable: true, value: [file] })
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }))
  })
}

test("loads file streams and keeps refresh persistence for small files", async () => {
  const text = transcript("Small streamed conversation")
  await selectFile(streamedFile("small.jsonl", text))
  expect(container.querySelector(".filename")?.textContent).toBe("small.jsonl")
  expect(container.querySelector(".transcript")?.textContent).toContain(
    "Small streamed conversation",
  )
  expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toEqual({ name: "small.jsonl", text })
})

test("large streamed files replace stale persisted sessions without storing their full text", async () => {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ name: "old.jsonl", text: transcript("Old") }),
  )
  await selectFile(
    streamedFile("large.jsonl", transcript("Large streamed conversation"), 804_145_891),
  )
  expect(container.querySelector(".filename")?.textContent).toBe("large.jsonl")
  expect(container.querySelector(".transcript")?.textContent).toContain(
    "Large streamed conversation",
  )
  expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
})

test("read failures are visible and leave the file picker available", async () => {
  const file = new File([], "unreadable.jsonl")
  Object.defineProperty(file, "stream", {
    value: () =>
      new ReadableStream({
        start(controller) {
          controller.error(new Error("File became unavailable"))
        },
      }),
  })
  await selectFile(file)
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    "Couldn't read unreadable.jsonl: File became unavailable",
  )
  expect(container.querySelector('input[type="file"]')).not.toBeNull()
  expect(container.querySelector(".transcript")).toBeNull()
})

test("selecting another file cancels a pending read and renders the new selection", async () => {
  let cancelled = false
  const stalled = new File([], "stalled.jsonl")
  Object.defineProperty(stalled, "stream", {
    value: () =>
      new ReadableStream({
        cancel() {
          cancelled = true
        },
      }),
  })
  await selectFile(stalled)
  expect(container.querySelector('[role="status"]')?.textContent).toContain("Loading stalled.jsonl")
  await selectFile(streamedFile("new.jsonl", transcript("New selection wins")))
  expect(cancelled).toBe(true)
  expect(container.querySelector(".filename")?.textContent).toBe("new.jsonl")
  expect(container.querySelector(".transcript")?.textContent).toContain("New selection wins")
  expect(container.textContent).not.toContain("Couldn't read")
})

test("a slow demo cannot replace a file selected while it downloads", async () => {
  let resolveDemo!: (response: Response) => void
  const pendingDemo = new Promise<Response>((resolve) => {
    resolveDemo = resolve
  })
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(() => pendingDemo, { preconnect: globalThis.fetch.preconnect }),
  )
  try {
    await act(async () => root.unmount())
    window.history.replaceState(null, "", "/?demo")
    root = createRoot(container)
    await act(async () => root.render(<App />))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    await selectFile(streamedFile("chosen.jsonl", transcript("Chosen file wins")))
    await act(async () => resolveDemo(new Response(transcript("Late demo"))))
    expect(container.querySelector(".filename")?.textContent).toBe("chosen.jsonl")
    expect(container.querySelector(".transcript")?.textContent).toContain("Chosen file wins")
    expect(container.textContent).not.toContain("Late demo")
  } finally {
    fetchSpy.mockRestore()
  }
})

test("Grok files use the streaming loader and display image results", async () => {
  const text = [
    { type: "user", prompt_index: 0, content: [{ type: "text", text: "Show my soup recipe." }] },
    {
      type: "assistant",
      content: "Here is the image.",
      model_id: "grok-test",
      tool_calls: [{ id: "soup", name: "read_file", arguments: '{"target_file":"soup.png"}' }],
    },
    {
      type: "tool_result",
      tool_call_id: "soup",
      content: "",
      images: [{ type: "image", url: "data:image/png;base64,synthetic" }],
    },
  ]
    .map((line) => JSON.stringify(line))
    .join("\n")
  await selectFile(streamedFile("chat_history.jsonl", text))
  expect(container.querySelector(".filename")?.textContent).toBe("chat_history.jsonl")
  expect(container.querySelector(".transcript")?.textContent).toContain("Show my soup recipe.")
  expect(container.querySelector(".image-block img")?.getAttribute("src")).toBe(
    "data:image/png;base64,synthetic",
  )
})

test("dropped Grok companion streams show the chat_history hint", async () => {
  const companions = [
    [
      "events.jsonl",
      {
        type: "turn_started",
        ts: "2026-01-01T00:00:00Z",
        schema_version: "1.0",
        session_id: "recipe-example",
        model_id: "grok-test",
        turn_number: 1,
        conversation_message_count: 0,
        session_relationship: null,
        yolo_mode: false,
      },
    ],
    [
      "updates.jsonl",
      {
        method: "_x.ai/session/update",
        timestamp: 1,
        params: { sessionId: "recipe-example", update: { sessionUpdate: "turn_completed" } },
      },
    ],
  ] as const
  for (const [name, marker] of companions) {
    await selectFile(streamedFile(name, JSON.stringify(marker)))
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Drop chat_history.jsonl from the same folder.",
    )
    expect(container.querySelector(".transcript")).toBeNull()
  }
})

test("opens Muse files through the file picker and renders the recorded model and prompt", async () => {
  const text = await Bun.file(
    new URL("./__fixtures__/muse/muse-code.jsonl", import.meta.url),
  ).text()
  await selectFile(streamedFile("muse-code.jsonl", text))
  expect(container.querySelector(".filename")?.textContent).toBe("muse-code.jsonl")
  expect(container.querySelector(".file-icon-muse")).not.toBeNull()
  expect(container.querySelector(".user-bubble")?.textContent?.length).toBeGreaterThan(0)
  expect(container.querySelector(".transcript-header-models")?.textContent?.length).toBeGreaterThan(
    0,
  )
  expect(container.querySelectorAll(".assistant-text").length).toBeGreaterThan(0)
})
