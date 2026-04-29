import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react"

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

function Root({
  hasContent = true,
  children,
}: {
  hasContent?: boolean
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <Ctx.Provider
      value={{ expanded, toggle: () => setExpanded(e => !e), hasContent }}
    >
      <div className="tool-card">{children}</div>
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

function Content({ children }: { children: ReactNode }) {
  const { expanded, hasContent } = useCard()
  if (!expanded || !hasContent) return null
  return <div className="tool-body">{children}</div>
}

export const ToolCard = { Root, Trigger, Content }
