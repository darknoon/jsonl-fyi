import type { Category, SummaryCounts } from "../groupSummary"
import type { CodexGroupItem } from "./buildCodexItems"
import { parseV4A } from "./v4a"

// Function-call `name` → category for codex.
// See docs/superpowers/specs/2026-05-11-prose-tool-summary.md.
// apply_patch is handled per-file (not in this table) since one call may
// contribute to multiple categories.
const CODEX_CATEGORIES: Record<string, Category> = {
  shell: "command",
  shell_command: "command",
  exec_command: "command",
  local_shell: "command",
  write_stdin: "command",
  view_image: "read",
  update_plan: "todo",
  spawn_agent: "subagent",
  followup_task: "subagent_comm",
  resume_agent: "subagent_comm",
  send_input: "subagent_comm",
  send_message: "subagent_comm",
  close_agent: "subagent_comm",
  wait_agent: "command",
  list_agents: "command",
  web_search: "web_search",
  list_mcp_resources: "command",
  list_mcp_resource_templates: "command",
  read_mcp_resource: "command",
  request_permissions: "command",
  request_user_input: "command",
  request_plugin_install: "command",
}

export function categorizeCodexTool(name: string): Category {
  return CODEX_CATEGORIES[name] ?? "command"
}

function bump(counts: SummaryCounts, cat: Category, n = 1): void {
  counts[cat] = (counts[cat] ?? 0) + n
}

export function summarizeCodexGroup(items: CodexGroupItem[]): {
  counts: SummaryCounts
  thinkingCount: number
} {
  const counts: SummaryCounts = {}
  let thinkingCount = 0
  for (const it of items) {
    if (it.kind === "thinking") {
      thinkingCount++
      continue
    }
    // apply_patch: per-file routing based on V4A op
    if (it.name === "apply_patch") {
      const p = it.entry.payload
      const input = p.type === "custom_tool_call" ? p.input : ""
      const parsed = parseV4A(input ?? "")
      if ("files" in parsed && parsed.files.length > 0) {
        for (const f of parsed.files) {
          if (f.op === "add") bump(counts, "create")
          else if (f.op === "update") bump(counts, "edit")
          else if (f.op === "delete") bump(counts, "delete")
        }
        continue
      }
      // Unparseable/empty patch — fall through to a single edit (best guess)
      bump(counts, "edit")
      continue
    }
    bump(counts, categorizeCodexTool(it.name))
  }
  return { counts, thinkingCount }
}
