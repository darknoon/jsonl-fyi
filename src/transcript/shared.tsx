import type { ReactNode } from "react"
import type { ImageSource, ToolResult } from "../types"
import { CopyButton } from "./CopyButton"
import { ImageBlock } from "./ImageBlock"

// Compile-time check that a tool component handles every field of its input
// type. After destructuring, pass `...rest` here; if any field was missed,
// `rest` will be non-empty and TS rejects the assignment to Record<string,
// never>. Add a field to the input type → that tool's component fails to
// build until the field is destructured (and thus visibly handled).
export function assertExhaustive(_rest: Record<string, never>): void {
  void _rest
}

export type CardProps<I> = {
  input: I
  output: ToolResult
}

export function Header({ children }: { children: ReactNode }) {
  return <span className="tool-title">{children}</span>
}

export function Field({ name, value }: { name: string; value: ReactNode }) {
  const copyable = typeof value === "string" || typeof value === "number"
  return (
    <div className="tool-field">
      <dt>{name}</dt>
      <dd className={copyable ? "copy-host" : undefined}>
        <code>{value}</code>
        {copyable && (
          <CopyButton
            text={String(value)}
            ariaLabel={`Copy ${name}`}
            className="copy-button-field"
          />
        )}
      </dd>
    </div>
  )
}

export function toolResultText(output: ToolResult): string {
  return output.content
    .filter((item): item is Extract<ToolResult["content"][number], { type: "text" }> => item.type === "text")
    .map((item) => item.text)
    .join("\n")
}

export function toolResultImages(output: ToolResult): ImageSource[] {
  return output.content
    .filter((item): item is Extract<ToolResult["content"][number], { type: "image" }> => item.type === "image")
    .map((item) => item.source)
}

export function Output({ output }: { output: ToolResult }) {
  const text = toolResultText(output)
  if (!text) return null
  return (
    <pre className="output copy-host">
      {text}
      <CopyButton text={text} ariaLabel="Copy output" />
    </pre>
  )
}

export function ToolResultContent({ output }: { output: ToolResult }) {
  return (
    <>
      {output.content.map((item, i) => {
        if (item.type === "text") {
          return (
            <pre key={i} className="output copy-host">
              {item.text}
              <CopyButton text={item.text} ariaLabel="Copy output" />
            </pre>
          )
        }
        return <ImageBlock key={i} source={item.source} />
      })}
    </>
  )
}

export function Extras({ output }: { output: ToolResult }) {
  return (
    <>
      {toolResultImages(output).map((src, i) => (
        <ImageBlock key={i} source={src} />
      ))}
    </>
  )
}

export function hasOutput(output: ToolResult): boolean {
  return output.content.length > 0
}

export function ToolTitle({ name, detail }: { name: string; detail?: ReactNode }) {
  return (
    <>
      <strong className="tool-title-name">{name}</strong>
      {detail != null && (
        <>
          <span className="tool-title-paren">(</span>
          <span className="tool-title-detail">{detail}</span>
          <span className="tool-title-paren">)</span>
        </>
      )}
    </>
  )
}
