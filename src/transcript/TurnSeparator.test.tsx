import { test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { TurnSeparator } from "./TurnSeparator"

test("TurnSeparator: duration only — no 'Done' prefix, no usage span", () => {
  const html = renderToStaticMarkup(<TurnSeparator durationMs={1234} usage={null} />)
  expect(html).toContain("✓")
  expect(html).toContain("1.2s")
  expect(html).not.toContain("Done")
  expect(html).not.toContain("↑")
})

test("TurnSeparator: with usage renders ↑input ↻cacheRead ↓output in order", () => {
  const html = renderToStaticMarkup(
    <TurnSeparator
      durationMs={1234}
      usage={{ input: 6, output: 165, cacheRead: 29000 }}
    />,
  )
  expect(html).toContain("↑ 6")
  expect(html).toContain("↻ 29.0k")
  expect(html).toContain("↓ 165")
  // Order check — input before cacheRead before output
  const i = html.indexOf("↑ 6")
  const c = html.indexOf("↻ 29.0k")
  const o = html.indexOf("↓ 165")
  expect(i).toBeLessThan(c)
  expect(c).toBeLessThan(o)
})

test("TurnSeparator: with usage where cacheRead is 0 still renders the ↻ slot", () => {
  // Spec: arrows are always shown together when usage is present; we don't
  // suppress individual zeros (keeps alignment readable across turns).
  const html = renderToStaticMarkup(
    <TurnSeparator durationMs={500} usage={{ input: 10, output: 20, cacheRead: 0 }} />,
  )
  expect(html).toContain("↻ 0")
})
