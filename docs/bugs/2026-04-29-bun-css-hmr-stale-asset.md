# Bug: `bun index.html` dev server serves stale CSS after edits

Date: 2026-04-29
Bun version observed: 1.3.13

## Symptom

Edits to `src/styles.css` are not reflected in the dev server's served CSS, even after a full browser reload (Cmd-R, ⇧Cmd-R, and `?nocache=…` query). JS HMR works in the same session — TSX edits hot-replace correctly. The stale-CSS state persists until the dev server is restarted.

## Reproduction in this session

1. Dev server already running: `bun index.html` → `http://localhost:3000/`.
2. Edited `src/styles.css` to remove `text-align: center` and `font-size: var(--fs-sm)` from `.drop-zone-hint`, and added `display: flex; gap: 6px` to `.app-footer`.
3. Reloaded the page in agent-browser.
4. Computed style still showed the old values.

## Evidence (the part that proves it isn't a "did the file save?" miss)

I did _not_ infer this from the screenshot alone. I compared on-disk vs. served-over-HTTP:

**Disk (`src/styles.css`):**

```css
.drop-zone-hint {
  margin: 24px 0 0;
  color: var(--muted);
}
```

**Served (`curl http://localhost:3000/_bun/asset/c561fa4eb3c3d4c8.css`):**

```css
.drop-zone-hint {
  text-align: center;
  font-size: var(--fs-sm);
  color: var(--muted);
  margin: 24px 0 0;
}
```

Same comparison for `.app-footer` showed the disk version had `display: flex; gap: 6px` and the served version still had only `text-align: center; color; margin-top; padding`.

Two corroborating signals:

- The CSS asset URL hash (`c561fa4eb3c3d4c8`) **did not change** across multiple edits. A content-hashed asset whose hash is unchanged means the bundler is reusing a cached pre-edit blob.
- `agent-browser eval "getComputedStyle(document.querySelector('.drop-zone-hint'))"` returned the old `textAlign: "center"` / `fontSize: "13px"` values, matching the served file, not the disk file.

## What was _not_ the cause

- Not a browser cache: cache-buster query (`?nocache=$(date +%s)`) returned the same stale CSS.
- Not a sessionStorage replay: the empty state was rendering, no transcript loaded.
- Not a sourcemap glitch: `curl` directly on the asset URL bypasses the browser entirely and showed the same stale content.
- Not the JS bundle: the JS hash _did_ update when I edited `App.tsx`, and the new JSX (lock icon, `<Examples />`) was present in the DOM.

## Resolution

Restarting `bun index.html` rebuilds the CSS asset and resumes correct serving. After the user restarted, the same `agent-browser eval` returned the new `textAlign: "left"` / `gap: "6px"` values without further code changes.

## Suggested filing

Worth a minimal repro against `oven-sh/bun`: a 2-rule CSS file under the HTML loader, edit one rule, observe that the served `/_bun/asset/<hash>.css` retains the pre-edit body and the hash doesn't roll. Likely a stale entry in the bundler's CSS-asset cache that misses the file watcher's `change` event for `.css` (while the JS watcher works).

## Operational note for future agents

When CSS edits don't appear:

1. Don't assume the agent typed it wrong — `cat src/styles.css | grep <rule>` to confirm disk state.
2. `curl <served-css-url> | grep <rule>` and compare. If disk and served diverge with no hash change, it's this bug.
3. Don't kill the user's dev server unprompted — the user has a standing rule about that. Ask them to restart.
