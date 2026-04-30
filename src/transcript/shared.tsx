import type { ReactNode } from "react"
import type { ToolResult } from "../types"
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

export function Header({
  children,
}: {
  children: ReactNode
}) {
  return <span className="tool-title">{children}</span>
}

export function Field({
  name,
  value,
}: {
  name: string
  value: ReactNode
}) {
  return (
    <div className="tool-field">
      <dt>{name}</dt>
      <dd>
        <code>{value}</code>
      </dd>
    </div>
  )
}

export function Output({ output }: { output: ToolResult }) {
  return output.text ? <pre className="output">{output.text}</pre> : null
}

export function Extras({ output }: { output: ToolResult }) {
  return (
    <>
      {output.toolRefs.length > 0 && (
        <div className="tool-refs">
          <div className="tool-refs-label">Loaded tools</div>
          <ul>
            {output.toolRefs.map((name, i) => (
              <li key={i}>{name}</li>
            ))}
          </ul>
        </div>
      )}
      {output.images.map((src, i) => (
        <ImageBlock key={i} source={src} />
      ))}
    </>
  )
}

export function hasOutput(output: ToolResult): boolean {
  return (
    !!output.text ||
    output.images.length > 0 ||
    output.toolRefs.length > 0
  )
}
