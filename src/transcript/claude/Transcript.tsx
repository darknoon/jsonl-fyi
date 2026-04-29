import type { ReactNode } from "react"
import type { Entry, ToolResult } from "../../types"
import { extractResult, getBlocks } from "./extractResult"
import { detectSkill } from "./detectSkill"
import { TextBlock } from "./TextBlock"
import { ThinkingBlock } from "../ThinkingBlock"
import { ImageBlock } from "../ImageBlock"
import { Tool } from "./Tool"
import { narrowToolUse } from "./toolTypes"

const EMPTY_RESULT: ToolResult = { text: "", images: [], toolRefs: [] }

export function Transcript({ entries }: { entries: Entry[] }) {
  // Pass 1: index tool results by their tool_use_id.
  const results = new Map<string, ToolResult>()
  for (const entry of entries) {
    for (const block of getBlocks(entry)) {
      if (block.type === "tool_result") {
        results.set(block.tool_use_id, extractResult(block))
      }
    }
  }

  // Pass 1b: absorb skill bodies into their Skill tool result as
  // `injectedText`. Claude's Skill tool emits a tool_use → tool_result, then
  // the very next user-text block is the full skill markdown injected by the
  // harness. Group it under the tool card instead of rendering it as a
  // separate (huge) bubble.
  const skipKeys = new Set<string>()
  let pendingSkillId: string | null = null
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (entry.type === "system") continue
    const role = entry.message?.role ?? entry.type
    const blocks = getBlocks(entry)
    for (let j = 0; j < blocks.length; j++) {
      const block = blocks[j]
      if (block.type === "tool_use" && block.name === "Skill") {
        pendingSkillId = block.id
        continue
      }
      if (block.type === "tool_result") continue
      if (pendingSkillId && role === "user" && block.type === "text") {
        const skill = detectSkill(block.text)
        if (skill) {
          const r = results.get(pendingSkillId) ?? { ...EMPTY_RESULT }
          results.set(pendingSkillId, { ...r, injectedText: skill.body })
          skipKeys.add(`${i}:${j}`)
        }
        pendingSkillId = null
        continue
      }
      pendingSkillId = null
    }
  }

  // Pass 2: render in order, skipping absorbed skill bodies.
  const nodes: ReactNode[] = []
  let key = 0
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (entry.type === "system") continue
    const role = entry.message?.role ?? entry.type
    const blocks = getBlocks(entry)
    for (let j = 0; j < blocks.length; j++) {
      const block = blocks[j]
      const k = key++
      if (skipKeys.has(`${i}:${j}`)) continue
      if (block.type === "text") {
        nodes.push(<TextBlock key={k} text={block.text} role={role} />)
      } else if (block.type === "thinking") {
        nodes.push(<ThinkingBlock key={k} text={block.thinking} />)
      } else if (block.type === "image") {
        nodes.push(<ImageBlock key={k} source={block.source} role={role} />)
      } else if (block.type === "tool_use") {
        const use = narrowToolUse(block)
        const output = results.get(block.id) ?? EMPTY_RESULT
        nodes.push(<Tool key={k} use={use} output={output} />)
      }
    }
  }

  return <div className="transcript">{nodes}</div>
}
