export type ModelDisplay = {
  label: string
  raw: string
}

const CLAUDE_RE = /^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?(?:-\d{6,})?$/

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function formatClaudeModel(raw: string): ModelDisplay {
  const m = CLAUDE_RE.exec(raw)
  if (!m) return { label: raw, raw }
  const family = titleCase(m[1])
  const major = m[2]
  const minor = m[3]
  const label = minor != null ? `${family} ${major}.${minor}` : `${family} ${major}`
  return { label, raw }
}
