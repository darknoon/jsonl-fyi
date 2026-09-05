import { test, expect, beforeEach, afterEach } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { ImageBlock, base64ToBlob } from "./ImageBlock"

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// 1x1 transparent PNG
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
const source = { type: "base64" as const, media_type: "image/png", data: PNG_B64 }

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
    // already unmounted
  }
  container.remove()
})

test("base64ToBlob decodes a PNG payload with the right type and size", () => {
  const blob = base64ToBlob(PNG_B64, "image/png")
  expect(blob).not.toBeNull()
  expect(blob!.type).toBe("image/png")
  expect(blob!.size).toBe(70)
})

test("base64ToBlob returns null on malformed input", () => {
  expect(base64ToBlob("not base64!!", "image/png")).toBeNull()
})

test("SSR: base64 image renders as a data: URL", () => {
  const html = renderToStaticMarkup(<ImageBlock source={source} />)
  expect(html).toContain(`href="data:image/png;base64,${PNG_B64}"`)
  expect(html).toContain(`src="data:image/png;base64,${PNG_B64}"`)
})

test("SSR: url image passes the URL through", () => {
  const html = renderToStaticMarkup(
    <ImageBlock source={{ type: "url", url: "https://example.com/a.png" }} />,
  )
  expect(html).toContain('href="https://example.com/a.png"')
})

test("client: base64 image link and img swap to a blob: URL after mount", async () => {
  await act(async () => {
    root.render(<ImageBlock source={source} />)
  })
  const a = container.querySelector("a")!
  const img = container.querySelector("img")!
  expect(a.getAttribute("href")).toStartWith("blob:")
  expect(img.getAttribute("src")).toBe(a.getAttribute("href"))
  expect(a.getAttribute("target")).toBe("_blank")
})
