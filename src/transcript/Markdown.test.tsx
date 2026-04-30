import { test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { Markdown } from "./Markdown"
import { SettingsProvider } from "../settings"

const FIXTURE = readFileSync(
  join(import.meta.dir, "__fixtures__/markdown-sample.md"),
  "utf8",
)

function render(node: React.ReactNode, renderMarkdown = true): string {
  return renderToStaticMarkup(
    <SettingsProvider initial={{ renderMarkdown }}>{node}</SettingsProvider>,
  )
}

test("block mode renders fixture", () => {
  expect(render(<Markdown source={FIXTURE} />)).toMatchSnapshot()
})

test("block mode disallowed nodes become literal text", () => {
  const html = render(<Markdown source={FIXTURE} />)
  expect(html).toContain("![image](https://ex.com/i.png)")
  expect(html).toContain("[bad link](javascript:alert(1))")
  expect(html).toContain("&lt;b&gt;raw HTML&lt;/b&gt;")
  // safe link still becomes an <a>
  expect(html).toMatch(/<a [^>]*href="https:\/\/example\.com"/)
})

test("renderMarkdown=false returns source verbatim", () => {
  const html = render(<Markdown source={FIXTURE} />, false)
  // The raw source should appear inside the assistant-text wrapper
  expect(html).toContain("# H1")
  expect(html).toContain("**strong**")
  expect(html).not.toMatch(/<strong>strong<\/strong>/)
})

test("safe link gets target=_blank rel", () => {
  const html = render(<Markdown source="[x](https://e.com)" />)
  expect(html).toContain('target="_blank"')
  expect(html).toContain('rel="noreferrer noopener"')
})
