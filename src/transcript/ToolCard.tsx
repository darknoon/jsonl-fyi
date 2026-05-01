import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useState,
  type ReactElement,
  type ReactNode,
} from "react"
import { useSettings } from "../settings"

type CardCtx = {
  expanded: boolean
  toggle: () => void
  hasContent: boolean
}

const Ctx = createContext<CardCtx | null>(null)

function useCard(): CardCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("ToolCard.* must be used inside <ToolCard.Root>")
  return ctx
}

function findChild(children: ReactNode, type: unknown): ReactElement | null {
  for (const c of Children.toArray(children)) {
    if (isValidElement(c) && c.type === type) return c
  }
  return null
}

function Root({
  hasContent = true,
  status,
  children,
}: {
  hasContent?: boolean
  status?: "success" | "error"
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const { viewMode } = useSettings()
  const statusClass = status ? ` tool-card-${status}` : ""

  const trigger = findChild(children, Trigger)
  const preview = findChild(children, Preview)
  const content = findChild(children, Content)

  // Pick which body to render below the trigger:
  // - expanded: prefer Content, fall back to Preview if no Content
  // - normal collapsed: Preview (or nothing if not declared)
  // - compact collapsed: nothing
  let body: ReactNode = null
  if (expanded) body = content ?? preview
  else if (viewMode === "normal") body = preview
  else body = null

  // Trigger is clickable iff toggling 'expanded' would change rendering.
  // - Content present → always clickable (compact: collapsed→content; normal: preview→content)
  // - No Content but Preview present and we're in compact mode → clickable (collapsed→preview)
  // - hasContent=false from caller (no inline body at all) → never clickable
  const clickable = hasContent && (content != null || (preview != null && viewMode === "compact"))

  return (
    <Ctx.Provider value={{ expanded, toggle: () => setExpanded((e) => !e), hasContent: clickable }}>
      <div className={`tool-card${statusClass}`}>
        {trigger}
        {body}
      </div>
    </Ctx.Provider>
  )
}

function Trigger({ children }: { children: ReactNode }) {
  const { toggle, hasContent } = useCard()
  return (
    <button
      className={`tool-row ${hasContent ? "clickable" : ""}`}
      onClick={() => hasContent && toggle()}
    >
      {children}
    </button>
  )
}

function Preview({ children, clickable = false }: { children: ReactNode; clickable?: boolean }) {
  const ctx = useContext(Ctx)
  const canToggle = clickable && ctx?.hasContent === true
  return (
    <div
      className={`tool-body tool-preview${canToggle ? " tool-preview-clickable" : ""}`}
      onClick={canToggle ? ctx?.toggle : undefined}
    >
      {children}
    </div>
  )
}

function Content({ children }: { children: ReactNode }) {
  return <div className="tool-body">{children}</div>
}

export const ToolCard = { Root, Trigger, Preview, Content }

export function useCardToggle(): () => void {
  const ctx = useContext(Ctx)
  // No-op outside a Root provider so consumers don't need a wrapper for
  // unit tests that render in isolation.
  return ctx?.toggle ?? (() => {})
}
