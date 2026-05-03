import { EXAMPLES, exampleHref, formatBytes } from "./examples"
import type { Example } from "./examples"
import { FileIcon } from "./FileIcon"

type Props = {
  onSelect: (example: Example) => void
}

const FORMAT_LABELS: Record<Example["format"], string> = {
  claude: "Claude Code",
  codex: "Codex",
  pi: "Pi",
}

export function Examples({ onSelect }: Props) {
  if (EXAMPLES.length === 0) return null
  return (
    <section className="examples">
      <h2 className="examples-header">Examples</h2>
      <ul className="examples-list">
        {EXAMPLES.map((example) => (
          <li key={example.fileName}>
            <a
              href={exampleHref(example)}
              className="example-row"
              onClick={(event) => {
                event.preventDefault()
                onSelect(example)
              }}
            >
              <FileIcon format={example.format} />
              <span className="example-row-title">{example.name}</span>
              <span className="example-row-meta">
                {FORMAT_LABELS[example.format]} • {example.turns} turns •{" "}
                {formatBytes(example.sizeBytes)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
