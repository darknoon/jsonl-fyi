// Examples are loaded asynchronously so the JSONL fixture text isn't shipped
// in the initial JS bundle. Each example carries pre-computed `turns` and
// `sizeBytes` so the row can render before the content is fetched. Bun
// code-splits each dynamic `import(..., { with: { type: "text" } })` into its
// own chunk, which the browser fetches only after the user clicks the row.

export type Example = {
  name: string
  fileName: string
  turns: number
  sizeBytes: number
  load: () => Promise<string>
}

async function loadText(promise: Promise<{ default: string }>): Promise<string> {
  const mod = await promise
  return mod.default
}

export const EXAMPLES: Example[] = [
  {
    name: "app header redesign",
    fileName: "0dc40511-6d23-4460-9e5b-ecb10e418fe7.jsonl",
    turns: 8,
    sizeBytes: 437659,
    load: () =>
      loadText(
        // eslint-disable-next-line
        // @ts-ignore — Bun handles dynamic `with { type: "text" }` at bundle time
        import("./__fixtures__/sample.jsonl", { with: { type: "text" } }),
      ),
  },
  {
    name: "codex: app header redesign",
    fileName: "rollout-2026-04-29T21-53-05-019ddc16-f5f2-7940-8892-8495d619b213.jsonl",
    turns: 20,
    sizeBytes: 776298,
    load: () =>
      loadText(
        // eslint-disable-next-line
        // @ts-ignore — Bun handles dynamic `with { type: "text" }` at bundle time
        import("./__fixtures__/codex-sample.jsonl", { with: { type: "text" } }),
      ),
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
