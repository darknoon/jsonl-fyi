import { test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { SettingsProvider } from "../../settings"
import { PiTranscript } from "./PiTranscript"
import type { PiParsedSession } from "./types"

function render(session: PiParsedSession): string {
  return renderToStaticMarkup(
    <SettingsProvider initial={{ renderMarkdown: true, viewMode: "normal" }}>
      <PiTranscript session={session} />
    </SettingsProvider>,
  )
}

test("PiTranscript: model and thinking level render in transcript header", () => {
  const session: PiParsedSession = {
    header: {
      type: "session",
      id: "s1",
      timestamp: "2026-05-01T00:00:00.000Z",
      cwd: "/repo",
    },
    entries: [],
    activeEntries: [
      {
        type: "model_change",
        id: "m1",
        parentId: null,
        timestamp: "2026-05-01T00:00:00.000Z",
        provider: "openai-codex",
        modelId: "gpt-5.4",
      },
      {
        type: "thinking_level_change",
        id: "t1",
        parentId: "m1",
        timestamp: "2026-05-01T00:00:00.001Z",
        thinkingLevel: "medium",
      },
      {
        type: "message",
        id: "a1",
        parentId: "t1",
        timestamp: "2026-05-01T00:00:00.002Z",
        message: { role: "assistant", content: [{ type: "text", text: "hello" }] },
      },
    ],
    hiddenBranchEntryCount: 0,
    orphanedEntryCount: 0,
  }

  const html = render(session)
  expect(html).toContain("GPT 5.4/medium")
  expect(html).not.toContain("pi-session-card")
  expect(html).not.toContain("pi-meta-row")
})
