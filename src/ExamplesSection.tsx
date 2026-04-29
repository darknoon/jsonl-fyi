import { EXAMPLES, exampleStats, formatBytes } from "./examples"

type Props = {
  onSelect: (content: string, fileName: string, persist?: boolean) => void
}

export function Examples({ onSelect }: Props) {
  if (EXAMPLES.length === 0) return null
  return (
    <section className="examples">
      <h2 className="examples-header">Examples</h2>
      <ul className="examples-list">
        {EXAMPLES.map(example => {
          const { turns, sizeBytes } = exampleStats(example.content)
          return (
            <li key={example.fileName}>
              <button
                type="button"
                className="example-row"
                onClick={() => onSelect(example.content, example.fileName, false)}
              >
                <span className="example-row-title">{example.name}</span>
                <span className="example-row-meta">
                  ({turns} turns, {formatBytes(sizeBytes)})
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
