# [jsonl.fyi](https://jsonl.fyi/)

A local-first web viewer for agent transcript `.jsonl` files. Drop in a transcript and `jsonl.fyi` renders the conversation with messages, tool calls, diffs, images, thinking blocks, timing, token usage, and model labels.

Supported formats:

- Claude Code project transcripts from `~/.claude/projects/`
- OpenAI Codex rollout transcripts from `~/.codex/sessions/`
- pi agent traces

Files are processed in the browser. The app stores only small recently opened files in `sessionStorage` so refresh/back navigation works during a session.

## Development

Install dependencies:

```sh
bun install
```

Run the dev server:

```sh
bun dev
```

Build for production:

```sh
bun run build
```

Run typechecking, linting, and formatting checks:

```sh
bun run check
```

The transcript renderers are organized by source format. Claude Code, Codex, and pi have separate parse/render trees and share common UI pieces from `src/transcript/`.

### Deployment

The site is deployed as a Cloudflare Worker with Static Assets. Configuration lives in `wrangler.jsonc`, with SPA fallback enabled for example routes.

Production domains:

- `https://jsonl.fyi`
- `https://www.jsonl.fyi`

Deploys are triggered by Cloudflare's GitHub integration on pushes to `main`.
