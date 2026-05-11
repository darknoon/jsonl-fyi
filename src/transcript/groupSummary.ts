export type Category =
  | "command"
  | "edit"
  | "create"
  | "delete"
  | "read"
  | "search"
  | "web_fetch"
  | "web_search"
  | "subagent"
  | "subagent_comm"
  | "todo"
  | "skill"

export type SummaryCounts = Partial<Record<Category, number>>

const ORDER: Category[] = [
  "command",
  "edit",
  "create",
  "delete",
  "read",
  "search",
  "web_fetch",
  "web_search",
  "subagent",
  "subagent_comm",
  "todo",
  "skill",
]

type Phrase = { verb: string; noun: string; nounPlural: string }

const PHRASES: Record<Category, Phrase> = {
  command:       { verb: "ran",              noun: "command",   nounPlural: "commands" },
  edit:          { verb: "edited",           noun: "file",      nounPlural: "files" },
  create:        { verb: "created",          noun: "file",      nounPlural: "files" },
  delete:        { verb: "deleted",          noun: "file",      nounPlural: "files" },
  read:          { verb: "read",             noun: "file",      nounPlural: "files" },
  search:        { verb: "searched",         noun: "time",      nounPlural: "times" },
  web_fetch:     { verb: "fetched",          noun: "URL",       nounPlural: "URLs" },
  web_search:    { verb: "searched the web", noun: "time",      nounPlural: "times" },
  subagent:      { verb: "started",          noun: "subagent",  nounPlural: "subagents" },
  subagent_comm: { verb: "messaged",         noun: "subagent",  nounPlural: "subagents" },
  todo:          { verb: "updated",          noun: "todo item", nounPlural: "todo items" },
  skill:         { verb: "loaded",           noun: "skill",     nounPlural: "skills" },
}

function phraseFor(cat: Category, n: number): string {
  const { verb, noun, nounPlural } = PHRASES[cat]
  return `${verb} ${n} ${n === 1 ? noun : nounPlural}`
}

function thinkingPhrase(n: number, capitalize: boolean): string {
  const verb = capitalize ? "Thought" : "thought"
  return n === 1 ? verb : `${verb} ${n} times`
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function renderProseSummary(
  counts: SummaryCounts,
  thinkingCount: number,
): string | null {
  const parts: string[] = []
  for (const cat of ORDER) {
    const n = counts[cat] ?? 0
    if (n > 0) parts.push(phraseFor(cat, n))
  }

  if (parts.length === 0) {
    if (thinkingCount > 0) return thinkingPhrase(thinkingCount, true)
    return null
  }

  parts[0] = capitalizeFirst(parts[0])
  if (thinkingCount > 0) parts.push(thinkingPhrase(thinkingCount, false))

  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}
