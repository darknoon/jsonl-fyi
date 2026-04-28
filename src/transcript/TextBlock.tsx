import { Icons } from "./toolMeta"

export function TextBlock({ text, role }: { text: string; role?: string }) {
  if (!text.trim()) return null
  if (role === "user") return <div className="user-bubble">{text}</div>
  return (
    <div className="assistant-row">
      <Icons.Robot size={16} className="icon-muted" />
      <span>{text}</span>
    </div>
  )
}
