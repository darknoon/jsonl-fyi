import { EXAMPLES, exampleHref, formatBytes } from "./examples"
import type { Example } from "./examples"
import { FileIcon } from "./FileIcon"

type Props = {
  onSelect: (example: Example) => void
  activeFormat: Example["format"]
  onPreviewFormat: (format: Example["format"] | null) => void
}

const FORMAT_LABELS: Record<Example["format"], string> = {
  claude: "Claude Code",
  codex: "OpenAI Codex",
  pi: "Pi Coding Agent",
}

export function Examples({ onSelect, activeFormat, onPreviewFormat }: Props) {
  if (EXAMPLES.length === 0) return null
  return (
    <section className="examples">
      <h2 className="examples-header sr-only">Examples</h2>
      <ul className="examples-list">
        {EXAMPLES.map((example) => (
          <li
            key={example.fileName}
            className={activeFormat === example.format ? "example-card-active" : ""}
            onPointerEnter={() => onPreviewFormat(example.format)}
            onPointerLeave={() => onPreviewFormat(null)}
            onFocus={() => onPreviewFormat(example.format)}
            onBlur={() => onPreviewFormat(null)}
          >
            <a
              href={exampleHref(example)}
              className={`example-row example-row-${example.format}`}
              aria-label={`${FORMAT_LABELS[example.format]} example: ${example.name}, ${example.turns} turns, ${example.toolCalls} tool calls, ${formatBytes(example.sizeBytes)}`}
              onClick={(event) => {
                event.preventDefault()
                onSelect(example)
              }}
            >
              <span className="example-row-top">
                <span className="example-row-heading">
                  <FileIcon format={example.format} />
                  <span className="example-row-model">{FORMAT_LABELS[example.format]}</span>
                </span>
                <span className="example-row-kicker">Example</span>
              </span>
              <span className="example-row-title">{example.name}</span>
              <span className="example-row-meta">
                {example.turns} turns • {example.toolCalls} tool calls •{" "}
                {formatBytes(example.sizeBytes)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
