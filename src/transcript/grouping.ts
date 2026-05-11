export type ToolDiff =
  | { kind: "edit"; filePath: string; oldString: string; newString: string }
  | {
      kind: "patch"
      filePath: string
      patch: string // unified-diff text for this single file
      op: "add" | "update" | "delete"
    }
