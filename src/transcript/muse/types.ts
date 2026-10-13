/** Portable display model for Muse Code's session event log. */
export type MuseModel = { label: string; raw: string }
export type MuseToolStatus = "success" | "error" | "cancelled" | "rejected" | "running" | "unknown"
export type MuseToolEntry = {
  kind: "tool"
  id: string
  taskId?: string
  callId?: string
  name: string
  /** Unmodified result text; structured shell envelopes are retained. */
  output: string
  status: MuseToolStatus
  reason?: string
  /** Echoed by the result, not reconstructed original arguments. */
  command?: string
  description?: string
  /** Recorded path and edit counts; includes unrecognized metadata fields. */
  editFacts?: Record<string, unknown>
  outputRefs?: unknown[]
  durationMs?: number
  timestamp?: string
}
export type MuseEntry =
  | MuseToolEntry
  | {
      kind: "message"
      id: string
      text: string
      timestamp?: string
    }
  | {
      kind: "unknown"
      id: string
      label: string
      raw: unknown
    }
  | {
      kind: "diagnostic"
      id: string
      label: string
      /** Lifecycle evidence for infrastructure tasks; not user-facing tool failures. */
      raw: unknown
    }
export type MuseRun = {
  id: string
  sessionId: string
  prompt: string | undefined
  model?: MuseModel
  entries: MuseEntry[]
  timestamp?: string
  durationMs?: number
  terminal?: string
  reason?: string
}
export type MuseSession = {
  runs: MuseRun[]
  models: MuseModel[]
  timingIssue?: string
  startTimestamp?: string
}
