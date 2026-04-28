import { useRef, useState } from "react"

export function App() {
  const [info, setInfo] = useState<{ name: string; lines: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function loadFile(file: File) {
    const text = await file.text()
    const lines = text.split("\n").filter(l => l.trim()).length
    setInfo({ name: file.name, lines })
  }

  return (
    <div className="app">
      <h1>jsonl.fyi</h1>
      <div
        className="drop-zone"
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (f) void loadFile(f)
        }}
        onClick={() => inputRef.current?.click()}
      >
        Drop a Claude session <code>.jsonl</code> here
        <input
          ref={inputRef}
          type="file"
          accept=".jsonl,application/jsonl,text/plain"
          style={{ display: "none" }}
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) void loadFile(f)
          }}
        />
      </div>
      {info && (
        <div className="info">
          {info.name} — {info.lines} lines
        </div>
      )}
    </div>
  )
}
