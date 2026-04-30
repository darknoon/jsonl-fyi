import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

export type Settings = { renderMarkdown: boolean }

type Ctx = Settings & { setRenderMarkdown: (v: boolean) => void }

const STORAGE_KEY = "jsonl-fyi:settings"
const DEFAULTS: Settings = { renderMarkdown: true }

const SettingsCtx = createContext<Ctx>({
  ...DEFAULTS,
  setRenderMarkdown: () => {},
})

function load(): Settings {
  if (typeof localStorage === "undefined") return DEFAULTS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<Settings>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return DEFAULTS
  }
}

function persist(s: Settings): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // ignore quota / privacy mode failures
  }
}

export function SettingsProvider({
  initial,
  children,
}: {
  initial?: Settings
  children: ReactNode
}) {
  // `initial` is for tests; in production the provider seeds from
  // localStorage on first render.
  const [settings, setSettings] = useState<Settings>(() => initial ?? load())

  useEffect(() => {
    if (initial) return // tests inject — do not overwrite their value
    persist(settings)
  }, [settings, initial])

  const value: Ctx = {
    ...settings,
    setRenderMarkdown: v => setSettings(s => ({ ...s, renderMarkdown: v })),
  }
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>
}

export function useSettings(): Ctx {
  return useContext(SettingsCtx)
}
