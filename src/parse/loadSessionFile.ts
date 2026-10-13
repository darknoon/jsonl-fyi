import type { Entry } from "../types"
import type { CodexEntry } from "../transcript/codex/types"
import type { PiParsedSession } from "../transcript/pi/types"
import type { GrokSession } from "../transcript/grok/types"
import { parseClaudeEntries } from "../transcript/claude/parse"
import { parseCodexEntries } from "../transcript/codex/parse"
import { parsePiEntries } from "../transcript/pi/parse"
import { parseGrokEntries } from "../transcript/grok/parse"
import { classifyJsonl, detectGrokCompanion, type FormatLabel } from "./classify"
import { iterJsonlStream } from "./iter"

export type LoadedSession =
  | { format: "claude"; entries: Entry[] }
  | { format: "codex"; entries: CodexEntry[] }
  | { format: "pi"; session: PiParsedSession }
  | { format: "grok"; session: GrokSession }

const STORAGE_LIMIT_BYTES = 4_000_000

export async function loadSessionFile(
  file: File,
  options: { signal?: AbortSignal; onProgress?: (bytes: number) => void } = {},
): Promise<{
  session: LoadedSession | null
  skipped: number
  text?: string
  grokCompanion?: NonNullable<ReturnType<typeof detectGrokCompanion>>
}> {
  const textChunks = file.size < STORAGE_LIMIT_BYTES ? ([] as string[]) : undefined
  let format: FormatLabel | undefined
  let initialLines: unknown[] = []
  const codexEntries: CodexEntry[] = []
  const claudeEntries: Entry[] = []
  const piLines: unknown[] = []
  const grokLines: unknown[] = []
  let grokCompanion: ReturnType<typeof detectGrokCompanion> = null

  function collect(line: unknown) {
    if (format === "codex") codexEntries.push(...parseCodexEntries([line]))
    else if (format === "claude") claudeEntries.push(...parseClaudeEntries([line]))
    else if (format === "pi") piLines.push(line)
    else if (format === "grok") grokLines.push(line)
    else if (!grokCompanion) grokCompanion = detectGrokCompanion([line])
  }

  function classify() {
    format = classifyJsonl(initialLines)
    for (const line of initialLines) collect(line)
    initialLines = []
  }

  options.signal?.throwIfAborted()
  const lines = iterJsonlStream(file.stream(), {
    ...options,
    onText: textChunks
      ? (chunk) => {
          textChunks.push(chunk)
        }
      : undefined,
  })
  let result = await lines.next()
  try {
    while (!result.done) {
      if (format === undefined) {
        initialLines.push(result.value)
        if (initialLines.length === 10) classify()
      } else {
        collect(result.value)
      }
      result = await lines.next()
    }
  } finally {
    if (!result.done) await lines.return({ skipped: 0 })
  }
  if (format === undefined) classify()

  const session: LoadedSession | null =
    format === "codex"
      ? { format, entries: codexEntries }
      : format === "claude"
        ? { format, entries: claudeEntries }
        : format === "pi"
          ? { format, session: parsePiEntries(piLines) }
          : format === "grok"
            ? { format, session: parseGrokEntries(grokLines) }
            : null
  return {
    session,
    skipped: result.value.skipped,
    ...(textChunks ? { text: textChunks.join("") } : {}),
    ...(grokCompanion ? { grokCompanion } : {}),
  }
}
