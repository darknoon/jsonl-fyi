import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { EXAMPLES, exampleHref } from "./examples"
import { useSessionLoader } from "./useSessionLoader"

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const STORAGE_KEY = "jsonl-fyi:last"
const browser = window as unknown as { happyDOM: { setURL(url: string): void } }
let container: HTMLDivElement
let root: Root | null
let loader: ReturnType<typeof useSessionLoader>
let originalUrl: string

function Harness() {
  loader = useSessionLoader()
  return null
}

beforeEach(() => {
  originalUrl = window.location.href
  browser.happyDOM.setURL("http://localhost/")
  sessionStorage.clear()
  window.history.replaceState(null, "", "/")
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root?.unmount())
  container.remove()
  sessionStorage.clear()
  browser.happyDOM.setURL(originalUrl)
})

async function mount() {
  await act(async () => root!.render(<Harness />))
}

function transcript(message: string): string {
  return `${JSON.stringify({
    type: "response_item",
    payload: { type: "message", role: "user", content: [{ type: "input_text", text: message }] },
  })}\n`
}

function controlledFile(name: string, size: number) {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value
    },
    cancel() {
      cancelled = true
    },
  })
  const file = new File([], name)
  Object.defineProperties(file, {
    size: { value: size },
    stream: { value: () => stream },
  })
  return {
    file,
    enqueue(text: string) {
      controller.enqueue(new TextEncoder().encode(text))
    },
    close() {
      controller.close()
    },
    get cancelled() {
      return cancelled
    },
  }
}

test("reset cancels an in-progress read and clears the restored session, storage, and URL", async () => {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ name: "stored.jsonl", text: `${transcript("Stored session")}invalid\n` }),
  )
  await mount()
  expect(loader.fileName).toBe("stored.jsonl")
  expect(loader.session?.format).toBe("codex")
  expect(loader.skipped).toBe(1)

  const chunk = transcript("Incoming session")
  const incoming = controlledFile("incoming.jsonl", new TextEncoder().encode(chunk).length * 2)
  let completion!: Promise<void>
  await act(async () => {
    completion = loader.loadFile(incoming.file)
    incoming.enqueue(chunk)
  })
  expect(loader.loadingFile).toEqual({ name: "incoming.jsonl", percent: 50 })

  window.history.replaceState(null, "", exampleHref(EXAMPLES[0]))
  await act(async () => {
    loader.reset(true)
    await completion
  })
  expect(incoming.cancelled).toBe(true)
  expect(loader.session).toBeNull()
  expect(loader.fileName).toBeNull()
  expect(loader.skipped).toBe(0)
  expect(loader.loadingFile).toBeNull()
  expect(loader.dropError).toBeNull()
  expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  expect(window.location.pathname).toBe("/")
})

test("cancelling an earlier read cannot clear the next file's progress", async () => {
  await mount()
  const chunk = transcript("Progress")
  const bytes = new TextEncoder().encode(chunk).length
  const earlier = controlledFile("earlier.jsonl", bytes * 2)
  const current = controlledFile("current.jsonl", bytes * 4)
  let earlierCompletion!: Promise<void>
  let currentCompletion!: Promise<void>
  await act(async () => {
    earlierCompletion = loader.loadFile(earlier.file)
    earlier.enqueue(chunk)
  })
  expect(loader.loadingFile).toEqual({ name: "earlier.jsonl", percent: 50 })

  await act(async () => {
    currentCompletion = loader.loadFile(current.file)
    current.enqueue(chunk)
    await earlierCompletion
  })
  expect(earlier.cancelled).toBe(true)
  expect(loader.loadingFile).toEqual({ name: "current.jsonl", percent: 25 })
  expect(loader.dropError).toBeNull()

  await act(async () => {
    current.enqueue(chunk.repeat(3))
    current.close()
    await currentCompletion
  })
  expect(loader.loadingFile).toBeNull()
  expect(loader.fileName).toBe("current.jsonl")
  expect(loader.session?.format).toBe("codex")
  expect(window.history.state).toEqual({ jsonlFyiLoaded: true })
})

test("unmount aborts a pending file without persisting it or adding a history entry", async () => {
  await mount()
  const incoming = controlledFile("pending.jsonl", 100)
  const historyLength = window.history.length
  let completion!: Promise<void>
  await act(async () => {
    completion = loader.loadFile(incoming.file)
  })
  await act(async () => {
    root!.unmount()
    root = null
    await completion
  })
  expect(incoming.cancelled).toBe(true)
  expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  expect(window.history.length).toBe(historyLength)
})

test("navigating back prevents a pending route example from reopening the transcript", async () => {
  let resolveExample!: (text: string) => void
  const pending = new Promise<string>((resolve) => {
    resolveExample = resolve
  })
  const example = EXAMPLES[0]
  const loadSpy = spyOn(example, "load").mockImplementation(() => pending)
  try {
    window.history.replaceState(null, "", exampleHref(example))
    await mount()
    expect(loadSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      window.history.replaceState(null, "", "/")
      window.dispatchEvent(new PopStateEvent("popstate"))
      resolveExample(transcript("Late example"))
    })
    expect(loader.session).toBeNull()
    expect(loader.fileName).toBeNull()
    expect(loader.loadingFile).toBeNull()
    expect(window.location.pathname).toBe("/")
  } finally {
    loadSpy.mockRestore()
  }
})

test("opening an example route loads it once without changing history or stored files", async () => {
  const stored = JSON.stringify({ name: "stored.jsonl", text: transcript("Stored session") })
  sessionStorage.setItem(STORAGE_KEY, stored)
  const example = EXAMPLES[0]
  const loadSpy = spyOn(example, "load").mockResolvedValue(transcript("Route example"))
  try {
    window.history.replaceState(null, "", exampleHref(example))
    const historyLength = window.history.length
    await mount()
    expect(loadSpy).toHaveBeenCalledTimes(1)
    expect(loader.fileName).toBe(example.fileName)
    expect(loader.session?.format).toBe("codex")
    expect(window.history.length).toBe(historyLength)
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe(stored)
  } finally {
    loadSpy.mockRestore()
  }
})

function grokTranscript(message = "Show the soup recipe"): string {
  return [
    { type: "user", prompt_index: 0, content: [{ type: "text", text: message }] },
    {
      type: "assistant",
      content: "Here is the recipe.",
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
}

test("restoring persisted Grok text parses messages, paired calls, and images", async () => {
  const stored = JSON.stringify({ name: "chat_history.jsonl", text: grokTranscript() })
  sessionStorage.setItem(STORAGE_KEY, stored)
  await mount()
  expect(loader.fileName).toBe("chat_history.jsonl")
  expect(loader.dropError).toBeNull()
  expect(loader.session?.format).toBe("grok")
  if (loader.session?.format !== "grok") throw new Error("Expected Grok session")
  expect(loader.session.session.entries[0]).toMatchObject({
    kind: "message",
    role: "user",
    text: "Show the soup recipe",
  })
  expect(loader.session.session.entries.find((entry) => entry.kind === "tool")).toMatchObject({
    hasResult: true,
    output: {
      content: [{ type: "image", source: { type: "url", url: "data:image/png;base64,synthetic" } }],
    },
  })
  expect(sessionStorage.getItem(STORAGE_KEY)).toBe(stored)
})

test("persisted Grok companion text shows the same hint as dropped files", async () => {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      name: "updates.jsonl",
      text: JSON.stringify({
        method: "_x.ai/session/update",
        timestamp: 1,
        params: { sessionId: "recipe-example", update: { sessionUpdate: "turn_completed" } },
      }),
    }),
  )
  await mount()
  expect(loader.session).toBeNull()
  expect(loader.dropError).toBe("Drop chat_history.jsonl from the same folder.")
})

test("a delayed Grok text source cannot overwrite a newly selected streamed file", async () => {
  await mount()
  let resolveText!: (text: string) => void
  const pending = new Promise<string>((resolve) => {
    resolveText = resolve
  })
  let textCompletion!: Promise<void>
  await act(async () => {
    textCompletion = loader.loadExample({
      ...EXAMPLES[0],
      fileName: "chat_history.jsonl",
      load: () => pending,
    })
  })
  const text = transcript("The latest selected file")
  const current = controlledFile("current.jsonl", new TextEncoder().encode(text).length)
  await act(async () => {
    const completion = loader.loadFile(current.file)
    current.enqueue(text)
    current.close()
    await completion
  })
  await act(async () => {
    resolveText(grokTranscript("Late prototype text"))
    await textCompletion
  })
  expect(loader.session?.format).toBe("codex")
  expect(loader.fileName).toBe("current.jsonl")
  expect(loader.loadingFile).toBeNull()
})
