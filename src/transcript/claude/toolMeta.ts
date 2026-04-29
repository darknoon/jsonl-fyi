export function shortPath(p: string): string {
  if (typeof p !== "string") return ""
  const parts = p.split("/")
  return parts.length > 2 ? `.../${parts.slice(-2).join("/")}` : parts.join("/")
}
