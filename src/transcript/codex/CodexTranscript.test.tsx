import { test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { CodexTranscript } from "./CodexTranscript"
import { SettingsProvider } from "../../settings"
import type { CodexEntry } from "./types"

test("WaitAgent header uses nickname from earlier spawn_agent output", () => {
  const entries: CodexEntry[] = [
    {
      type: "response_item",
      payload: {
        type: "function_call",
        name: "spawn_agent",
        arguments: JSON.stringify({ agent_type: "worker", message: "x" }),
        call_id: "c1",
      },
    },
    {
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "c1",
        output: '{"agent_id":"019d","nickname":"Bacon"}',
      },
    },
    {
      type: "response_item",
      payload: {
        type: "function_call",
        name: "wait_agent",
        arguments: JSON.stringify({ targets: ["019d"], timeout_ms: 60000 }),
        call_id: "c2",
      },
    },
    {
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "c2",
        output: '"aborted by user after 5s"',
      },
    },
  ]
  const html = renderToStaticMarkup(
    <SettingsProvider initial={{ renderMarkdown: true, viewMode: "normal" }}>
      <CodexTranscript entries={entries} />
    </SettingsProvider>,
  )
  expect(html).toContain("Bacon")
  // The wait_agent header should NOT show the bare full UUID
  // Spec: header shows nickname when resolvable; falls back to id.slice(0, 8) otherwise.
  // With nickname resolved, "019d" should appear in the targets field (Content),
  // but the wait_agent trigger should display "Bacon" as the detail.
})

test("WaitAgent header falls back to short ID when no spawn_agent output", () => {
  const entries: CodexEntry[] = [
    {
      type: "response_item",
      payload: {
        type: "function_call",
        name: "wait_agent",
        arguments: JSON.stringify({ targets: ["019dabcdefgh"], timeout_ms: 60000 }),
        call_id: "c1",
      },
    },
    {
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "c1",
        output: '{"status":{},"timed_out":true}',
      },
    },
  ]
  const html = renderToStaticMarkup(
    <SettingsProvider initial={{ renderMarkdown: true, viewMode: "normal" }}>
      <CodexTranscript entries={entries} />
    </SettingsProvider>,
  )
  expect(html).toContain("019dabcd") // first 8 chars of UUID
})
