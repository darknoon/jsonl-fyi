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

export function parseFrontmatter(text: string): Record<string, string> | undefined {
  if (!text) return undefined
  const lines = text.split("\n")
  if (lines[0] !== "---") return undefined
  let endIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      endIdx = i
      break
    }
  }
  if (endIdx === -1) return undefined

  const out: Record<string, string> = {}
  let currentKey: string | null = null
  for (let i = 1; i < endIdx; i++) {
    const line = lines[i]
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line)
    if (m) {
      currentKey = m[1]
      out[currentKey] = m[2].trim()
    } else if (currentKey && /^\s+\S/.test(line)) {
      const trimmed = line.trim()
      out[currentKey] = out[currentKey] ? `${out[currentKey]} ${trimmed}` : trimmed
    } else if (line.trim() === "") {
      currentKey = null
    }
  }
  return out
}
