import { test, expect } from "bun:test"
import { iterJsonlLines, iterJsonlStream } from "./iter"

test("iterJsonlLines: yields one parsed value per non-empty line", () => {
  const text = ['{"a":1}', '{"b":2}', "", '{"c":3}'].join("\n")
  const out = []
  for (const v of iterJsonlLines(text)) out.push(v)
  expect(out).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }])
})

test("iterJsonlLines: malformed lines are skipped, count exposed via return", () => {
  const text = ['{"a":1}', "not json", "", '{"b":2}'].join("\n")
  const it = iterJsonlLines(text)
  const values = []
  let result = it.next()
  while (!result.done) {
    values.push(result.value)
    result = it.next()
  }
  expect(values).toEqual([{ a: 1 }, { b: 2 }])
  expect(result.value).toEqual({ skipped: 1 })
})

test("iterJsonlLines: empty input yields nothing, skipped=0", () => {
  const it = iterJsonlLines("")
  const result = it.next()
  expect(result.done).toBe(true)
  expect(result.value).toEqual({ skipped: 0 })
})

function byteStream(text: string, chunkSize: number): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  let offset = 0
  return new ReadableStream({
    pull(controller) {
      if (offset === bytes.length) {
        controller.close()
        return
      }
      const end = Math.min(offset + chunkSize, bytes.length)
      controller.enqueue(bytes.slice(offset, end))
      offset = end
    },
  })
}

async function consumeStream(it: ReturnType<typeof iterJsonlStream>) {
  const values: unknown[] = []
  let result = await it.next()
  while (!result.done) {
    values.push(result.value)
    result = await it.next()
  }
  return { values, ...result.value }
}

test("iterJsonlStream preserves UTF-8 and CRLF split across byte boundaries", async () => {
  const text = '\uFEFF{"text":"héllo 🌿"}\r\n\r\nnot json\r\n{"final":true}'
  const progress: number[] = []
  const stream = byteStream(text, 1)
  const result = await consumeStream(
    iterJsonlStream(stream, {
      onProgress: (bytes) => {
        progress.push(bytes)
      },
    }),
  )
  expect(result).toEqual({ values: [{ text: "héllo 🌿" }, { final: true }], skipped: 1 })
  expect(progress.at(-1)).toBe(new TextEncoder().encode(text).length)
  expect(progress.every((value, index) => index === 0 || value > progress[index - 1])).toBe(true)
  expect(stream.locked).toBe(false)
})

test("iterJsonlStream assembles long records and counts a malformed final line", async () => {
  const record = { output: "x".repeat(100_000) }
  const stream = byteStream(`${JSON.stringify(record)}\nnull\nfalse\n{"unfinished":`, 512)
  expect(await consumeStream(iterJsonlStream(stream))).toEqual({
    values: [record, null, false],
    skipped: 1,
  })
})

test("iterJsonlStream handles empty input and a trailing newline", async () => {
  for (const text of ["", " \r\n"]) {
    expect(await consumeStream(iterJsonlStream(byteStream(text, 2)))).toEqual({
      values: [],
      skipped: 0,
    })
  }
  expect(await consumeStream(iterJsonlStream(byteStream("{}\n", 8)))).toEqual({
    values: [{}],
    skipped: 0,
  })
})

test("iterJsonlStream propagates read failures and releases the reader", async () => {
  const failure = new Error("Disk read failed")
  let reads = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (reads++ === 0) controller.enqueue(new TextEncoder().encode("{}\n"))
      else controller.error(failure)
    },
  })
  const it = iterJsonlStream(stream)
  expect((await it.next()).value).toEqual({})
  expect(await it.next().catch((error: unknown) => error)).toBe(failure)
  expect(stream.locked).toBe(false)
})

test("iterJsonlStream cancels a pending read on abort and releases the reader", async () => {
  const controller = new AbortController()
  const reason = new Error("Cancelled")
  const cancellations: unknown[] = []
  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      streamController.enqueue(new TextEncoder().encode("{}\n"))
    },
    cancel(value) {
      cancellations.push(value)
    },
  })
  const it = iterJsonlStream(stream, { signal: controller.signal })
  await it.next()
  const pending = it.next()
  controller.abort(reason)
  expect(await pending.catch((error: unknown) => error)).toBe(reason)
  expect(cancellations).toEqual([reason])
  expect(stream.locked).toBe(false)
})

test("iterJsonlStream cancels when its consumer stops early", async () => {
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("{}\n{}\n"))
    },
    cancel() {
      cancelled = true
    },
  })
  const it = iterJsonlStream(stream)
  await it.next()
  await it.return({ skipped: 0 })
  expect(cancelled).toBe(true)
  expect(stream.locked).toBe(false)
})

test("iterJsonlStream honors cancellation while delivering the final line at EOF", async () => {
  const controller = new AbortController()
  const reason = new Error("Cancelled at EOF")
  const stream = byteStream("{}", 8)
  const it = iterJsonlStream(stream, { signal: controller.signal })
  expect((await it.next()).value).toEqual({})
  controller.abort(reason)
  expect(await it.next().catch((error: unknown) => error)).toBe(reason)
  expect(stream.locked).toBe(false)
})
