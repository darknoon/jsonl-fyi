import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { iterJsonlLines } from "./parse/iter"
import { classifyJsonl } from "./parse/classify"
import { parseJsonl } from "./transcript/claude/parse"
import { parseCodexEntries } from "./transcript/codex/parse"
import type { Entry } from "./types"
import { ClaudeCodeTranscript } from "./transcript/claude/ClaudeCodeTranscript"
import { CodexTranscript } from "./transcript/codex/CodexTranscript"
import type { CodexEntry } from "./transcript/codex/types"
import { ArrowLeftIcon, GearIcon, LockIcon, XIcon } from "@phosphor-icons/react"
import { Examples } from "./ExamplesSection"
import { EXAMPLES, exampleHref, findExampleByPath } from "./examples"
import type { Example } from "./examples"

// Dev-only: load the Agentation visual-feedback toolbar dynamically so it
// gets tree-shaken out of production builds. The conditional below is a
// build-time constant after Bun substitutes process.env.NODE_ENV, so the
// import() is unreachable (and therefore omitted) in prod.
const AgentationDev =
  process.env.NODE_ENV !== "production"
    ? lazy(() => import("./AgentationDev"))
    : null

const STORAGE_KEY = "jsonl-fyi:last"
const STORAGE_LIMIT_BYTES = 4_000_000 // ~4 MB; sessionStorage caps around 5 MB

type LoadedSession =
  | { format: "claude"; entries: Entry[] }
  | { format: "codex"; entries: CodexEntry[] }

export function App() {
  const [session, setSession] = useState<LoadedSession | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [skipped, setSkipped] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function loadText(text: string, name: string, persist = true) {
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
    } else if (format === "claude") {
      // parseJsonl re-parses the text; small overhead, fine for now.
      const r = parseJsonl(text)
      setSession({ format: "claude", entries: r.entries })
    } else {
      setSession(null)
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
  }

  async function loadFile(file: File) {
    const text = await file.text()
    loadText(text, file.name)
  }

  function reset(clearUrl = false) {
    setSession(null)
    setFileName(null)
    setSkipped(0)
    if (inputRef.current) inputRef.current.value = ""
    if (clearUrl && window.location.pathname !== "/") {
      window.history.pushState(null, "", "/")
    }
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }

  function loadExample(example: Example, updateHistory = true) {
    if (updateHistory) {
      window.history.pushState(null, "", exampleHref(example))
    }
    loadText(example.content, example.fileName, false)
  }

  useEffect(() => {
    function loadCurrentLocation(restoreSession: boolean) {
      const routeExample = findExampleByPath(window.location.pathname)
      if (routeExample) {
        loadExample(routeExample, false)
        return
      }

      if (!restoreSession) {
        reset(false)
        return
      }

      const params = new URLSearchParams(window.location.search)
      if (params.has("demo") && EXAMPLES.length > 0) {
        const first = EXAMPLES[0]
        loadText(first.content, first.fileName, false)
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

    loadCurrentLocation(true)
    const handlePopState = () => loadCurrentLocation(false)
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          {session ? (
            <button
              className="title-pill"
              onClick={() => reset(true)}
              aria-label="Back to file picker"
              title="Back to file picker"
            >
              <ArrowLeftIcon className="title-pill-icon" size={16} weight="bold" />
              <span>jsonl.fyi</span>
            </button>
          ) : (
            <h1 className="title-logo">jsonl.fyi</h1>
          )}
          {session ? (
            <div className="filename-group">
              <span className="filename">{fileName}</span>
              <button
                className="icon-btn"
                onClick={() => reset(true)}
                aria-label="Close file"
                title="Close file"
              >
                <XIcon size={14} weight="bold" />
              </button>
              {skipped > 0 && (
                <span className="skipped">{skipped} malformed</span>
              )}
            </div>
          ) : (
            <span />
          )}

          <button
            className="icon-btn settings-btn"
            aria-label="Settings"
            title="Settings"
          >
            <GearIcon size={16} />
          </button>
        </div>
      </header>
      <div className="app">
      {!session && (
        <>
          <div
            className={`drop-zone ${dragOver ? "drag-over" : ""}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault()
              setDragOver(false)
              const f = e.dataTransfer.files[0]
              if (f) void loadFile(f)
            }}
            onClick={() => inputRef.current?.click()}
          >
            <div className="drop-zone-text">
              Drop a Claude Code or OpenAI Codex <code>.jsonl</code> here
              <div className="drop-zone-sub">or click to choose a file</div>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".jsonl,application/jsonl,text/plain"
              data-testid="file-input"
              style={{ display: "none" }}
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) void loadFile(f)
              }}
            />
          </div>
          <p className="drop-zone-hint">
            Claude Code stores sessions at{" "}
            <code>~/.claude/projects/&lt;project-slug&gt;/&lt;session&gt;.jsonl</code>
            The project slug is the absolute path to the project directory, with <code>/</code> replaced by <code>-</code>, eg <code>-Users-andrew-Developer-Prefix-jsonl-fyi</code>
          </p>
          <p className="drop-zone-hint">
            Codex stores sessions at{" "}
            <code>~/.codex/sessions/&lt;YYYY&gt;/&lt;MM&gt;/&lt;DD&gt;/rollout-*.jsonl</code>
          </p>
          <Examples onSelect={loadExample} />
        </>
      )}

      {session && session.format === "codex" && <CodexTranscript entries={session.entries} />}
      {session && session.format === "claude" && <ClaudeCodeTranscript entries={session.entries} />}
      <footer className="app-footer">
        <LockIcon size={14} weight="bold" />
        Your data is processed locally in the browser
      </footer>
      </div>
      {AgentationDev && (
        <Suspense fallback={null}>
          <AgentationDev />
        </Suspense>
      )}
    </>
  )
}
