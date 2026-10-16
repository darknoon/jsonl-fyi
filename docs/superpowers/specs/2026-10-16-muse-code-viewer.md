# Muse Code viewer prototype

Status: local prototype for review. This continues the existing viewer design
and adds durable session records alongside the live event ledger.

## Behavior

Accept one Muse JSONL file through the existing picker, drop target and
session restore. Detect records structurally. Keep the pure data layer
independent from React and the application. Use the existing tool cards,
markdown, reasoning blocks, image lightbox and view-mode controls.

Render recorded prompts, assistant messages, arguments, tool results and
embedded images. Keep empty-input runs distinct from missing prompts in
parser output, without adding turn labels or empty user bubbles. Reuse the
existing session header and turn separators; do not introduce format-specific
headings or raw-record disclosures. Pair calls/results by scoped identities,
preserve conflicts, and show unknown content in shared fallback cards.
Keep omitted-content markers in parser output. Show durable dates only after
clock validation; use explicit durations. Live-ledger timestamps remain raw.

The field and joining rules are in
[the format reference](../../research/muse-code-format.md).

## Review and verification

Use invented examples only in checked-in fixtures, screenshots and PR text.
The dev-only example opens a durable recipe conversation with an image and
follow-up. The live-ledger fixture exercises the alternate shape.

Verify classification, restored files, out-of-order and ambiguous pairing,
reasoning deduplication, image visibility, follow-ups, unknown schemas and
missing data in tests. Browser-check file loading, all view modes, unknown
record expansion, image enlargement and mobile overflow. Keep the worktree
preview running for review.

Companion-file loading, ATIF, deployment and other applications are outside
this prototype. Human review of docs, fixtures and PR text is required before
first push under [session-data.md](../../session-data.md).
