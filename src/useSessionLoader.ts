import { useCallback, useEffect, useRef, useState } from "react"
import { EXAMPLES, exampleHref, findExampleByPath, type Example } from "./examples"
import { classifyJsonl, detectGrokCompanion } from "./parse/classify"
import { iterJsonlLines } from "./parse/iter"
import { loadSessionFile, type LoadedSession } from "./parse/loadSessionFile"
import { parseJsonl } from "./transcript/claude/parse"
import { parseCodexEntries } from "./transcript/codex/parse"
import { parsePiEntries } from "./transcript/pi/parse"
import { parseGrokEntries } from "./transcript/grok/parse"

const STORAGE_KEY = "jsonl-fyi:last"
const STORAGE_LIMIT_BYTES = 4_000_000 // ~4 MB; sessionStorage caps around 5 MB
export const GROK_PROTOTYPE_PATH = "/examples/grok-build-prototype"

function unsupportedFileMessage(name: string, grokCompanion: string | null | undefined): string {
  return grokCompanion
    ? "Drop chat_history.jsonl from the same folder."
    : `Couldn't parse ${name} as a Claude Code, OpenAI Codex, pi, or Grok Build CLI JSONL file`
}

export function useSessionLoader() {
  const [session, setSession] = useState<LoadedSession | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [skipped, setSkipped] = useState(0)
  const [dropError, setDropError] = useState<string | null>(null)
  const [loadingFile, setLoadingFile] = useState<{ name: string; percent: number } | null>(null)
  const fileLoadRef = useRef<AbortController | null>(null)
  const loadRequestRef = useRef(0)

  const loadText = useCallback((text: string, name: string, persist = true) => {
    const allLines: unknown[] = []
    const it = iterJsonlLines(text)
    let result = it.next()
    while (!result.done) {
      allLines.push(result.value)
      result = it.next()
    }
    const skippedCount = result.value.skipped

    const format = classifyJsonl(allLines.slice(0, 10))
    if (format === "codex") {
      setSession({ format: "codex", entries: parseCodexEntries(allLines) })
      setDropError(null)
    } else if (format === "pi") {
      setSession({ format: "pi", session: parsePiEntries(allLines) })
      setDropError(null)
    } else if (format === "grok") {
      setSession({ format: "grok", session: parseGrokEntries(allLines) })
      setDropError(null)
    } else if (format === "claude") {
      // parseJsonl re-parses the text; small overhead, fine for now.
      const r = parseJsonl(text)
      setSession({ format: "claude", entries: r.entries })
      setDropError(null)
    } else {
      setSession(null)
      setDropError(unsupportedFileMessage(name, detectGrokCompanion(allLines)))
    }
    setFileName(name)
    setSkipped(skippedCount)
    if (persist) {
      try {
        if (text.length < STORAGE_LIMIT_BYTES) {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ name, text }))
        } else {
          sessionStorage.removeItem(STORAGE_KEY)
        }
      } catch {
        // sessionStorage may throw (quota, disabled). Non-fatal.
      }
    }
  }, [])

  const cancelFileLoad = useCallback(() => {
    loadRequestRef.current++
    fileLoadRef.current?.abort()
    fileLoadRef.current = null
    setLoadingFile(null)
  }, [])

  const loadFile = useCallback(
    async (file: File) => {
      cancelFileLoad()
      const request = loadRequestRef.current
      const controller = new AbortController()
      fileLoadRef.current = controller
      setDropError(null)
      setLoadingFile({ name: file.name, percent: 0 })
      let lastPercent = 0
      try {
        const loaded = await loadSessionFile(file, {
          signal: controller.signal,
          onProgress(bytes) {
            const percent = file.size === 0 ? 100 : Math.floor((bytes / file.size) * 100)
            if (request === loadRequestRef.current && percent !== lastPercent) {
              lastPercent = percent
              setLoadingFile({ name: file.name, percent })
            }
          },
        })
        if (request !== loadRequestRef.current) return
        // Push a history entry so the browser back button returns to the picker.
        if (!session && window.location.pathname === "/") {
          window.history.pushState({ jsonlFyiLoaded: true }, "", window.location.href)
        }
        setSession(loaded.session)
        setFileName(file.name)
        setSkipped(loaded.skipped)
        setDropError(
          loaded.session ? null : unsupportedFileMessage(file.name, loaded.grokCompanion),
        )
        try {
          if (loaded.text !== undefined) {
            sessionStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({ name: file.name, text: loaded.text }),
            )
          } else {
            sessionStorage.removeItem(STORAGE_KEY)
          }
        } catch {
          // Storage is optional, and large files are never persisted.
        }
      } catch (error) {
        if (request !== loadRequestRef.current) return
        setSession(null)
        const detail = error instanceof Error ? `: ${error.message}` : ". Please try again."
        setDropError(`Couldn't read ${file.name}${detail}`)
      } finally {
        if (request === loadRequestRef.current) {
          fileLoadRef.current = null
          setLoadingFile(null)
        }
      }
    },
    [cancelFileLoad, session],
  )

  const reset = useCallback(
    (clearUrl = false) => {
      cancelFileLoad()
      setSession(null)
      setFileName(null)
      setSkipped(0)
      if (clearUrl && window.location.pathname !== "/") {
        window.history.pushState(null, "", "/")
      }
      try {
        sessionStorage.removeItem(STORAGE_KEY)
      } catch {
        // ignore
      }
    },
    [cancelFileLoad],
  )

  const loadTextSource = useCallback(
    async (
      source: Pick<Example, "fileName" | "load">,
      pathname: string,
      updateHistory: boolean,
    ) => {
      cancelFileLoad()
      const request = loadRequestRef.current
      if (updateHistory) {
        window.history.pushState(null, "", pathname)
      }
      const text = await source.load()
      if (request !== loadRequestRef.current) return
      loadText(text, source.fileName, false)
    },
    [cancelFileLoad, loadText],
  )

  const loadExample = useCallback(
    (example: Example, updateHistory = true) =>
      loadTextSource(example, exampleHref(example), updateHistory),
    [loadTextSource],
  )

  const loadGrokPrototype = useCallback(
    async (updateHistory = true) => {
      if (!import.meta.env.DEV) return
      await loadTextSource(
        {
          fileName: "chat_history.jsonl",
          load: async () =>
            (await import("./__fixtures__/grok/recipe-planner/chat_history.jsonl?raw")).default,
        },
        GROK_PROTOTYPE_PATH,
        updateHistory,
      )
    },
    [loadTextSource],
  )

  useEffect(
    () => () => {
      loadRequestRef.current++
      fileLoadRef.current?.abort()
    },
    [],
  )

  useEffect(() => {
    async function loadCurrentLocation(restoreSession: boolean) {
      if (import.meta.env.DEV && window.location.pathname === GROK_PROTOTYPE_PATH) {
        await loadGrokPrototype(false)
        return
      }
      const routeExample = findExampleByPath(window.location.pathname)
      if (routeExample) {
        await loadExample(routeExample, false)
        return
      }

      if (!restoreSession) {
        reset(false)
        return
      }

      const params = new URLSearchParams(window.location.search)
      if (params.has("demo") && EXAMPLES.length > 0) {
        await loadExample(EXAMPLES[0], false)
        return
      }
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY)
        if (raw) {
          const { name, text } = JSON.parse(raw) as { name: string; text: string }
          loadText(text, name, false)
        }
      } catch {
        // ignore parse/storage errors; user can re-drop the file
      }
    }

    void loadCurrentLocation(true)
    const handlePopState = () => {
      void loadCurrentLocation(false)
    }
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [loadExample, loadGrokPrototype, loadText, reset])

  return {
    session,
    fileName,
    skipped,
    dropError,
    loadingFile,
    loadFile,
    loadExample,
    loadGrokPrototype,
    reset,
  }
}
