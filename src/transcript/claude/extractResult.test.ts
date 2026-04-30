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
    "toolu_01DNQyiqyaXhcrJuvoyeC6tr text=386b images=0
    toolu_01KhHzN8qMV7MLW9zktKQ1RW text=779b images=0
    toolu_01HtyAFiUzbD5kqDxv5n8JuK text=5241b images=0
    toolu_01SpzSz6ob28VvU8cwJ8RDqk text=22094b images=0
    toolu_01J4ux8oTzP8QUXsdNRNn4oa text=6998b images=0
    toolu_01BQDerxdbeCZSmRmUm5Kz74 text=114b images=0
    toolu_01Dz45c3ZNJo5jCev92vh1MV text=1642b images=0
    toolu_01YME4JteBo429omSYPfiUFr text=1590b images=0
    toolu_01EpEinQjwRdj9rXaXdzJjhZ text=137b images=0
    toolu_01PqQ1khgAPP6WswA3Nbm9T7 text=92b images=0
    toolu_012shrDYNbNVLsmc3H1ixigp text=92b images=0
    toolu_016sGkynu7PQHejC65XoewqM text=95b images=0
    toolu_01VavfvZtWYJNZJm6JmfsJVN text=673b images=0
    toolu_013STWKW92cV81UAhEY1vUb5 text=1602b images=0
    toolu_01L3KsG67sNKUVK5FtAuCYqm text=95b images=0
    toolu_012GJQK4aiYkynGmgQs4dMSf text=1525b images=0
    toolu_01DtKcGfh61k1NtaizWyje5Z text=92b images=0
    toolu_017FJAtieF2eYrKbgWWaW6SC text=95b images=0
    toolu_01CNNQJDHN6VMzE7AP5D55c8 text=251b images=0
    toolu_013Ay11xEsYfVvQGXBhq9NiC text=573b images=0
    toolu_01LcFkdoCa3wSqdsccjFQcVL text=2634b images=0
    toolu_017eqn1BRAAAvZZjAofAiCno text=887b images=0
    toolu_017DHV1Et5yhpzxQN1Z4b6xj text=95b images=0
    toolu_019yziEBGPRY7yY9dVTBhcik text=95b images=0
    toolu_013djJDXwXmU1S9G42KVJZPb text=251b images=0
    toolu_01NWpyNjtrruLj1pHkokQtdR text=374b images=0
    toolu_01Xx6HPx8qFJzyE1EWTKpLRq text=339b images=0
    toolu_019QEff69tHeeLTomzChoCDR text=1941b images=0
    toolu_01WHWkhhDAG41ZdYF8p11iUN text=92b images=0
    toolu_01SAy6E5HuJSHULV28cnaEPR text=92b images=0
    toolu_016Kztpgn2P58QHoerHAsDPu text=147b images=0
    toolu_011TNRfSFFSmXsa28vb524Qh text=46b images=0
    toolu_01BREZHNtvedPgESZrXySoPw text=315b images=0
    toolu_01CLLE1LJp7v4UdczSNjrtt6 text=95b images=0
    toolu_014i3esZoRwJapV9DV7zsKdE text=653b images=0
    toolu_01RWbxVy7droY96yib3T3xA1 text=319b images=0
    toolu_01XcMuNY4G64u6JD4pJ3NpYA text=123b images=0
    toolu_01FuovtNVkEsojdgYV6iLkWb text=92b images=0
    toolu_01UoaNaYZGysvwNetRVPWs6w text=92b images=0
    toolu_01FcLVxsR8Vs24k3zCii4Qrm text=95b images=0
    toolu_01EnZ27iBKU7YVAfg3WKbmkP text=95b images=0
    toolu_0118g3qidVYX7jTQNP12r8Yf text=681b images=0
    toolu_01CyTYnKJLJqnj6CbnUUSGuN text=915b images=0
    toolu_01Si6Rreny6kEceeUmXj8w2k text=280b images=0
    toolu_01AN7puXH3AAVBPnBQxL1C9D text=945b images=0"
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

test("extractResult preserves tool error status", () => {
  expect(
    extractResult({
      type: "tool_result",
      tool_use_id: "err",
      content: "failed",
      is_error: true,
    }).isError,
  ).toBe(true)
  expect(
    extractResult({
      type: "tool_result",
      tool_use_id: "ok",
      content: "done",
    }).isError,
  ).toBe(false)
})
