import { PatchDiff } from "@pierre/diffs/react"
import type { ToolResult } from "../../types"
import { ToolCard } from "../ToolCard"
import { Header, Field, ToolTitle, toolResultText } from "../shared"
import { parseV4A } from "./v4a"
import { CopyButton } from "../CopyButton"

export function ApplyPatch({ patch, output }: { patch: string; output: ToolResult }) {
  const parsed = parseV4A(patch)
  const files = "files" in parsed ? parsed.files : []
  const fileCount = files.length
  const detail =
    fileCount === 0 ? undefined : fileCount === 1 ? shortFile(files[0].path) : `${fileCount} files`

  // Output may be JSON-wrapped: {"output":"...","metadata":{"exit_code", "duration_seconds"}}.
  const meta = tryParsePatchOutput(toolResultText(output))

  return (
    <ToolCard.Root hasContent={true} status={output.isError ? "error" : "success"}>
      <ToolCard.Trigger>
        <Header>
          <ToolTitle name="apply_patch" detail={detail} />
        </Header>
      </ToolCard.Trigger>
      <ToolCard.Preview>
        {"error" in parsed ? (
          <pre className="output copy-host">
            {patch}
            <CopyButton text={patch} ariaLabel="Copy patch" />
          </pre>
        ) : (
          <div className="apply-patch-files">
            {parsed.files.map((f, i) => {
              if (f.op === "delete") {
                return (
                  <div key={i} className="apply-patch-deleted">
                    Deleted: <code>{f.path}</code>
                  </div>
                )
              }
              const showFilename = fileCount > 1 || (f.op === "update" && !!f.movedTo)
              return (
                <div key={i} className="apply-patch-file copy-host">
                  {showFilename &&
                    (f.op === "update" && f.movedTo ? (
                      <div className="apply-patch-filename">
                        Renamed: <code>{f.path}</code> → <code>{f.movedTo}</code>
                      </div>
                    ) : (
                      <div className="apply-patch-filename">
                        {f.op === "add" ? "Added: " : ""}
                        <code>{f.path}</code>
                      </div>
                    ))}
                  <PatchDiff
                    patch={f.unifiedDiff}
                    options={{
                      diffStyle: "unified",
                      diffIndicators: "classic",
                      disableFileHeader: true,
                      disableLineNumbers: true,
                    }}
                    disableWorkerPool
                  />
                  <CopyButton text={f.unifiedDiff} ariaLabel="Copy patch" />
                </div>
              )
            })}
          </div>
        )}
        {(meta.exitCode != null || meta.duration != null) && (
          <dl className="tool-fields">
            {meta.exitCode != null && <Field name="exit_code" value={`${meta.exitCode}`} />}
            {meta.duration != null && <Field name="duration_seconds" value={`${meta.duration}`} />}
          </dl>
        )}
        {meta.text && (
          <pre className="output copy-host">
            {meta.text}
            <CopyButton text={meta.text} ariaLabel="Copy output" />
          </pre>
        )}
      </ToolCard.Preview>
    </ToolCard.Root>
  )
}

function shortFile(path: string): string {
  const parts = path.split("/")
  return parts.length > 2 ? `.../${parts.slice(-2).join("/")}` : path
}

function tryParsePatchOutput(raw: string): {
  text: string
  exitCode: number | null
  duration: number | null
} {
  if (!raw) return { text: "", exitCode: null, duration: null }
  try {
    const v = JSON.parse(raw) as { output?: unknown; metadata?: unknown }
    if (v && typeof v === "object") {
      const text = typeof v.output === "string" ? v.output : raw
      const meta =
        v.metadata && typeof v.metadata === "object" ? (v.metadata as Record<string, unknown>) : {}
      const exitCode = typeof meta.exit_code === "number" ? meta.exit_code : null
      const duration = typeof meta.duration_seconds === "number" ? meta.duration_seconds : null
      return { text, exitCode, duration }
    }
  } catch {
    // not JSON — fall through
  }
  return { text: raw, exitCode: null, duration: null }
}
