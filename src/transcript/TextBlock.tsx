import { detectSkill } from "./detectSkill"
import { SkillBlock } from "./SkillBlock"

export function TextBlock({ text, role }: { text: string; role?: string }) {
  if (!text.trim()) return null
  if (role === "user") {
    const skill = detectSkill(text)
    if (skill) return <SkillBlock name={skill.name} body={skill.body} />
    return <div className="user-bubble">{text}</div>
  }
  return <div className="assistant-text">{text}</div>
}
