// Best-guess input shapes for Claude Code's built-in tools, based on the
// author's experience using them (this file is drafted by Claude Code
// itself). A subsequent script (scripts/infer-tool-schemas.ts) verifies
// these against real `.jsonl` sessions and prints any drift.
//
// Optional fields use `?:`. Fields that I suspect exist but I'm unsure
// about are commented `// rare`. Anything tagged `unknown` means I think
// it's defined by the tool but I don't remember the exact shape.

// ---------------------------------------------------------------------------
// File / shell tools
// ---------------------------------------------------------------------------

export type BashInput = {
  command: string
  description?: string
  timeout?: number // ms; default 120_000
  run_in_background?: boolean
  dangerouslyDisableSandbox?: boolean
}

export type ReadInput = {
  file_path: string
  offset?: number // 1-based line number to start at
  limit?: number // max lines to read
  pages?: string // PDF page range like "1-5" or "3"
}

export type EditInput = {
  file_path: string
  old_string: string
  new_string: string
  replace_all?: boolean
}

export type MultiEditInput = {
  file_path: string
  edits: Array<{
    old_string: string
    new_string: string
    replace_all?: boolean
  }>
}

export type WriteInput = {
  file_path: string
  content: string
}

export type GlobInput = {
  pattern: string
  path?: string
}

export type GrepInput = {
  pattern: string
  path?: string
  glob?: string
  type?: string // language/file-type shortcut, e.g. "ts", "py"
  output_mode?: "content" | "files_with_matches" | "count"
  "-i"?: boolean // case-insensitive
  "-n"?: boolean // include line numbers
  "-A"?: number // lines after match
  "-B"?: number // lines before match
  "-C"?: number // lines before+after match
  head_limit?: number
  multiline?: boolean
}

// ---------------------------------------------------------------------------
// Web tools
// ---------------------------------------------------------------------------

export type WebFetchInput = {
  url: string
  prompt: string
}

export type WebSearchInput = {
  query: string
  allowed_domains?: string[]
  blocked_domains?: string[]
}

// ---------------------------------------------------------------------------
// Agent / orchestration
// ---------------------------------------------------------------------------

// "Agent" and "Task" are the same tool across Claude Code versions; older
// transcripts may use either name. Same input shape.
export type AgentInput = {
  description: string
  prompt: string
  subagent_type?: string
  model?: "sonnet" | "haiku" | "opus" | string
  mode?: string // permission mode, e.g. "plan", "acceptEdits"
  team_name?: string
  name?: string
  isolation?: "worktree"
  run_in_background?: boolean
}

// ---------------------------------------------------------------------------
// Todo / planning
// ---------------------------------------------------------------------------

export type TodoWriteInput = {
  todos: Array<{
    content: string
    status: "pending" | "in_progress" | "completed"
    activeForm: string
  }>
}

export type ExitPlanModeInput = {
  plan: string
}

// Best guess: no required input, just signals the mode switch. Verify.
export type EnterPlanModeInput = Record<string, never>

// ---------------------------------------------------------------------------
// Notebooks
// ---------------------------------------------------------------------------

export type NotebookEditInput = {
  notebook_path: string
  new_source: string
  cell_id?: string
  cell_type?: "code" | "markdown"
  edit_mode?: "replace" | "insert" | "delete"
}

// ---------------------------------------------------------------------------
// Tool / skill system
// ---------------------------------------------------------------------------

export type ToolSearchInput = {
  query: string
  max_results?: number
}

export type SkillInput = {
  skill: string
  args?: string
}

// ---------------------------------------------------------------------------
// Background tasks
// ---------------------------------------------------------------------------

export type TaskCreateInput = {
  subject: string
  description?: string
}

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

export type KnownToolUse =
  | { name: "Bash"; input: BashInput }
  | { name: "Read"; input: ReadInput }
  | { name: "Edit"; input: EditInput }
  | { name: "MultiEdit"; input: MultiEditInput }
  | { name: "Write"; input: WriteInput }
  | { name: "Glob"; input: GlobInput }
  | { name: "Grep"; input: GrepInput }
  | { name: "WebFetch"; input: WebFetchInput }
  | { name: "WebSearch"; input: WebSearchInput }
  | { name: "Task"; input: AgentInput }
  | { name: "Agent"; input: AgentInput }
  | { name: "TodoWrite"; input: TodoWriteInput }
  | { name: "EnterPlanMode"; input: EnterPlanModeInput }
  | { name: "ExitPlanMode"; input: ExitPlanModeInput }
  | { name: "NotebookEdit"; input: NotebookEditInput }
  | { name: "ToolSearch"; input: ToolSearchInput }
  | { name: "Skill"; input: SkillInput }
  | { name: "TaskCreate"; input: TaskCreateInput }

// MCP tools follow the convention `mcp__<server>__<tool>` and have
// server-defined inputs we can't statically type. Any unrecognized name
// falls into this bucket.
export type UnknownToolUse = {
  name: string
  input: Record<string, unknown>
}

export type ToolUse = KnownToolUse | UnknownToolUse

const KNOWN_NAMES = new Set<KnownToolUse["name"]>([
  "Bash",
  "Read",
  "Edit",
  "MultiEdit",
  "Write",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "Task",
  "Agent",
  "TodoWrite",
  "EnterPlanMode",
  "ExitPlanMode",
  "NotebookEdit",
  "ToolSearch",
  "Skill",
  "TaskCreate",
])

// Narrow an untyped tool_use block (raw from JSONL) into the discriminated
// union. We trust `name` to discriminate `input`; if Claude Code ever ships
// a known tool with a different shape, it'll surface as a runtime error in
// the body component, which is the right place to notice.
export function narrowToolUse(block: { name: string; input: Record<string, unknown> }): ToolUse {
  if (KNOWN_NAMES.has(block.name as KnownToolUse["name"])) {
    return block as KnownToolUse
  }
  return block as UnknownToolUse
}

export function isKnownToolUse(use: ToolUse): use is KnownToolUse {
  return KNOWN_NAMES.has(use.name as KnownToolUse["name"])
}
