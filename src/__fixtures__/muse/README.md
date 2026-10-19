# Synthetic Muse Code examples

Both files are handwritten, invented recipe conversations. Identifiers,
model labels, prompts, results, paths, dates and image pixels are fictional.
They follow the field shapes used by the reader and contain no real session
content. See [the session-data rules](../../../docs/session-data.md).

- `muse-session.jsonl`: durable records and a retained transaction frame,
  out-of-order tool results, arguments, a reasoning summary, an embedded
  generated checkerboard PNG, an empty-prompt follow-up and an omission marker.
- `muse-code.jsonl`: live event ledger with two user turns, task/call pairing,
  repeated output, failed tools, edit metadata and a missing image.

The durable frame checksum is an invented placeholder. The reader preserves
checksum fields but does not authenticate frames. Tests separately cover
malformed frames, ambiguous IDs, unsupported schemas and missing data.
