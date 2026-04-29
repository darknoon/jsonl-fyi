import { test, expect } from "bun:test"
import { parseJsonl } from "../../parse"
import { extractResult, getBlocks } from "./extractResult"

test("extractResult on every tool_result in the fixture", async () => {
  const text = await Bun.file(
    new URL("../../__fixtures__/sample.jsonl", import.meta.url),
  ).text()
  const { entries } = parseJsonl(text)

  const lines: string[] = []
  for (const entry of entries) {
    for (const block of getBlocks(entry)) {
      if (block.type === "tool_result") {
        const r = extractResult(block)
        lines.push(
          `${block.tool_use_id} text=${r.text.length}b images=${r.images.length}`,
        )
      }
    }
  }
  expect(lines.join("\n")).toMatchInlineSnapshot(`
    "toolu_019zVTwvH2BFypLYEhtnmN3r text=0b images=0
    toolu_015e6AqEa76t2WPEXxzWohh2 text=2b images=0
    toolu_0118tzMo1HzFHNLEDapKX45N text=3985b images=0
    toolu_01VXPKHKQknA1D2JUSwBD9Jy text=3427b images=0
    toolu_01PjRfysPsVNfJVz4MoRQ5TV text=4859b images=0
    toolu_01JTKKvN5TxmSGddgvoYFg9H text=58b images=0
    toolu_01JTLWiVcyaooua4Xq3RkBcW text=58b images=0
    toolu_01SW2HSMpdvyXNT3M4BGSJA6 text=58b images=0
    toolu_018gkLpKoRuEx7pcVYwPZm1f text=1559b images=0"
  `)
})

test("extractResult handles string content, mixed array, and image-only", () => {
  const summary = [
    extractResult({ type: "tool_result", tool_use_id: "a", content: "hello" }),
    extractResult({
      type: "tool_result",
      tool_use_id: "b",
      content: [
        { type: "text", text: "out" },
        { type: "image", source: { type: "base64", media_type: "image/png", data: "X" } },
        { type: "text", text: "more" },
      ],
    }),
    extractResult({
      type: "tool_result",
      tool_use_id: "c",
      content: [
        { type: "image", source: { type: "url", url: "https://x/y.png" } },
      ],
    }),
  ]
    .map(r => `text=${JSON.stringify(r.text)} images=${r.images.length}`)
    .join("\n")
  expect(summary).toMatchInlineSnapshot(`
    "text="hello" images=0
    text="out\\nmore" images=1
    text="" images=1"
  `)
})
