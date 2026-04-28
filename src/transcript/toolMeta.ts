import {
  Brain,
  Robot,
  File as FileIcon,
  PencilSimple,
  GitDiff,
  Terminal,
  MagnifyingGlass,
  Paperclip,
  Circle,
  type Icon,
} from "@phosphor-icons/react"
import type { KnownToolUse } from "./toolTypes"

// Type-driven alignment: PAST and ICONS must contain an entry for every
// tool name in the `KnownToolUse` discriminated union. If you add a tool
// to toolTypes.ts, TypeScript will refuse to compile until you add its
// label/icon here too.
type KnownToolName = KnownToolUse["name"]

const PAST: Record<KnownToolName, string> = {
  Bash: "Ran command",
  Read: "Read",
  Edit: "Edited",
  MultiEdit: "Edited",
  Write: "Wrote",
  Glob: "Searched files",
  Grep: "Searched code",
  WebFetch: "Fetched",
  WebSearch: "Searched",
  Task: "Ran task",
  Agent: "Ran agent",
  TodoWrite: "Updated todos",
  ExitPlanMode: "Exited plan mode",
  EnterPlanMode: "Entered plan mode",
  NotebookEdit: "Edited notebook",
  ToolSearch: "Searched tools",
  Skill: "Loaded skill",
}

const ICONS: Record<KnownToolName, { Icon: Icon; color: string }> = {
  Bash: { Icon: Terminal, color: "tool-muted" },
  Read: { Icon: FileIcon, color: "tool-blue" },
  Edit: { Icon: PencilSimple, color: "tool-amber" },
  MultiEdit: { Icon: PencilSimple, color: "tool-amber" },
  Write: { Icon: PencilSimple, color: "tool-amber" },
  Glob: { Icon: MagnifyingGlass, color: "tool-green" },
  Grep: { Icon: MagnifyingGlass, color: "tool-green" },
  WebFetch: { Icon: Paperclip, color: "tool-violet" },
  WebSearch: { Icon: MagnifyingGlass, color: "tool-green" },
  Task: { Icon: GitDiff, color: "tool-violet" },
  Agent: { Icon: GitDiff, color: "tool-violet" },
  TodoWrite: { Icon: PencilSimple, color: "tool-amber" },
  ExitPlanMode: { Icon: Circle, color: "tool-muted" },
  EnterPlanMode: { Icon: Circle, color: "tool-muted" },
  NotebookEdit: { Icon: PencilSimple, color: "tool-amber" },
  ToolSearch: { Icon: MagnifyingGlass, color: "tool-green" },
  Skill: { Icon: Paperclip, color: "tool-violet" },
}

function isKnownTool(name: string): name is KnownToolName {
  return name in ICONS
}

export function shortPath(p: string): string {
  if (typeof p !== "string") return ""
  const parts = p.split("/")
  return parts.length > 2 ? `.../${parts.slice(-2).join("/")}` : parts.join("/")
}

export function toolLabel(name: string, title: string): string {
  if (name === "Bash") return title ? shortPath(title) : "Done"
  const verb = isKnownTool(name) ? PAST[name] : `Ran ${name}`
  return title ? `${verb} ${shortPath(title)}` : verb
}

function asString(input: Record<string, unknown>, key: string): string {
  const v = input[key]
  return typeof v === "string" ? v : ""
}

// Per-tool title extraction. Keys come from the typed input shapes in
// `toolTypes.ts` — no casts. Unknown tool names get an empty title.
export function toolTitle({
  name,
  input,
}: {
  name: string
  input: Record<string, unknown>
}): string {
  switch (name) {
    case "Bash":
      return asString(input, "command")
    case "Read":
    case "Edit":
    case "MultiEdit":
    case "Write":
      return asString(input, "file_path")
    case "Glob":
    case "Grep":
      return asString(input, "pattern")
    case "WebFetch":
      return asString(input, "url")
    case "WebSearch":
    case "ToolSearch":
      return asString(input, "query")
    case "Task":
    case "Agent":
      return asString(input, "description")
    case "NotebookEdit":
      return asString(input, "notebook_path")
    case "Skill":
      return asString(input, "skill")
    default:
      return ""
  }
}

export function iconFor(name: string): { Icon: Icon; color: string } {
  return isKnownTool(name)
    ? ICONS[name]
    : { Icon: Terminal, color: "tool-muted" }
}

export const Icons = { Brain, Robot, Circle }
