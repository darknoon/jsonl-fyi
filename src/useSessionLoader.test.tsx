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
