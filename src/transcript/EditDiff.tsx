import { useMemo } from "react"
import { parseDiffFromFile } from "@pierre/diffs"
import { FileDiff } from "@pierre/diffs/react"
import { CopyButton } from "./CopyButton"

const ensureTrailingNewline = (s: string) => (s.length > 0 && !s.endsWith("\n") ? s + "\n" : s)

function diffCopyText(oldString: string, newString: string): string {
  return `<<<<<<< OLD\n${oldString}\n=======\n${newString}\n>>>>>>> NEW\n`
}

export function EditDiff({
  filePath,
  oldString,
  newString,
}: {
  filePath: string
  oldString: string
  newString: string
}) {
  const fileDiff = useMemo(() => {
    const name = filePath || "file"
    return parseDiffFromFile(
      { name, contents: ensureTrailingNewline(oldString) },
      { name, contents: ensureTrailingNewline(newString) },
    )
  }, [filePath, oldString, newString])

  return (
    <div className="edit-diff-wrap copy-host">
      <FileDiff
        className="edit-diff"
        fileDiff={fileDiff}
        options={{
          diffStyle: "unified",
          disableFileHeader: true,
          diffIndicators: "classic",
          disableLineNumbers: true,
        }}
        disableWorkerPool
      />
      <CopyButton
        text={() => diffCopyText(oldString, newString)}
        ariaLabel="Copy diff"
      />
    </div>
  )
}
