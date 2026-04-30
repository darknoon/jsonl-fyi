import type { Plugin } from "unified"
import type { Root, Image, Html, Link, Parent, Text, RootContent } from "mdast"
import { visit } from "unist-util-visit"

const ALLOWED_SCHEMES = /^(https?:|mailto:)/i

function imageToText(node: Image): Text {
  // Reconstruct `![alt](url "title")` from the parsed node. Title is rare
  // but preserved when present so we never drop characters the author wrote.
  const title = node.title ? ` "${node.title}"` : ""
  return { type: "text", value: `![${node.alt ?? ""}](${node.url}${title})` }
}

function linkToText(node: Link): Text {
  // Children of a link are themselves mdast nodes (e.g. text, emphasis).
  // For literal-text fallback we only need the plain-text concatenation.
  const inner = node.children
    .map(c => (c.type === "text" ? c.value : ""))
    .join("")
  const title = node.title ? ` "${node.title}"` : ""
  return { type: "text", value: `[${inner}](${node.url}${title})` }
}

function htmlToText(node: Html): Text {
  return { type: "text", value: node.value }
}

export const remarkKeepDisallowed: Plugin<[], Root> = () => tree => {
  visit(tree, (node, index, parent: Parent | undefined) => {
    if (!parent || index === undefined) return
    if (node.type === "image") {
      ;(parent.children as RootContent[])[index] = imageToText(node as Image)
      return
    }
    if (node.type === "html") {
      ;(parent.children as RootContent[])[index] = htmlToText(node as Html)
      return
    }
    if (node.type === "link") {
      const link = node as Link
      if (!ALLOWED_SCHEMES.test(link.url)) {
        ;(parent.children as RootContent[])[index] = linkToText(link)
      }
      return
    }
  })
}
