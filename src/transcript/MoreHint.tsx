export function MoreHint({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <div className="tool-more-hint">
      … +{count} {count === 1 ? "line" : "lines"}
    </div>
  )
}
