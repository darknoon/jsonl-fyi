#!/usr/bin/env bun
/**
 * One-shot anonymization script for the sample fixture.
 * Run: bun run scripts/anonymize.ts
 */

import { readFileSync, writeFileSync } from "node:fs"

const SRC =
  "/Users/andrew/.claude/projects/-Users-andrew-Developer-Web-Dave/04819ab3-be01-4118-8196-5dfc2a411442.jsonl"
const DST = new URL("../src/__fixtures__/sample.jsonl", import.meta.url).pathname

const raw = readFileSync(SRC, "utf8")
const lines = raw.split("\n")

const out = lines.map((line) => {
  if (!line.trim()) return line

  let obj: unknown
  try {
    obj = JSON.parse(line)
  } catch {
    return line
  }

  // Walk the parsed object and apply anonymization
  obj = transform(obj)

  return JSON.stringify(obj)
})

writeFileSync(DST, out.join("\n"), "utf8")
console.log(`Wrote ${DST} (${out.length} lines)`)

// ─── helpers ──────────────────────────────────────────────────────────────────

function transform(v: unknown): unknown {
  if (v === null || v === undefined) return v
  if (typeof v === "string") return scrubString(v)
  if (Array.isArray(v)) return v.map(transform)
  if (typeof v === "object") {
    const o = v as Record<string, unknown>
    const result: Record<string, unknown> = {}

    for (const [k, val] of Object.entries(o)) {
      // Rule 4: redact base64 image data in place
      if (
        k === "source" &&
        typeof val === "object" &&
        val !== null &&
        (val as Record<string, unknown>)["type"] === "base64"
      ) {
        const src = val as Record<string, unknown>
        result[k] = {
          type: "base64",
          media_type: src["media_type"],
          data: "REDACTED_BASE64",
        }
        continue
      }

      // Rule 3: redact gitBranch
      if (k === "gitBranch" && typeof val === "string") {
        result[k] = val === "main" || val === "master" ? val : "main"
        continue
      }

      result[k] = transform(val)
    }
    return result
  }
  return v
}

function scrubString(s: string): string {
  // Rule 1: absolute paths with /Users/andrew or /Users/<name>
  s = s.replace(/\/Users\/[^/\s"]+/g, "/Users/example")

  // Rule 2: project codename Dave/dave in paths and content
  s = s.replace(/Developer\/Web\/Dave/g, "Developer/example/project")
  s = s.replace(/Developer\/example\/project/g, "Developer/example/project") // idempotent
  // Replace standalone 'Dave' (word boundary) with 'Project', 'dave' with 'project'
  // Also covers mcp__dave__ style tool name segments
  s = s.replace(/\bDave\b/g, "Project")
  s = s.replace(/(?<=[^a-zA-Z]|^)dave(?=[^a-zA-Z]|$)/g, "project")
  // Handle dave in MCP-style double-underscore names: mcp__dave__
  s = s.replace(/mcp__dave__/g, "mcp__project__")

  // Rule 5: email addresses not ending in example.com
  s = s.replace(
    /[a-zA-Z0-9._%+-]+@(?!example\.com)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    "user@example.com",
  )

  // Rule 6: 32+ char hex or base64 tokens (API keys, auth headers)
  // Match long hex strings
  s = s.replace(/\b[0-9a-fA-F]{32,}\b/g, "REDACTED_TOKEN")
  // Match long base64-ish strings (letters, digits, +, /, =) that look like tokens
  // Only outside of normal text — require they aren't part of a URL or common word
  s = s.replace(/(?<![a-zA-Z])[A-Za-z0-9+/]{32,}={0,2}(?![a-zA-Z])/g, "REDACTED_TOKEN")

  return s
}
