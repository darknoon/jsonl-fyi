#!/usr/bin/env bun
import { Glob } from "bun"
import { iterJsonlLines } from "../src/parse/iter"
import { classifyJsonl } from "../src/parse/classify"
import { homedir } from "os"

type Result = { path: string; label: ReturnType<typeof classifyJsonl>; expected: "claude" | "codex" }

async function* walk(root: string, pattern: string, expected: "claude" | "codex"): AsyncGenerator<Result> {
  const glob = new Glob(pattern)
  for await (const path of glob.scan({ cwd: root, absolute: true, onlyFiles: true })) {
    const file = Bun.file(path)
    // Skip empty files
    if (file.size === 0) continue
    const text = await file.text()
    const headLines: unknown[] = []
    for (const v of iterJsonlLines(text)) {
      headLines.push(v)
      if (headLines.length >= 10) break
    }
    // Skip files with no recognizable transcript content
    const label = classifyJsonl(headLines)
    if (label === "unknown") continue
    yield { path, label, expected }
  }
}

const home = homedir()
const counts = { claude: 0, codex: 0, unknown: 0, mismatch: 0 }
const mismatches: Result[] = []

for await (const r of walk(`${home}/.claude/projects`, "**/*.jsonl", "claude")) {
  counts[r.label]++
  if (r.label !== r.expected) {
    counts.mismatch++
    mismatches.push(r)
  }
}
for await (const r of walk(`${home}/.codex/sessions`, "**/rollout-*.jsonl", "codex")) {
  counts[r.label]++
  if (r.label !== r.expected) {
    counts.mismatch++
    mismatches.push(r)
  }
}

console.log("counts:", counts)
if (mismatches.length > 0) {
  console.log("\nmismatches (first 10):")
  for (const m of mismatches.slice(0, 10)) {
    console.log(`  ${m.label} (expected ${m.expected})  ${m.path}`)
  }
  process.exit(1)
}
console.log("\nall files classified as expected ✓")
