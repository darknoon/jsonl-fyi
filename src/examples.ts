// eslint-disable-next-line
// @ts-ignore — Bun handles `with { type: "text" }` at bundle time
import sampleJsonl from "./__fixtures__/sample.jsonl" with { type: "text" }

export type Example = {
  name: string
  fileName: string
  content: string
}

export const EXAMPLES: Example[] = [
  {
    name: "app header redesign",
    fileName: "sample.jsonl",
    content: sampleJsonl,
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

export type ExampleStats = {
  turns: number
  sizeBytes: number
}

export function exampleStats(content: string): ExampleStats {
  let turnDurations = 0
  let userTypedMessages = 0

  for (const raw of content.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    let obj: unknown
    try {
      obj = JSON.parse(line)
    } catch {
      continue
    }
    if (!obj || typeof obj !== "object") continue
    const o = obj as Record<string, unknown>

    if (o.type === "system" && o.subtype === "turn_duration") {
      turnDurations++
      continue
    }

    if (o.type === "user" && isUserTypedMessage(o)) {
      userTypedMessages++
    }
  }

  return {
    turns: turnDurations > 0 ? turnDurations : userTypedMessages,
    sizeBytes: content.length,
  }
}

function isUserTypedMessage(entry: Record<string, unknown>): boolean {
  const msg = entry.message as Record<string, unknown> | undefined
  if (!msg) return false
  const c = msg.content
  if (typeof c === "string") return true
  if (!Array.isArray(c)) return false
  return !c.some(
    b => b && typeof b === "object" && (b as { type?: unknown }).type === "tool_result",
  )
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
