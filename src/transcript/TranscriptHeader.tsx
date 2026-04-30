import { formatChatStart } from "./timing"

type Props = {
  startTimestamp: string
}

export function TranscriptHeader({ startTimestamp }: Props) {
  return <div className="transcript-header">{formatChatStart(startTimestamp)}</div>
}
