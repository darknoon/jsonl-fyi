import { test, expect, mock, beforeEach, afterEach } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { CopyButton } from "./CopyButton"

// Tell React we're in a test env so act() works without warnings.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  try {
    act(() => root.unmount())
  } catch {
    // root may already be unmounted by the test itself
  }
  container.remove()
})

test("SSR: renders with default aria-label", () => {
  const html = renderToStaticMarkup(<CopyButton text="hello" />)
  expect(html).toContain('aria-label="Copy"')
  expect(html).toContain("copy-button")
})

test("SSR: respects custom aria-label", () => {
  const html = renderToStaticMarkup(
    <CopyButton text="hello" ariaLabel="Copy command" />,
  )
  expect(html).toContain('aria-label="Copy command"')
})

test("SSR: contains both copy and check icon spans", () => {
  const html = renderToStaticMarkup(<CopyButton text="hello" />)
  expect(html).toContain("copy-button-icon-copy")
  expect(html).toContain("copy-button-icon-check")
})

test("SSR: applies custom className", () => {
  const html = renderToStaticMarkup(
    <CopyButton text="x" className="extra-class" />,
  )
  expect(html).toContain("extra-class")
  expect(html).toContain("copy-button")
})

test("click writes static text to clipboard", async () => {
  const writeText = mock(async () => {})
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  })
  await act(async () => {
    root.render(<CopyButton text="hello" />)
  })
  const btn = container.querySelector("button")!
  await act(async () => {
    btn.click()
  })
  expect(writeText).toHaveBeenCalledWith("hello")
})

test("click resolves thunk lazily", async () => {
  const writeText = mock(async () => {})
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  })
  const thunk = mock(() => "lazy-value")
  await act(async () => {
    root.render(<CopyButton text={thunk} />)
  })
  expect(thunk).not.toHaveBeenCalled()
  const btn = container.querySelector("button")!
  await act(async () => {
    btn.click()
  })
  expect(thunk).toHaveBeenCalledTimes(1)
  expect(writeText).toHaveBeenCalledWith("lazy-value")
})

test("after click, button has data-copied=true", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async () => {} },
  })
  await act(async () => {
    root.render(<CopyButton text="x" />)
  })
  const btn = container.querySelector("button")!
  await act(async () => {
    btn.click()
  })
  expect(btn.getAttribute("data-copied")).toBe("true")
})

test("click stops propagation", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async () => {} },
  })
  let parentClicked = false
  const Parent = () => (
    <div onClick={() => { parentClicked = true }}>
      <CopyButton text="x" />
    </div>
  )
  await act(async () => {
    root.render(<Parent />)
  })
  const btn = container.querySelector("button")!
  await act(async () => {
    btn.click()
  })
  expect(parentClicked).toBe(false)
})

test("falls back to execCommand when clipboard.writeText rejects", async () => {
  const writeText = mock(async () => {
    throw new Error("denied")
  })
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  })
  const execCommand = mock(() => true)
  // happy-dom may not implement execCommand; assign directly
  ;(document as unknown as { execCommand: typeof execCommand }).execCommand =
    execCommand
  await act(async () => {
    root.render(<CopyButton text="fallback-text" />)
  })
  const btn = container.querySelector("button")!
  await act(async () => {
    btn.click()
  })
  expect(writeText).toHaveBeenCalled()
  expect(execCommand).toHaveBeenCalledWith("copy")
})

test("revert callback is a no-op after unmount", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async () => {} },
  })

  const realSetTimeout = globalThis.setTimeout
  let scheduled: (() => void) | null = null
  globalThis.setTimeout = ((cb: () => void, _ms?: number) => {
    scheduled = cb
    return 0 as unknown as ReturnType<typeof setTimeout>
  }) as typeof setTimeout

  try {
    await act(async () => {
      root.render(<CopyButton text="x" />)
    })
    const btn = container.querySelector("button")!
    await act(async () => {
      btn.click()
    })
    // Unmount before invoking the captured revert callback.
    await act(async () => {
      root.unmount()
    })
    // This must not throw and must not call setState on the unmounted root.
    expect(() => scheduled && scheduled()).not.toThrow()
  } finally {
    globalThis.setTimeout = realSetTimeout
  }
})
