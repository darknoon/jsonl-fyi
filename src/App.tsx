import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { iterJsonlLines } from "./parse/iter"
import { classifyJsonl } from "./parse/classify"
import { parseJsonl } from "./transcript/claude/parse"
import { parseCodexEntries } from "./transcript/codex/parse"
import { parsePiEntries } from "./transcript/pi/parse"
import type { Entry } from "./types"
import { ClaudeCodeTranscript } from "./transcript/claude/ClaudeCodeTranscript"
import { CodexTranscript } from "./transcript/codex/CodexTranscript"
import { PiTranscript } from "./transcript/pi/PiTranscript"
import type { CodexEntry } from "./transcript/codex/types"
import type { PiParsedSession } from "./transcript/pi/types"
import { ArrowLeftIcon, CheckIcon, CopyIcon, GearIcon, XIcon } from "@phosphor-icons/react"
import { SettingsPopover, SETTINGS_POPOVER_ID } from "./SettingsPopover"
import { Examples } from "./ExamplesSection"
import { FileIcon } from "./FileIcon"
import { EXAMPLES, exampleHref, findExampleByPath } from "./examples"
import type { Example } from "./examples"

// Dev-only: load the Agentation visual-feedback toolbar dynamically so it
// gets tree-shaken out of production builds. `import.meta.env.DEV` is a
// build-time constant Vite inlines, so the import() is unreachable
// (and therefore omitted) in prod.
const AgentationDev = import.meta.env.DEV ? lazy(() => import("./AgentationDev")) : null

function TerminalCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="terminal-cmd">
      <span className="terminal-cmd-prompt" aria-hidden="true">
        $
      </span>
      <code className="terminal-cmd-text">{command}</code>
      <button
        className="terminal-cmd-copy"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          } catch {
            // ignore
          }
        }}
        aria-label="Copy command"
        title="Copy command"
      >
        {copied ? <CheckIcon size={14} weight="bold" /> : <CopyIcon size={14} />}
      </button>
    </div>
  )
}

const STORAGE_KEY = "jsonl-fyi:last"
const STORAGE_LIMIT_BYTES = 4_000_000 // ~4 MB; sessionStorage caps around 5 MB

type LoadedSession =
  | { format: "claude"; entries: Entry[] }
  | { format: "codex"; entries: CodexEntry[] }
  | { format: "pi"; session: PiParsedSession }

const AGENT_FORMATS = ["claude", "codex", "pi"] as const satisfies readonly Example["format"][]
const AGENT_LABELS: Record<Example["format"], string> = {
  claude: "Claude Code",
  codex: "OpenAI Codex",
  pi: "Pi Coding Agent",
}

export function App() {
  const [session, setSession] = useState<LoadedSession | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [skipped, setSkipped] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)
  const [activeAgentIndex, setActiveAgentIndex] = useState(0)
  const [previewAgent, setPreviewAgent] = useState<Example["format"] | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeAgent = previewAgent ?? AGENT_FORMATS[activeAgentIndex]

  function previewFormat(format: Example["format"] | null) {
    if (format) {
      setActiveAgentIndex(AGENT_FORMATS.indexOf(format))
    }
    setPreviewAgent(format)
  }

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
      setDropError(null)
    } else if (format === "pi") {
      setSession({ format: "pi", session: parsePiEntries(allLines) })
      setDropError(null)
    } else if (format === "claude") {
      // parseJsonl re-parses the text; small overhead, fine for now.
      const r = parseJsonl(text)
      setSession({ format: "claude", entries: r.entries })
      setDropError(null)
    } else {
      setSession(null)
      setDropError(`Couldn't parse ${name} as a Claude Code, OpenAI Codex, or pi JSONL file`)
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

  async function loadExample(example: Example, updateHistory = true) {
    if (updateHistory) {
      window.history.pushState(null, "", exampleHref(example))
    }
    const text = await example.load()
    loadText(text, example.fileName, false)
  }

  useEffect(() => {
    const id = window.setInterval(() => {
      setActiveAgentIndex((i) => (i + 1) % AGENT_FORMATS.length)
    }, 2400)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    async function loadCurrentLocation(restoreSession: boolean) {
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
        const first = EXAMPLES[0]
        const text = await first.load()
        loadText(text, first.fileName, false)
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
              <FileIcon format={session.format} />
              <span className="filename">{fileName}</span>
              <button
                className="icon-btn"
                onClick={() => reset(true)}
                aria-label="Close file"
                title="Close file"
              >
                <XIcon size={14} weight="bold" />
              </button>
              {skipped > 0 && <span className="skipped">{skipped} malformed</span>}
            </div>
          ) : (
            <span />
          )}

          {session ? (
            <>
              <button
                className="icon-btn settings-btn"
                aria-label="Settings"
                title="Settings"
                popoverTarget={SETTINGS_POPOVER_ID}
              >
                <GearIcon size={16} weight="fill" />
              </button>
              <SettingsPopover />
            </>
          ) : (
            <span />
          )}
        </div>
      </header>
      <div className="app">
        {!session && (
          <>
            <p className="description">
              View and debug your{" "}
              <span className="sr-only">Claude Code, OpenAI Codex, or Pi Coding Agent</span>
              <span className="agent-fader" aria-hidden="true">
                {AGENT_FORMATS.map((format) => (
                  <span
                    key={format}
                    className={`agent-fader-item ${activeAgent === format ? "agent-fader-item-active" : ""}`}
                  >
                    {AGENT_LABELS[format]}
                  </span>
                ))}
              </span>
              <br />
              sessions.
            </p>
            <div
              className={`drop-zone ${dragOver ? "drag-over" : ""} ${dropError ? "drop-error" : ""}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                const f = e.dataTransfer.files[0]
                if (f) void loadFile(f)
              }}
              onClick={() => inputRef.current?.click()}
            >
              <div className="drop-zone-text">
                {dropError ? (
                  <>
                    {dropError}
                    <div className="drop-zone-sub">
                      Drop a different file or
                      <div className="drop-zone-button-row">
                        <span className="drop-zone-button" tabIndex={-1} aria-hidden="true">
                          Choose a File…
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    Drop your <code>.jsonl</code>
                    <div className="drop-zone-sub">
                      or
                      <div className="drop-zone-button-row">
                        <span className="drop-zone-button" tabIndex={-1} aria-hidden="true">
                          Choose a File…
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".jsonl,application/jsonl,text/plain"
                data-testid="file-input"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void loadFile(f)
                }}
              />
            </div>
            <Examples
              onSelect={loadExample}
              activeFormat={activeAgent}
              onPreviewFormat={previewFormat}
            />
            <details className="drop-zone-defined">
              <summary>How do I find the .jsonl on my computer?</summary>
              <h3>Claude Code</h3>
              <p>
                stores sessions in <code>~/.claude/projects/&lt;project&gt;/</code>:
              </p>
              <TerminalCommand command="open ~/.claude/projects/" />
              <p>
                The project slug is the absolute path to the project directory, with <code>/</code>{" "}
                replaced by <code>-</code>, eg <code>-Users-andrew-Developer-Prefix-jsonl-fyi</code>
              </p>
              <h3>Codex</h3>
              <p>
                stores sessions in{" "}
                <code>~/.codex/sessions/&lt;YYYY&gt;/&lt;MM&gt;/&lt;DD&gt;/rollout-*.jsonl</code>:
              </p>
              <TerminalCommand command="open ~/.codex/sessions/" />
              <h3>pi</h3>
              <p>
                stores sessions in <code>~/.pi/agent/sessions/</code>:
              </p>
              <TerminalCommand command="open ~/.pi/agent/sessions/" />
            </details>
          </>
        )}

        {session && session.format === "codex" && <CodexTranscript entries={session.entries} />}
        {session && session.format === "pi" && <PiTranscript session={session.session} />}
        {session && session.format === "claude" && (
          <ClaudeCodeTranscript entries={session.entries} />
        )}
        <footer className="app-footer">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M8 0.5C9.933 0.5 11.5 2.067 11.5 4V5.15332C12.0009 5.44267 12.4092 5.87031 12.6729 6.3877C12.9998 7.02941 13 7.86978 13 9.5498V9.9502C13 11.6302 12.9998 12.4706 12.6729 13.1123C12.3853 13.6765 11.9265 14.1353 11.3623 14.4229C10.7206 14.7498 9.88022 14.75 8.2002 14.75H7.7998C6.11978 14.75 5.27941 14.7498 4.6377 14.4229C4.07347 14.1353 3.61472 13.6765 3.32715 13.1123C3.00018 12.4706 3 11.6302 3 9.9502V9.5498C3 7.86978 3.00018 7.02941 3.32715 6.3877C3.59085 5.87031 3.99909 5.44267 4.5 5.15332V4C4.5 2.067 6.067 0.5 8 0.5ZM8 7.34766C7.0876 7.34766 6.34766 8.0876 6.34766 9C6.34766 9.63041 6.70148 10.1776 7.2207 10.4561L7.10156 11.5303C7.04245 12.0668 7.46312 12.5361 8.00293 12.5361C8.54343 12.536 8.9637 12.0654 8.90332 11.5283L8.78125 10.4551C9.29942 10.1763 9.65234 9.62963 9.65234 9C9.65234 8.0876 8.9124 7.34766 8 7.34766ZM8 2C6.89543 2 6 2.89543 6 4V4.78027C6.47139 4.75149 7.05244 4.75 7.7998 4.75H8.2002C8.94756 4.75 9.52861 4.75149 10 4.78027V4C10 2.89543 9.10457 2 8 2Z"
              fill="currentColor"
            />
          </svg>
          Your data is{" "}
          <a href="https://github.com/darknoon/jsonl-fyi" target="_blank" rel="noopener noreferrer">
            processed
          </a>{" "}
          locally in the browser
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
