import { lazy, Suspense, useEffect, useRef, useState } from "react"
// eslint-disable-next-line
// @ts-ignore — Bun handles `with { type: "text" }` at bundle time
import sampleJsonl from "./__fixtures__/sample.jsonl" with { type: "text" }
import { parseJsonl } from "./parse"
import type { Entry } from "./types"
import { Transcript } from "./transcript/claude/Transcript"

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

export function App() {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [skipped, setSkipped] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function loadText(text: string, name: string, persist = true) {
    const result = parseJsonl(text)
    setEntries(result.entries)
    setFileName(name)
    setSkipped(result.skipped)
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

  function reset() {
    setEntries(null)
    setFileName(null)
    setSkipped(0)
    if (inputRef.current) inputRef.current.value = ""
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has("demo")) {
      loadText(sampleJsonl, "sample.jsonl", false)
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
  }, [])

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <h1>jsonl.fyi</h1>
          {entries && (
            <div className="meta">
              <span className="filename">{fileName}</span>
              <span className="count">{entries.length} entries</span>
              {skipped > 0 && <span className="skipped">{skipped} malformed</span>}
              <button className="reset" onClick={reset}>Clear</button>
            </div>
          )}
        </div>
      </header>
      <div className="app">
      {!entries && (
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
              Drop a Claude session <code>.jsonl</code> here
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
          <div className="demo-row">
            <button
              className="demo-link"
              onClick={() => loadText(sampleJsonl, "sample.jsonl", false)}
            >
              Load sample
            </button>
          </div>
        </>
      )}

      {entries && <Transcript entries={entries} />}
      <footer className="app-footer">
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
