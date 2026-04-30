# Vite migration spec

**Date:** 2026-04-29
**Status:** Ready for implementation

## Motivation

The current `bun index.html` dev server serves stale content-hashed bundles after source edits — the asset URL hash is supposed to bust on change, but in practice `bun index.html` (without `--hot`) keeps serving the old bundle until you restart the process. This has caused multiple sessions of "why isn't my CSS change showing up". HMR is unreliable.

Vite has fast, reliable HMR; identical HTML-as-entry model; first-class TS/React support. Production output stays a static SPA on Vercel — no behavioral change.

## Goals

- Replace `bun index.html` (dev) and `bun build` (prod) with `vite` and `vite build`
- Fix dev-server staleness
- Keep `bun test` for unit tests (independent of bundler)
- Keep all existing functionality and routes

## Non-goals

- Switch to Vitest. `bun:test` is not coupled to the bundler; tests keep working.
- Remove Bun as a runtime. We still use `bun` for scripts and tests.
- Restructure the source tree.

## Constraints

- Vercel deployment must keep working with the existing `vercel.json` rewrite (`/examples/:path*` → `/index.html`).
- TypeScript types for `import.meta.env` must be available (Vite ships `vite/client`).
- The two `import ... with { type: "file" }` Bun-specific imports for JSONL fixtures must be replaced.
- The `process.env.NODE_ENV` check guarding the dev-only Agentation toolbar must be replaced with `import.meta.env.DEV` so Vite tree-shakes the dev import in production.
- `index.html` lives at repo root and references `./src/index.tsx` and `./src/styles.css`. Vite handles this layout natively.

## API surface changes

| Before                                                              | After                                 |
| ------------------------------------------------------------------- | ------------------------------------- |
| `bun index.html`                                                    | `vite` (dev)                          |
| `bun build ./index.html --outdir=dist --production --public-path=/` | `vite build` (prod)                   |
| `import x from "./fixture.jsonl" with { type: "file" }`             | `import x from "./fixture.jsonl?url"` |
| `process.env.NODE_ENV !== "production"`                             | `import.meta.env.DEV`                 |
| `bun test`                                                          | `bun test` (unchanged)                |
| `bun run check` (`tsgo --noEmit && oxlint`)                         | unchanged                             |

## Files touched

| File              | Action            | Reason                                                                          |
| ----------------- | ----------------- | ------------------------------------------------------------------------------- |
| `package.json`    | modify            | Add `vite`, `@vitejs/plugin-react` to devDeps; update `dev` and `build` scripts |
| `vite.config.ts`  | create            | Vite config with React plugin                                                   |
| `src/examples.ts` | modify            | Replace `with { type: "file" }` with `?url` suffix                              |
| `src/App.tsx`     | modify            | Replace `process.env.NODE_ENV` with `import.meta.env.DEV`                       |
| `tsconfig.json`   | modify            | Add `vite/client` to `types` (alongside `bun`) for `import.meta.env` typing     |
| `index.html`      | unchanged         | Vite uses it as-is                                                              |
| `vercel.json`     | unchanged         | `vite build` outputs to `dist/`, matching the existing config                   |
| `bunfig.toml`     | unchanged         | Test preload config still applies                                               |
| `bun.lock`        | regenerated       | New deps                                                                        |
| `dist/`           | unchanged in repo | gitignored                                                                      |

## Risks and mitigations

**Risk:** `bun:test` breaks because tests do `import "./examples"` which uses `?url`.
**Mitigation:** Vite recognizes `?url` and so does Bun in modern versions — but verify in Task 4 (run `bun test` after the swap). If Bun barfs on `?url`, fall back to a small `__fixtures__/index.ts` shim or read the file with `import.meta.url` in the test environment. We'll know by running tests.

**Risk:** Vite's default base path differs from `--public-path=/`.
**Mitigation:** Vite's default `base: "/"` matches. No config needed.

**Risk:** Production build output structure differs (asset hashing, manifest).
**Mitigation:** Vite outputs to `dist/` with `index.html` at the root by default — same shape Vercel currently expects.

**Risk:** Lost the `--production` flag minification settings.
**Mitigation:** `vite build` defaults to minified production output.

## Verification

After migration:

1. `bun run dev` opens at `http://localhost:5173`, shows the app, hot-reloads on edits
2. `bun run build` produces a `dist/` directory with `index.html` and hashed assets
3. `bun test` passes (3 test files, including `examples.test.ts`)
4. `bun run check` passes
5. Manual: drop a JSONL into the dev server, verify it parses
6. Manual: visit `/examples/<filename>.jsonl` route in dev, confirm it loads (Vite's dev server handles SPA fallback)
