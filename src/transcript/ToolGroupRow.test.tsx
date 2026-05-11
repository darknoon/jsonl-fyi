import { test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ToolGroupRow, aggregateStatus, type GroupItem } from "./ToolGroupRow"
import type { SummaryCounts } from "./groupSummary"
import type { ToolDiff } from "./grouping"

function mkTool(
  over: Partial<{ name: string; status: "success" | "error"; diffs: ToolDiff[]; data: string }> = {},
): GroupItem<string> {
  return {
    kind: "tool",
    name: "Read",
    status: "success",
    diffs: [],
    data: "card-content",
    ...over,
  }
}

function mkThinking(label: string, data = "thinking-data"): GroupItem<string> {
  return { kind: "thinking", label, data }
}

function render(
  items: GroupItem<string>[],
  summary: SummaryCounts,
  thinkingCount = 0,
  renderToolCard = (d: string) => <div>EXPANDED:{String(d)}</div>,
  renderThinking = (d: string) => <div>THINKING:{String(d)}</div>,
) {
  return renderToStaticMarkup(
    <ToolGroupRow
      items={items}
      summary={summary}
      thinkingCount={thinkingCount}
      renderToolCard={renderToolCard}
      renderThinking={renderThinking}
    />,
  )
}

// aggregateStatus unit tests
test("aggregateStatus: all success → success", () => {
  expect(aggregateStatus(["success", "success"])).toBe("success")
})

test("aggregateStatus: all error → error", () => {
  expect(aggregateStatus(["error", "error"])).toBe("error")
})

test("aggregateStatus: mixed → mixed", () => {
  expect(aggregateStatus(["success", "error"])).toBe("mixed")
})

test("aggregateStatus: empty → success", () => {
  expect(aggregateStatus([])).toBe("success")
})

// Prose-summary rendering
test("renders prose summary inside tool-title-prose", () => {
  const html = render([mkTool({ name: "Read" }), mkTool({ name: "Read" })], { read: 2 })
  expect(html).toContain('class="tool-title-prose"')
  expect(html).toContain("Read 2 files")
})

test("renders thinking via prose, not as separate chip", () => {
  const html = render([mkThinking("Thinking")], {}, 1)
  expect(html).toContain("Thought")
})

test("collapsed: no expanded card / thinking content visible", () => {
  const html = render([mkTool({ data: "card-content" })], { read: 1 })
  expect(html).not.toContain("EXPANDED:card-content")
  expect(html).not.toContain("tool-group-expanded")
})

test("no status dot classes appear on the row", () => {
  const html = render([mkTool({ status: "success" }), mkTool({ status: "error" })], { read: 2 })
  expect(html).not.toContain("tool-card-success")
  expect(html).not.toContain("tool-card-error")
  expect(html).not.toContain("tool-card-mixed")
})

test("single failure → appends '(1 failure)'", () => {
  const html = render([mkTool({ status: "error" })], { read: 1 })
  expect(html).toContain("Read 1 file (1 failure)")
})

test("multiple failures → appends '(N failures)'", () => {
  const html = render(
    [mkTool({ status: "error" }), mkTool({ status: "error" }), mkTool({ status: "success" })],
    { read: 3 },
  )
  expect(html).toContain("Read 3 files (2 failures)")
})

test("zero failures → no suffix", () => {
  const html = render([mkTool({ status: "success" })], { read: 1 })
  expect(html).not.toContain("failure")
})

test("thinking items don't count as failures", () => {
  const html = render([mkTool({ status: "success" }), mkThinking("Thinking")], { read: 1 }, 1)
  expect(html).not.toContain("failure")
})

test("diffs are not rendered in collapsed state", () => {
  const d1: ToolDiff = { kind: "edit", filePath: "a.ts", oldString: "x", newString: "y" }
  const html = render([mkTool({ diffs: [d1] })], { read: 1 })
  expect(html).not.toContain("a.ts")
})
