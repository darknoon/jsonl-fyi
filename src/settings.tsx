import { createContext, useContext, type ReactNode } from "react"

export type Settings = { renderMarkdown: boolean }

const Ctx = createContext<Settings>({ renderMarkdown: true })

export function SettingsProvider({
  initial,
  children,
}: {
  initial?: Settings
  children: ReactNode
}) {
  return <Ctx.Provider value={initial ?? { renderMarkdown: true }}>{children}</Ctx.Provider>
}

export function useSettings(): Settings {
  return useContext(Ctx)
}
