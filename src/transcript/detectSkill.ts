// Recognize the system-injected text that appears when a Claude Code
// session loads a Skill. Format starts with:
//   "Base directory for this skill: <path>
//
//    # <Skill heading>
//    ..."
// We treat this as a non-user message: render a small chip with the
// skill name, expandable to show the full body.

export function detectSkill(text: string): { name: string; body: string } | null {
  const m = /^Base directory for this skill:\s*(\S[^\n]*)\s*\n+#\s+([^\n]+)/.exec(text)
  if (!m) return null
  const path = m[1].trim()
  const heading = m[2].trim()
  const name = path.split("/").filter(Boolean).pop() ?? heading
  return { name, body: text }
}
