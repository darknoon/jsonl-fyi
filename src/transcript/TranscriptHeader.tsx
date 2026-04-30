import { formatChatStart, type FormatChatStartOptions } from "./timing"
import type { ModelDisplay } from "./model"

type Props = {
  startTimestamp: string
  models?: ModelDisplay[]
  formatOptions?: FormatChatStartOptions
}

export function TranscriptHeader({ startTimestamp, models, formatOptions }: Props) {
  const date = formatChatStart(startTimestamp, formatOptions)
  const hasModels = models != null && models.length > 0
  return (
    <div className="transcript-header">
      {hasModels && (
        <span className="transcript-header-models">
          {models!.map((m, i) => (
            <span key={`${m.raw}-${i}`}>
              {i > 0 && ", "}
              <span title={m.raw}>{m.label}</span>
            </span>
          ))}
          {" • "}
        </span>
      )}
      {date}
    </div>
  )
}
