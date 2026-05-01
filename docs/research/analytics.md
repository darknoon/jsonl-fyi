# Privacy-preserving analytics for jsonl.fyi

Captured 2026-05-01.

## Goals

- **Must:** rough geo (country), unique visitors, pageviews.
- **Nice:** anonymous custom events — tool-call counts, turns, total bytes loaded. Must not capture file contents, filenames, model names, or anything that could leak unreleased prompts/outputs.
- **Cost ceiling:** under ~$20/mo even on a Hacker News spike (50k–200k visitors/day).
- **Trust posture:** the audience is technical; whatever is loaded should be obviously trustworthy in DevTools — no cookies, no IP storage, ideally first-party.

## Options compared

| Tool | 0 / 10k / 100k pv | HN spike (~200k/day) | Cookies / IP | Custom events |
|---|---|---|---|---|
| **Cloudflare Web Analytics** | $0 / $0 / $0 | $0 | none / none | no (use WAE) |
| Plausible Cloud | $9 / $9 / $19 | $19 (no overage) | none / none | yes |
| Umami Cloud | $0 (1M events/mo free) | $0 | none / none | yes |
| Fathom | $15 flat | tier bump likely | none / none | yes |

All four meet the privacy bar. Only CFWA and Umami Cloud are truly $0.

### Notes

- **Plausible / Umami / Fathom** all sit on third-party domains and are blocked by EasyPrivacy / uBlock / Brave by default. Workarounds exist (proxy via Worker) but feel like the kind of "hides from blockers" trick that hurts trust here.
- **CFWA's beacon (`static.cloudflareinsights.com`) is also blocked** by EasyPrivacy. The mitigation is that Cloudflare's **edge analytics** (request count + country, derived server-side) still work for blocked visitors — lower-resolution but immune.
- **Umami self-host** can't run on Cloudflare Workers + D1 (Prisma schema assumes Postgres/MySQL); would need a $5/mo VPS.

## Decision: Cloudflare Web Analytics

Reasons specific to jsonl.fyi:
1. First-party Cloudflare beacon on a CF-hosted site = least-surprising thing a technical visitor could find in DevTools.
2. Free, no usage-based pricing — zero risk on a spike.
3. Pageviews + uniques + country breakdown all included.
4. Edge analytics give a blocker-immune fallback for the baseline numbers.

Trade-off accepted: no native custom events. Secondary metrics (tool/turn/byte counts) deferred to Workers Analytics Engine if/when they're worth the build.

## Setup status

CFWA is **already enabled** on `jsonl.fyi` via Cloudflare's automatic-injection path (orange-clouded Workers custom domain).

Verified 2026-05-01 in a clean headless Chrome:
- `<script src="https://static.cloudflareinsights.com/beacon.min.js/...">` is auto-injected at the edge
- `data-cf-beacon` token `28c07facc4d44334a2e6a71548347e4d`
- Beacon script returns 200

No script tag in the repo, no `wrangler.jsonc` changes needed.

### If auto-injection ever breaks

Fallback is a manual snippet just before `</body>` in `index.html`:

```html
<script defer src="https://static.cloudflareinsights.com/beacon.min.js"
  data-cf-beacon='{"token": "28c07facc4d44334a2e6a71548347e4d"}'></script>
```

If a CSP is ever added: allow `script-src https://static.cloudflareinsights.com` and `connect-src https://cloudflareinsights.com`.

## Workers Analytics Engine — punted

If we ever want anonymous custom events (turns, tool calls, total bytes), the path is:

- **Cost:** included in Workers Paid plan ($5/mo per account, already paid for `dave`). Free quota is 10M writes/day + 1M reads/month — well above any realistic jsonl.fyi traffic. Effectively $0 incremental.
- **Granularity:** Workers Paid is per-account, pooled across all Workers. `jsonl-fyi` and `dave` share the same bucket on account `9201656c081165a337b10d638bca8048` (`Andrew@darknoon.com's Account`).
- **Required changes:**
  1. Add a Worker entrypoint (`src/worker/index.ts`) that handles `POST /api/event` and falls through to `env.ASSETS.fetch` for everything else.
  2. Add `"main"` and `"assets": { ..., "binding": "ASSETS" }` plus an `analytics_engine_datasets` binding in `wrangler.jsonc`.
  3. Pick a tight schema, e.g. `blobs: [format]`, `doubles: [turns, toolCalls, totalBytes]`, `indexes: [format]`. No filenames, no content, no model names.
  4. Client fires `fetch('/api/event', { method: 'POST', body: JSON.stringify({...}) })` after a successful parse.
- **Querying:** Cloudflare dashboard SQL editor, or `POST /accounts/:id/analytics_engine/sql` with an Account Analytics Read token. No built-in dashboard — point Grafana at it if a UI is needed.

Decision deferred until there's a real reason to want the secondary metrics.

## References

- [Cloudflare Web Analytics — get started](https://developers.cloudflare.com/web-analytics/get-started/)
- [Web Analytics FAQs](https://developers.cloudflare.com/web-analytics/faq/)
- [Workers Analytics Engine — get started](https://developers.cloudflare.com/analytics/analytics-engine/get-started/)
- [Plausible pricing](https://plausible.io/#pricing) / [Umami pricing](https://umami.is/pricing) / [Fathom pricing](https://usefathom.com/pricing)
