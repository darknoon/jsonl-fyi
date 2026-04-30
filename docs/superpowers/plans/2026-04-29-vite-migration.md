# Vite migration implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Bun's HTML-import dev server and bundler with Vite while keeping `bun:test` for tests, fixing the stale-bundle dev issue.

**Architecture:** Vite uses `index.html` at the repo root as its dev/build entry — same shape Bun was using. We swap two Bun-specific imports (`with { type: "file" }` → `?url`) and one runtime check (`process.env.NODE_ENV` → `import.meta.env.DEV`). Tests are unchanged.

**Tech Stack:** Vite 5+, `@vitejs/plugin-react`, React 19, TypeScript, Bun (still used as runtime + test runner).

**Spec:** `docs/superpowers/specs/2026-04-29-vite-migration.md`

---

## File structure

| File | Responsibility |
|---|---|
| `vite.config.ts` (new) | Vite config — React plugin, dev server port, build output |
| `package.json` | Updated `dev`/`build` scripts, new devDeps |
| `tsconfig.json` | Add `vite/client` to `types` |
| `src/examples.ts` | Use `?url` for fixture URLs |
| `src/App.tsx` | Use `import.meta.env.DEV` for dev toolbar lazy-load gate |

---

### Task 1: Install Vite and create config

**Files:**
- Modify: `package.json`
- Create: `vite.config.ts`

- [ ] **Step 1: Install dev dependencies**

```bash
bun add -d vite @vitejs/plugin-react
```

Expected: `bun.lock` updates; `vite` and `@vitejs/plugin-react` added to `devDependencies` in `package.json`.

- [ ] **Step 2: Create `vite.config.ts`**

```ts
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
})
```

The dev port is set to 3000 to match the previous `bun index.html` default — keeps muscle memory and avoids breaking any local bookmarks. Vercel doesn't care about the dev port.

- [ ] **Step 3: Update `package.json` scripts**

Replace the `dev` and `build` script values:

```json
"dev": "vite",
"build": "vite build",
```

Leave `check` alone.

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock vite.config.ts
git commit -m "build: add vite and replace dev/build scripts"
```

---

### Task 2: Replace Bun-specific fixture imports

**Files:**
- Modify: `src/examples.ts:12-17`

- [ ] **Step 1: Replace the two `with { type: "file" }` imports**

Edit `src/examples.ts`. Find:

```ts
// eslint-disable-next-line
// @ts-ignore — Bun handles `with { type: "file" }` at bundle time
import sampleUrl from "./__fixtures__/sample.jsonl" with { type: "file" }
// eslint-disable-next-line
// @ts-ignore — Bun handles `with { type: "file" }` at bundle time
import codexSampleUrl from "./__fixtures__/codex-sample.jsonl" with { type: "file" }
```

Replace with:

```ts
import sampleUrl from "./__fixtures__/sample.jsonl?url"
import codexSampleUrl from "./__fixtures__/codex-sample.jsonl?url"
```

Vite's `?url` query suffix makes the import resolve to a public URL string at build time. The `as string` casts in the `load` arrow functions stay as-is since `sampleUrl` is now typed `string` directly (Vite's `vite/client` types declare `?url` imports as `string`).

- [ ] **Step 2: Update the file's leading comment**

Replace the existing comment block (lines 1-10) with:

```ts
// Examples load asynchronously so JSONL fixture text isn't shipped in the
// initial JS bundle. The `?url` suffix tells Vite to copy the fixture into
// the build output as a static asset and replace the import with the
// asset's URL string. The asset is fetched only when the user clicks the
// row.
```

- [ ] **Step 3: Drop redundant `as string` casts**

In `src/examples.ts`, the two `load: () => fetchText(sampleUrl as string)` lines no longer need the cast. Change to:

```ts
load: () => fetchText(sampleUrl),
load: () => fetchText(codexSampleUrl),
```

- [ ] **Step 4: Commit**

```bash
git add src/examples.ts
git commit -m "refactor(examples): use vite ?url import for fixture URLs"
```

---

### Task 3: Replace `process.env.NODE_ENV` with `import.meta.env.DEV`

**Files:**
- Modify: `src/App.tsx:15-22`

- [ ] **Step 1: Update the lazy-load conditional**

Edit `src/App.tsx`. Find:

```tsx
// Dev-only: load the Agentation visual-feedback toolbar dynamically so it
// gets tree-shaken out of production builds. The conditional below is a
// build-time constant after Bun substitutes process.env.NODE_ENV, so the
// import() is unreachable (and therefore omitted) in prod.
const AgentationDev =
  process.env.NODE_ENV !== "production"
    ? lazy(() => import("./AgentationDev"))
    : null
```

Replace with:

```tsx
// Dev-only: load the Agentation visual-feedback toolbar dynamically so it
// gets tree-shaken out of production builds. `import.meta.env.DEV` is a
// build-time constant Vite inlines, so the import() is unreachable
// (and therefore omitted) in prod.
const AgentationDev = import.meta.env.DEV
  ? lazy(() => import("./AgentationDev"))
  : null
```

- [ ] **Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "refactor(app): use import.meta.env.DEV for vite tree-shaking"
```

---

### Task 4: Add Vite client types to tsconfig

**Files:**
- Modify: `tsconfig.json`

- [ ] **Step 1: Add `vite/client` to `types`**

Edit `tsconfig.json`. Find:

```json
"types": ["bun"]
```

Replace with:

```json
"types": ["bun", "vite/client"]
```

This brings in the type for `import.meta.env.DEV` and for `?url` imports.

- [ ] **Step 2: Verify typecheck passes**

Run: `bun run check`
Expected: PASS (no type errors).

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "build: add vite/client types for import.meta.env and ?url imports"
```

---

### Task 5: Verify dev server, build, and tests

**Files:** none modified (verification only)

- [ ] **Step 1: Run tests**

Run: `bun test`
Expected: all tests pass (formatBytes, exampleHref, findExampleByPath, plus any other suites).

If `bun test` fails on the `?url` import in `examples.ts`:
- Modern Bun (1.1+) understands `?url` as a no-op and resolves to the file URL.
- If it doesn't: add a small shim in `src/__fixtures__/index.ts` exporting the file path as a `string` constant, and import that in `examples.ts` instead. Re-run tests.

- [ ] **Step 2: Run typecheck**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 3: Run dev server**

Run: `bun run dev`
Expected: Vite starts and prints `Local: http://localhost:3000/`.

Manually verify (in a browser):
- Page loads, drop zone visible
- Drop a JSONL file → renders transcript
- Visit `/examples/<filename>.jsonl` → loads the example
- Edit `src/styles.css` → HMR shows the change without reload

Stop the dev server when done.

- [ ] **Step 4: Run production build**

Run: `bun run build`
Expected: builds successfully, produces `dist/index.html` and hashed assets in `dist/assets/`.

Spot-check `dist/`:
```bash
ls dist
ls dist/assets | head
```

You should see one or more `*.js` and `*.css` files in `dist/assets/` and an `index.html` at `dist/`.

- [ ] **Step 5: Smoke-test the production build locally**

Run: `bunx serve dist -p 4173`
Expected: serves the built site on port 4173.

Visit `http://localhost:4173/` and confirm the app loads, then visit `/examples/0dc40511-6d23-4460-9e5b-ecb10e418fe7.jsonl` and confirm the example loads.

Note: `serve` won't apply the Vercel rewrite, so the `/examples/...` route may 404. If so, that's expected — the rewrite is Vercel's job, not the static server's. To confirm SPA behavior, refresh on `/` first, then click the example link in the UI rather than hitting the URL directly.

Stop the static server.

- [ ] **Step 6: Commit any incidental changes**

If verification turned up no edits beyond what Tasks 1–4 introduced, skip this step. Otherwise, commit with a clear message describing the fix.

---

### Task 6: Drop unused Bun build-time docs and clean up

**Files:**
- Modify: `src/examples.ts` (already cleaned in Task 2 — verification step)
- Optional: README/docs references to the old `bun build` flow, if any

- [ ] **Step 1: Search for stale references to `bun index.html` or `bun build`**

Run:
```bash
grep -rn "bun index.html\|bun build" --include="*.md" --include="*.json" --include="*.ts" --include="*.tsx" .
```

Expected hits: only inside the spec/plan docs themselves (as historical context). If any other file (e.g. a README or contributing guide) still says "run `bun index.html` to dev", update it to `bun run dev`.

- [ ] **Step 2: Commit if anything changed**

```bash
git add <updated files>
git commit -m "docs: update stale references to bun dev/build commands"
```

If nothing changed, skip the commit.

---

## Self-review

**Spec coverage:**
- Replace `bun index.html` / `bun build` → Task 1 ✓
- Fix stale-bundle issue → resolved structurally by switching bundlers ✓
- Keep `bun test` → Task 5 verifies ✓
- `with { type: "file" }` → `?url` → Task 2 ✓
- `process.env.NODE_ENV` → `import.meta.env.DEV` → Task 3 ✓
- Vercel `vercel.json` unchanged → confirmed: `dist/` output dir matches ✓
- TypeScript types for `import.meta.env` → Task 4 ✓
- Verification (dev, build, tests, manual smoke) → Task 5 ✓

**Placeholder scan:** No "TBD", no "implement later", no abstract instructions without code. The fallback in Task 5 Step 1 names a concrete strategy if `bun test` rejects `?url`.

**Type consistency:** `sampleUrl` and `codexSampleUrl` go from `unknown`-via-`@ts-ignore` to typed `string` via `vite/client`. The downstream `fetchText(sampleUrl)` call no longer needs `as string`. Consistent across Task 2.
