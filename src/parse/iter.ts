export function* iterJsonlLines(text: string): Generator<unknown, { skipped: number }, void> {
  let skipped = 0
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    try {
      yield JSON.parse(line)
    } catch {
      skipped++
    }
  }
  return { skipped }
}

// A file can exceed the browser's maximum string length even when every JSONL
// record fits comfortably. Decode chunks and assemble only one record at a time.
export async function* iterJsonlStream(
  stream: ReadableStream<Uint8Array>,
  options: {
    signal?: AbortSignal
    onProgress?: (bytes: number) => void
    onText?: (chunk: string) => void
  } = {},
): AsyncGenerator<unknown, { skipped: number }, void> {
  const { signal, onProgress, onText } = options
  signal?.throwIfAborted()
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let fragments: string[] = []
  let skipped = 0
  let bytes = 0
  let finished = false
  let lastYield = performance.now()
  const abort = () => {
    void reader.cancel(signal?.reason).catch(() => {})
  }
  signal?.addEventListener("abort", abort, { once: true })

  try {
    while (true) {
      signal?.throwIfAborted()
      const result = await reader.read()
      signal?.throwIfAborted()
      finished = result.done
      const chunk = result.done ? decoder.decode() : decoder.decode(result.value, { stream: true })
      onText?.(chunk)
      let start = 0
      let end: number
      while ((end = chunk.indexOf("\n", start)) !== -1) {
        fragments.push(chunk.slice(start, end))
        const line = fragments.join("").trim()
        fragments = []
        start = end + 1
        if (!line) continue
        let value: unknown
        try {
          value = JSON.parse(line)
        } catch {
          skipped++
          continue
        }
        yield value
        signal?.throwIfAborted()
      }
      if (start < chunk.length) fragments.push(chunk.slice(start))
      if (result.done) break
      bytes += result.value.byteLength
      onProgress?.(bytes)
      // Cached file reads can resolve without yielding a browser task. Give
      // progress updates and a user's cancellation a chance to run during parsing.
      if (performance.now() - lastYield >= 16) {
        await new Promise((resolve) => setTimeout(resolve, 0))
        lastYield = performance.now()
      }
    }
    const finalLine = fragments.join("").trim()
    if (finalLine) {
      let value: unknown
      let valid = true
      try {
        value = JSON.parse(finalLine)
      } catch {
        skipped++
        valid = false
      }
      if (valid) yield value
    }
    signal?.throwIfAborted()
    return { skipped }
  } finally {
    signal?.removeEventListener("abort", abort)
    if (!finished) await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
