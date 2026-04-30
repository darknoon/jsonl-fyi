import type { Entry, ToolResult } from "../../types"
import { extractResult, getBlocks } from "./extractResult"
import { detectSkill } from "./detectSkill"
import { TranscriptHeader } from "../TranscriptHeader"
import { TurnSeparator } from "../TurnSeparator"
import { buildTranscriptItems } from "../timing"
import { EntryView } from "./EntryView"

const EMPTY_RESULT: ToolResult = {
  text: "",
  images: [],
  toolRefs: [],
  isError: false,
}

export function ClaudeCodeTranscript({ entries }: { entries: Entry[] }) {
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
  for (const entry of entries) {
    if (entry.type === "system") continue
    if (!entry.uuid) continue
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
          skipKeys.add(`${entry.uuid}:${j}`)
        }
        pendingSkillId = null
        continue
      }
      pendingSkillId = null
    }
  }

  const items = buildTranscriptItems(entries)
  return (
    <div className="transcript">
      {items.map((item, idx) => {
        switch (item.kind) {
          case "header":
            return (
              <TranscriptHeader
                key={`hdr-${idx}`}
                startTimestamp={item.chatStartIso}
              />
            )
          case "separator":
            return (
              <TurnSeparator
                key={`sep-${item.afterUuid}`}
                durationMs={item.durationMs}
                usage={item.usage}
              />
            )
          case "entry":
            return (
              <EntryView
                key={item.entry.uuid ?? `entry-${idx}`}
                entry={item.entry}
                results={results}
                skipKeys={skipKeys}
              />
            )
        }
      })}
    </div>
  )
}
