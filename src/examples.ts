// Examples load asynchronously so JSONL fixture text isn't shipped in the
// initial JS bundle. The `?url` suffix tells Vite to copy the fixture into
// the build output as a static asset and replace the import with the
// asset's URL string. The asset is fetched only when the user clicks the
// row.
import sampleUrl from "./__fixtures__/sample.jsonl?url"
import codexSampleUrl from "./__fixtures__/codex-sample.jsonl?url"
import piSampleUrl from "./__fixtures__/019de00a-80cd-72e8-a9aa-47ac24e53f40.jsonl?url"

export type Example = {
  name: string
  fileName: string
  format: "claude" | "codex" | "pi"
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
    name: "Centering the filename in the header",
    fileName: "0dc40511-6d23-4460-9e5b-ecb10e418fe7.jsonl",
    format: "claude",
    turns: 8,
    sizeBytes: 437659,
    load: () => fetchText(sampleUrl),
  },
  {
    name: "Implementing the header alignment fixes",
    fileName: "rollout-2026-04-29T21-53-05-019ddc16-f5f2-7940-8892-8495d619b213.jsonl",
    format: "codex",
    turns: 20,
    sizeBytes: 776298,
    load: () => fetchText(codexSampleUrl),
  },
  {
    name: "Building a FigJam to Markdown extension",
    fileName: "019de00a-80cd-72e8-a9aa-47ac24e53f40.jsonl",
    format: "pi",
    turns: 20,
    sizeBytes: 1405062,
    load: () => fetchText(piSampleUrl),
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

  return EXAMPLES.find((example) => example.fileName === fileName) ?? null
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
