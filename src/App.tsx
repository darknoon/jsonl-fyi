import { useRef, useState } from "react"
import { parseJsonl } from "./parse"
import type { Entry } from "./types"
import { Transcript } from "./transcript/Transcript"

export function App() {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [skipped, setSkipped] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function loadFile(file: File) {
    const text = await file.text()
    const result = parseJsonl(text)
    setEntries(result.entries)
    setFileName(file.name)
    setSkipped(result.skipped)
  }

  function reset() {
    setEntries(null)
    setFileName(null)
    setSkipped(0)
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>jsonl.fyi</h1>
        {entries && (
          <div className="meta">
            <span className="filename">{fileName}</span>
            <span className="count">{entries.length} entries</span>
            {skipped > 0 && <span className="skipped">{skipped} malformed</span>}
            <button className="reset" onClick={reset}>Clear</button>
          </div>
        )}
      </header>

      {!entries && (
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
      )}

      {entries && <Transcript entries={entries} />}
    </div>
  )
}
