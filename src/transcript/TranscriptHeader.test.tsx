import { test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { TranscriptHeader } from "./TranscriptHeader"

const TS = "2026-04-29T19:15:00Z"
const FORMAT_OPTS = { now: new Date("2026-04-30T18:00:00Z"), locale: "en-US", timeZone: "UTC" }

test("TranscriptHeader: no models — date only", () => {
  const html = renderToStaticMarkup(
    <TranscriptHeader startTimestamp={TS} formatOptions={FORMAT_OPTS} />,
  )
  expect(html).toContain("Yesterday, 7:15 PM")
  expect(html).not.toContain("•")
})

test("TranscriptHeader: single model — '<label> • <date>'", () => {
  const html = renderToStaticMarkup(
    <TranscriptHeader
      startTimestamp={TS}
      formatOptions={FORMAT_OPTS}
      models={[{ label: "Opus 4.7", raw: "claude-opus-4-7" }]}
    />,
  )
  expect(html).toContain("Opus 4.7")
  expect(html).toContain("•")
  expect(html).toContain("Yesterday, 7:15 PM")
  expect(html).toContain('title="claude-opus-4-7"')
})

test("TranscriptHeader: multiple models comma-joined in discovery order", () => {
  const html = renderToStaticMarkup(
    <TranscriptHeader
      startTimestamp={TS}
      formatOptions={FORMAT_OPTS}
      models={[
        { label: "Opus 4.7", raw: "claude-opus-4-7" },
        { label: "Sonnet 4.6", raw: "claude-sonnet-4-6" },
      ]}
    />,
  )
  expect(html).toContain("Opus 4.7")
  expect(html).toContain("Sonnet 4.6")
  expect(html.indexOf("Opus 4.7")).toBeLessThan(html.indexOf("Sonnet 4.6"))
  expect(html).toContain('title="claude-opus-4-7"')
  expect(html).toContain('title="claude-sonnet-4-6"')
})

test("TranscriptHeader: empty models array behaves like no models", () => {
  const html = renderToStaticMarkup(
    <TranscriptHeader startTimestamp={TS} formatOptions={FORMAT_OPTS} models={[]} />,
  )
  expect(html).not.toContain("•")
})
