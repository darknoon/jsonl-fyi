import { useMemo } from "react"
import { parseDiffFromFile } from "@pierre/diffs"
import { FileDiff } from "@pierre/diffs/react"

const ensureTrailingNewline = (s: string) => (s.length > 0 && !s.endsWith("\n") ? s + "\n" : s)

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
    <FileDiff
      className="edit-diff"
      fileDiff={fileDiff}
      options={{
        diffStyle: "unified",
        disableFileHeader: true,
        diffIndicators: "classic",
      }}
      disableWorkerPool
    />
  )
}
