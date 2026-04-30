import { test, expect } from "bun:test"
import { iterJsonlLines } from "./iter"

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
