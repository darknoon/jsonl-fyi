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

const PAST: Record<string, string> = {
  Read: "Read",
  Write: "Wrote",
  Edit: "Edited",
  MultiEdit: "Edited",
  Bash: "Ran command",
  Glob: "Searched files",
  Grep: "Searched code",
  WebFetch: "Fetched",
  WebSearch: "Searched",
  Task: "Ran task",
  TodoWrite: "Updated todos",
}

export function shortPath(p: string): string {
  if (typeof p !== "string") return ""
  const parts = p.split("/")
  return parts.length > 2 ? `.../${parts.slice(-2).join("/")}` : parts.join("/")
}

export function toolLabel(name: string, title: string): string {
  if (name === "Bash") return title ? shortPath(title) : "Done"
  const verb = PAST[name] ?? `Ran ${name}`
  return title ? `${verb} ${shortPath(title)}` : verb
}

export function toolTitle(input: Record<string, unknown>): string {
  const v =
    (input?.file_path as string | undefined) ??
    (input?.command as string | undefined) ??
    (input?.pattern as string | undefined) ??
    (input?.script as string | undefined) ??
    ""
  return typeof v === "string" ? v : ""
}

const ICONS: Record<string, { Icon: Icon; color: string }> = {
  Read: { Icon: FileIcon, color: "tool-blue" },
  Write: { Icon: PencilSimple, color: "tool-amber" },
  Edit: { Icon: PencilSimple, color: "tool-amber" },
  MultiEdit: { Icon: PencilSimple, color: "tool-amber" },
  Bash: { Icon: Terminal, color: "tool-muted" },
  Glob: { Icon: MagnifyingGlass, color: "tool-green" },
  Grep: { Icon: MagnifyingGlass, color: "tool-green" },
  WebFetch: { Icon: Paperclip, color: "tool-violet" },
  WebSearch: { Icon: MagnifyingGlass, color: "tool-green" },
  Task: { Icon: GitDiff, color: "tool-violet" },
}

export function iconFor(name: string): { Icon: Icon; color: string } {
  return ICONS[name] ?? { Icon: Terminal, color: "tool-muted" }
}

export const Icons = { Brain, Robot, Circle }
