const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

export function isMuseDurableRecord(value: unknown): boolean {
  if (!object(value)) return false
  if (
    value.retained_frame === "session_permission_transaction" &&
    typeof value.frame_schema_version === "number" &&
    Array.isArray(value.children)
  )
    return true
  if (
    value.retained_marker === "omitted_live_only" &&
    object(value.stream) &&
    value.stream.kind === "session" &&
    object(value.omitted_record)
  )
    return true
  return (
    isMuseRecord(value) &&
    (value.payload_type === "runtime.session" ||
      (value.payload_type as string).startsWith("runtime.session.") ||
      (value.payload_type === "run.model.configured" &&
        object(value.payload) &&
        object(value.payload.record)))
  )
}

export function isMuseRecord(value: unknown): value is Record<string, unknown> {
  return (
    object(value) &&
    typeof value.schema_version === "number" &&
    typeof value.id === "string" &&
    object(value.stream) &&
    value.stream.kind === "session" &&
    typeof value.stream.id === "string" &&
    typeof value.sequence === "number" &&
    typeof value.record_type === "string" &&
    typeof value.payload_type === "string" &&
    /^(runtime\.|session\.|run\.|turn\.input\.|task\.|todo\.snapshot\.|tool\.|tool_batch\.)/.test(
      value.payload_type,
    ) &&
    object(value.payload)
  )
}
