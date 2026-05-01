export function tailLines(text: string, n: number): { text: string; remaining: number } {
  if (!text) return { text: "", remaining: 0 }
  const trimmed = text.endsWith("\n") ? text.slice(0, -1) : text
  const lines = trimmed.split("\n")
  if (lines.length <= n) return { text: trimmed, remaining: 0 }
  return { text: lines.slice(-n).join("\n"), remaining: lines.length - n }
}

export function headLines(text: string, n: number): { text: string; remaining: number } {
  if (!text) return { text: "", remaining: 0 }
  const trimmed = text.endsWith("\n") ? text.slice(0, -1) : text
  const lines = trimmed.split("\n")
  if (lines.length <= n) return { text: trimmed, remaining: 0 }
  return { text: lines.slice(0, n).join("\n"), remaining: lines.length - n }
}
