// Examples load asynchronously so JSONL fixture text isn't shipped in the
// initial JS bundle. Each `import ... with { type: "file" }` makes Bun copy
// the fixture into the build output as a static asset and replaces the
// import with the asset's URL string. The asset is fetched only when the
// user clicks the row.
//
// We previously used `import(..., { with: { type: "text" } })` which works
// in dev but emits a native dynamic import in production — browsers don't
// support `type: "text"` natively, so the live site failed with
// `TypeError: "text" is not a valid module type`.

// eslint-disable-next-line
// @ts-ignore — Bun handles `with { type: "file" }` at bundle time
import sampleUrl from "./__fixtures__/sample.jsonl" with { type: "file" }
// eslint-disable-next-line
// @ts-ignore — Bun handles `with { type: "file" }` at bundle time
import codexSampleUrl from "./__fixtures__/codex-sample.jsonl" with { type: "file" }

export type Example = {
  name: string
  fileName: string
  turns: number
  sizeBytes: number
  load: () => Promise<string>
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load example: ${res.status}`)
  return res.text()
}

export const EXAMPLES: Example[] = [
  {
    name: "app header redesign",
    fileName: "0dc40511-6d23-4460-9e5b-ecb10e418fe7.jsonl",
    turns: 8,
    sizeBytes: 437659,
    load: () => fetchText(sampleUrl as string),
  },
  {
    name: "codex: app header redesign",
    fileName: "rollout-2026-04-29T21-53-05-019ddc16-f5f2-7940-8892-8495d619b213.jsonl",
    turns: 20,
    sizeBytes: 776298,
    load: () => fetchText(codexSampleUrl as string),
  },
]

export function exampleHref(example: Example): string {
  return `/examples/${encodeURIComponent(example.fileName)}`
}

export function findExampleByPath(pathname: string): Example | null {
  const prefix = "/examples/"
  if (!pathname.startsWith(prefix)) return null

  const encodedFileName = pathname.slice(prefix.length)
  if (!encodedFileName) return null

  let fileName: string
  try {
    fileName = decodeURIComponent(encodedFileName)
  } catch {
    return null
  }

  return EXAMPLES.find(example => example.fileName === fileName) ?? null
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
