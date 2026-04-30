export type V4AFile =
  | { op: "add"; path: string; unifiedDiff: string }
  | { op: "update"; path: string; movedTo?: string; unifiedDiff: string }
  | { op: "delete"; path: string }

export type V4AResult =
  | { files: V4AFile[] }
  | { error: string; raw: string }

const BEGIN = "*** Begin Patch"
const END = "*** End Patch"

export function parseV4A(input: string): V4AResult {
  const lines = input.split("\n")
  if (lines[0]?.trim() !== BEGIN) {
    return { error: "missing *** Begin Patch", raw: input }
  }
  let i = 1
  const files: V4AFile[] = []

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === END) {
      i++
      break
    }
    const m = /^\*\*\* (Add File|Update File|Delete File): (.+)$/.exec(line)
    if (!m) {
      if (line.trim() === "") { i++; continue }
      return { error: `unexpected line: ${line}`, raw: input }
    }
    const op = m[1]
    const path = m[2]
    i++

    if (op === "Delete File") {
      files.push({ op: "delete", path })
      continue
    }

    if (op === "Add File") {
      const body: string[] = []
      while (i < lines.length && !lines[i].startsWith("*** ")) {
        const ln = lines[i]
        if (ln.startsWith("+")) body.push(ln.slice(1))
        i++
      }
      const unified = buildUnifiedDiff(path, "add", [{ context: [], removed: [], added: body }])
      files.push({ op: "add", path, unifiedDiff: unified })
      continue
    }

    // Update File
    let movedTo: string | undefined
    if (lines[i] && /^\*\*\* Move to: /.test(lines[i])) {
      movedTo = lines[i].replace(/^\*\*\* Move to: /, "")
      i++
    }
    const hunks: { context: string[]; removed: string[]; added: string[] }[] = []
    if (!lines[i] || !/^@@/.test(lines[i])) {
      return { error: `Update File without @@ hunk: ${path}`, raw: input }
    }
    while (i < lines.length && /^@@/.test(lines[i])) {
      i++ // skip the @@ line (anchor text after @@ is dropped intentionally)
      const hunk = { context: [] as string[], removed: [] as string[], added: [] as string[] }
      while (i < lines.length && !/^@@/.test(lines[i]) && !lines[i].startsWith("*** ")) {
        const ln = lines[i]
        if (ln.startsWith(" ")) hunk.context.push(ln.slice(1))
        else if (ln.startsWith("-")) hunk.removed.push(ln.slice(1))
        else if (ln.startsWith("+")) hunk.added.push(ln.slice(1))
        i++
      }
      hunks.push(hunk)
      if (lines[i] === "*** End of File") i++
    }
    files.push({
      op: "update",
      path,
      movedTo,
      unifiedDiff: buildUnifiedDiff(path, "update", hunks),
    })
  }

  return { files }
}

function buildUnifiedDiff(
  path: string,
  op: "add" | "update",
  hunks: { context: string[]; removed: string[]; added: string[] }[],
): string {
  // Strip leading slash so we get `a/path/to/file` not `a//path/to/file`
  const normPath = path.startsWith("/") ? path.slice(1) : path
  const fromHeader = op === "add" ? "/dev/null" : `a/${normPath}`
  const toHeader = `b/${normPath}`
  const out: string[] = [`--- ${fromHeader}`, `+++ ${toHeader}`]
  for (const h of hunks) {
    const fromCount = h.context.length + h.removed.length
    const toCount = h.context.length + h.added.length
    out.push(`@@ -1,${fromCount} +1,${toCount} @@`)
    // Reconstruct: context first, then removed, then added. Original
    // interleaving inside a hunk isn't preserved; for *display* this is fine.
    for (const c of h.context) out.push(` ${c}`)
    for (const r of h.removed) out.push(`-${r}`)
    for (const a of h.added) out.push(`+${a}`)
  }
  return out.join("\n") + "\n"
}
