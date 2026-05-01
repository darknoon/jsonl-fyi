import { test, expect, beforeEach } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { SettingsProvider, useSettings } from "./settings"

const KEY = "jsonl-fyi:settings"

beforeEach(() => {
  globalThis.localStorage?.clear?.()
})

function Probe() {
  const { renderMarkdown } = useSettings()
  return <span>{renderMarkdown ? "on" : "off"}</span>
}

test("default is renderMarkdown=true", () => {
  expect(
    renderToStaticMarkup(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    ),
  ).toBe("<span>on</span>")
})

test("reads existing value from localStorage", () => {
  globalThis.localStorage.setItem(KEY, JSON.stringify({ renderMarkdown: false }))
  expect(
    renderToStaticMarkup(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    ),
  ).toBe("<span>off</span>")
})

test("initial prop overrides localStorage (test-only)", () => {
  globalThis.localStorage.setItem(KEY, JSON.stringify({ renderMarkdown: true }))
  expect(
    renderToStaticMarkup(
      <SettingsProvider initial={{ renderMarkdown: false }}>
        <Probe />
      </SettingsProvider>,
    ),
  ).toBe("<span>off</span>")
})

function ViewModeProbe() {
  const { viewMode } = useSettings()
  return <span>{viewMode}</span>
}

test("default viewMode is 'normal'", () => {
  expect(
    renderToStaticMarkup(
      <SettingsProvider>
        <ViewModeProbe />
      </SettingsProvider>,
    ),
  ).toBe("<span>normal</span>")
})

test("reads existing viewMode from localStorage", () => {
  globalThis.localStorage.setItem(KEY, JSON.stringify({ viewMode: "compact" }))
  expect(
    renderToStaticMarkup(
      <SettingsProvider>
        <ViewModeProbe />
      </SettingsProvider>,
    ),
  ).toBe("<span>compact</span>")
})

test("legacy payload without viewMode upgrades to default 'normal'", () => {
  globalThis.localStorage.setItem(KEY, JSON.stringify({ renderMarkdown: false }))
  expect(
    renderToStaticMarkup(
      <SettingsProvider>
        <ViewModeProbe />
      </SettingsProvider>,
    ),
  ).toBe("<span>normal</span>")
})
