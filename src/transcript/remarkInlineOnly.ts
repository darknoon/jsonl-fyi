import type { Plugin } from "unified"
import type { Root, RootContent, Parent, Text } from "mdast"
import { toMarkdown } from "mdast-util-to-markdown"
import { gfmToMarkdown } from "mdast-util-gfm"

const BLOCK_TYPES = new Set([
  "heading",
  "list",
  "listItem",
  "code", // fenced/indented code block (inline code is `inlineCode`)
  "blockquote",
  "thematicBreak",
  "table",
  "tableRow",
  "tableCell",
])

function nodeToSource(node: RootContent): string {
  // Stringify the disallowed node back to its Markdown source so the literal
  // characters survive into the rendered output.
  return toMarkdown(node, { extensions: [gfmToMarkdown()] }).trimEnd()
}

export const remarkInlineOnly: Plugin<[], Root> = () => tree => {
  function walk(parent: Parent) {
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i]
      if (BLOCK_TYPES.has(child.type)) {
        const text: Text = { type: "text", value: nodeToSource(child as RootContent) }
        ;(parent.children as RootContent[])[i] = text
        continue
      }
      if ("children" in child) walk(child as Parent)
    }
  }
  walk(tree)
}
