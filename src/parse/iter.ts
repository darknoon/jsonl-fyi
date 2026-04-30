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
