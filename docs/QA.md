# Deadlockprohunger — Production-readiness QA

Second audit, 2026-10-07, on the production build (`next build` + `next start`), against the live Deadlock API. It re-checks the first audit (same day, morning) and fixes what was found. **Re-run** = checked again in this audit. **Carried** = verified in the first audit, with the code unchanged since then (only `features/meta/scope.ts` changed between the audits, and its tests pass).

Related: [PERFORMANCE](./PERFORMANCE.md) · [ACCESSIBILITY](./ACCESSIBILITY.md) · [API](./API.md) · [DATA_MODEL](./DATA_MODEL.md) · [DESIGN](./DESIGN.md)

## Gates (re-run after the fixes)

| Gate | Result |
|---|---|
| `npm run typecheck` | ✓ 0 errors |
| `npm run lint` (Oxlint) | ✓ 0 warnings |
| `npm test` (Vitest) | ✓ 173 / 173 (19 files; +4 rate-limiter tests) |
| `npm run build` | ✓ 19 routes (`/`, `/robots.txt`, `/icon.svg` and `/_not-found` static; the rest on demand) |
| `npm run api:verify` | ✓ 37 call sites → 28 endpoints current; no deprecated/MMR endpoints; params and fields match the live spec |
| `npm audit --omit=dev` | ✓ 0 vulnerabilities |

## Routes inspected

Each route was requested on the production server (status, time, `h1`, error notices), then audited with axe on desktop and mobile, and checked for horizontal overflow at 360 / 390 / 768 / 1024 px:

`/` · `/meta` · `/heroes` · `/heroes/haze` · `/builds` · `/builds/infernus/278481` · `/matches` · `/matches/112305615` · `/players` · `/players?q=a` · `/players/1871021649` · `/leaderboard` · `/compare` · `/compare?type=hero&a=haze&b=abrams` · `/draft` · `/draft?allies=haze&enemies=abrams` · `/design` · `/api/search` · `/api/cron/daily`, plus failure cases `/analyze` · `/nope` · `/heroes/zzz` · `/matches/abc` · `/matches/1` · `/players/-5`.

---

## 1. Status by category

| # | Category | Status | Summary |
|---|---|---|---|
| 1 | Product goals | **WARN** | All 10 MVP pages plus Compare and Draft Lab are live on real data. "Analyze" is in the primary nav but isn't built |
| 2 | UX principles | **PASS** | Insight-first pages, progressive disclosure, scope on every statistic |
| 3 | Design system | **PASS** | Tokens only; the one hex value is the viewport `themeColor` (can't take CSS variables) |
| 4 | API correctness | **PASS** | `api:verify` passes against the live spec |
| 5 | Data correctness | **PASS** | Statistical rules unit-tested; a rate limit never reads as missing data |
| 6 | Database integrity | **WARN** | Schema and repository tested on PGlite (real Postgres); not yet run against a deployed database |
| 7 | Responsive behavior | **PASS** | 0 overflow cases out of 56 (14 routes × 4 widths) |
| 8 | Accessibility | **PASS** | 0 axe violations on 13 routes × 2 viewports. **Fixed:** two undersized touch targets on Compare |
| 9 | Performance | **PASS** | Within budgets (carried); warm pages answer in 0.01–1.3 s, cold `/builds` in 3.2 s |
| 10 | IP / asset rules | **WARN** | Notice on every page, art isolated with a kill switch. Rights to hot-linked art not established |
| 11 | Error handling | **PASS** | Classified messages on every route; 404s return 404 + `noindex`. Their body is client-rendered (framework behavior, § 13) |
| 12 | Empty states | **PASS** | **Fixed:** a failed search said "Nothing matches" |
| 13 | Loading states | **WARN** | Section skeletons everywhere; no route-level loading UI; 404 content needs JS (see § 13) |
| 14 | Rate-limit handling | **PASS** | `/api/search` throttled per client; upstream calls go cache-first, then a per-class token bucket (only misses spend budget) |
| 15 | Security | **WARN** | Headers, server-only secrets, validated inputs, throttled search. No `script-src` CSP yet |

**No FAIL.** Release verdict in § 4.

---

## 2. Findings by category

### 1. Product goals — WARN
- **PASS:** every MVP page in [PRODUCT](./PRODUCT.md) returns 200 with real data: Home, Meta, Heroes, Hero Detail, Builds, Build Detail, Matches, Match Detail, Players, Player Detail, Leaderboard. Compare and Draft Lab (later phase) are live too. The Insight Engine runs on Hero Detail.
- **WARN:** `/analyze` is a primary-nav item and returns the "not built yet" 404. It isn't prefetched, but a primary destination that dead-ends is the most visible gap. Either build a first version (paste a match ID or player → redirect) or move it to More for now. This audit doesn't change the nav, because the information architecture in CLAUDE.md puts Analyze in the primary nav.
- **WARN:** the Insight Engine isn't used yet on Meta, Home or Build Detail.

### 2. UX principles — PASS (carried, spot-checked)
- First screens lead with insight cards and summaries; tables sit lower or in tabs.
- Statistics show window, rank, sample size and tier; low samples are muted.
- "Why?" panels give the rule behind key claims; wording is descriptive only (enforced by tests).

### 3. Design system — PASS (re-run)
- Grep for raw hex in components: the only value is `themeColor` in `layout.tsx` metadata, which can't take CSS variables. Components use tokens and shared primitives.
- **Blocked (carried):** the brand-reference redesign brief waits for the new reference image and logo files.

### 4. API correctness — PASS (re-run)
- `api:verify`: 37 call sites → 28 endpoints, all current, no MMR endpoints, every query param and zod field present in the live spec.
- Matches use `include_player_kda`; whole-day windows end with `throughDay()`.

### 5. Data correctness — PASS
- Statistical rules (Wilson intervals, sample tiers, trend rule, `MIN_EFFECT`, build labels, insight generators, compare and draft rules) pass their 173 tests.
- Carried: the Haze page matched the API's own daily rows exactly (212,676 matches, 54.6%).
- Re-run: `/matches/1` (upstream 503 "recently failed to fetch, retry later") shows "data unavailable, try again shortly". It doesn't say the match doesn't exist.

### 6. Database integrity — WARN (carried)
- **PASS:** 18 tables with primary and foreign keys and check constraints (rank bands, `wins ≤ matches`, pair ordering, window order). Two migrations. Every repository function is tested on PGlite. The cron `days` parameter is clamped to 1–30.
- **WARN:** not yet run against a deployed Postgres. Production needs `DATABASE_URL`, `CRON_SECRET` and the Vercel crons (documented in `.env.example`). Without a database the site runs on the live API alone, with no history fallback.

### 7. Responsive behavior — PASS (re-run)
- Playwright with touch emulation below 768 px: **0 / 56** route × width combinations have a page wider than the viewport, and there were no page errors.

### 8. Accessibility — PASS (re-run)
- `scripts/a11y-audit.mjs` on 18 routes (13 data routes plus Compare, Draft, the 404s), desktop and mobile: **0 axe violations**, exactly one `h1`, no heading skips, every chart labelled, no looping animation under reduced motion.
- **Fixed:** the two hero-name links on Compare were 43 px tall on touch screens (target 44). They now use `pointer-coarse:min-h-11`; re-audited: 0 small targets.
- **Accepted (unchanged):** match-timeline markers are small SVG shapes. The events list below the chart is the full-size equivalent (ACCESSIBILITY § 13).
- **Open:** manual NVDA / VoiceOver pass.

### 9. Performance — PASS
- Carried: within every budget in [PERFORMANCE § 6](./PERFORMANCE.md) (JS ≤ 153 KB gzip per route, mobile LCP ≤ 520 ms, CLS ≤ 0.0044).
- Re-run (server response, mostly warm cache): static and cached routes 0.01–0.04 s; `/meta` 0.35 s; `/matches` 0.7 s; `/leaderboard`, `/draft`, `/compare` 1.1–1.3 s; Player Detail 2.2 s; Build Detail 2.9 s; `/builds` 3.2 s (39 upstream calls per scope on a cold cache, § 14).

### 10. IP / asset rules — WARN (carried)
- **PASS:** unofficial notice and Valve trademark attribution in every page footer (seen in this audit's HTML). Logo, wordmark and illustrations are original. Game art renders only through `components/game-assets/`. The kill switch (`NEXT_PUBLIC_GAME_ASSETS=off`) made 0 asset requests in the first audit.
- **WARN:** art is hot-linked from the API's CDN, and an asset URL doesn't grant commercial rights. That needs a decision before any monetization.

### 11. Error handling — PASS
- Carried from the fault-injection run (stub upstream answering 429 / 500 / hang / wrong JSON, every route): pages say what happened via `DataNotice`; the route error boundary catches render errors; timeouts aren't retried.
- Re-run: malformed IDs (`/matches/abc`, `/players/-5`) and unknown slugs (`/heroes/zzz`) return **404** before any upstream call, with `<meta name="robots" content="noindex">`. Cron without the secret returns **401**.
- **Note (framework behavior, not fixable in app code):** when a page calls `notFound()`, Next 16.3 sends the 404 with an empty `<body>`, and the client renders the site's not-found page from the RSC payload. Reproduced with a minimal one-line page, with and without a segment `not-found.tsx` and the root `error.tsx`. Unmatched URLs (`/nope`, `/analyze`) render server-side. Status codes and `noindex` are correct, so search engines aren't affected. Users without JavaScript see a blank page. Recorded under § 13.

### 12. Empty states — PASS
- Carried: unknown player search, unknown player ID, nothing picked on Compare and Draft, unknown hero/build/route, and unprocessed matches each explain themselves and offer a next step.
- **Fixed:** when data search failed, the command palette said *Nothing matches "…"*, which claims an empty result for a search that never ran. It now shows the failure ("Data search didn't respond…" or "Too many searches…"). Pages and tools still show.

### 13. Loading states — WARN
- **PASS:** sections stream with skeletons sized like the final content (`aria-busy`, no CLS). The palette shows search status.
- **WARN:** no route-level loading UI. A root `loading.tsx` would start streaming before `notFound()` and turn 404s into 200s (first audit), so it stays out.
- **WARN:** 404 pages from `notFound()` have no server-rendered content (§ 11). Users see nothing until JavaScript loads. A possible remedy is to reject malformed IDs in a `proxy.ts` by rewriting to an unmatched path, which does render server-side. That adds a routing layer, so it's left as a decision.

### 14. Rate-limit handling — PASS (token buckets added later the same day)
- **PASS:**
  - Upstream 429s are retried once, honoring `Retry-After` (capped at 3 s).
  - "Rate limited" is shown everywhere and never mistaken for missing data.
  - Analytics data is cached for 6 h; daily jobs keep within a request budget.
- **Fixed:** our own `/api/search` was unthrottled, so a script sending random queries could spend the shared upstream budget. It now allows 40 queries per client per minute, then answers **429 with `Retry-After`** (`src/lib/rateLimit.ts`, unit-tested). Verified: requests 41–42 from one address got 429 with `retry-after: 50`, and another address still got 200. Real typing stays far below the limit (200 ms debounce plus a per-session answer cache). The limiter is in memory, so on a multi-instance host it bounds each instance separately.
- **WARN:**
  - **Fixed (later, 2026-10-07):** per-class token buckets on upstream calls, cache-first (see API § 7). Buckets are per server instance.
  - `/builds` fans out 39 calls per scope on a cold cache.

### 15. Security — WARN
- **PASS (re-run):**
  - Every response sends `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`, and a CSP with `frame-ancestors`/`object-src`/`base-uri`/`form-action`. `X-Powered-By` is off.
  - 0 client bundles mention `DEADLOCK_API_KEY`, `DATABASE_URL` or `CRON_SECRET`.
  - There's no `dangerouslySetInnerHTML`.
  - Cron requires the bearer secret (constant-time compare).
  - Malformed IDs are rejected before any upstream call.
  - 0 vulnerable production dependencies.
- **Fixed:** search throttling (§ 14).
- **WARN:**
  - No `script-src` CSP (needs per-request nonces with the App Router).
  - The search throttle is per instance.
  - HSTS is left to the host (Vercel sets it).

---

## 3. Changes made in this audit

| File | Change |
|---|---|
| `src/lib/rateLimit.ts` (new) | In-memory fixed-window limiter with bounded memory, plus `clientKey()` from the forwarded address |
| `src/app/api/search/route.ts` | 40 queries per client per minute; over the limit → 429 + `Retry-After`, `no-store` |
| `src/components/layout/command/CommandPalette.tsx` | Rate-limited and failed searches state what happened instead of "Nothing matches" |
| `src/features/compare/components/views.tsx` | Hero-name links reach 44 px on touch screens |
| `tests/unit/rate-limit.test.ts` (new) | Limit, retry time, per-client windows, eviction, client key |

First-audit changes (error classification, `attempt()`, error boundary, security headers, robots.txt, token colors) are still in place.

## 4. Release verdict

**Ready for a public beta on the live API** (no database), with the WARN items known.

Before wider launch, in priority order:
1. ~~**Upstream rate limits:** token buckets in `client.ts` (§ 14).~~ Done.
2. **Database:** deploy Postgres, set `DATABASE_URL` and `CRON_SECRET`, run the migrations and the first `daily` job with `days=30` (§ 6).
3. **Analyze:** build a first version or move it out of the primary nav (§ 1).
4. **Asset rights:** decide on game-art usage before monetization (§ 10).
5. **404 without JS:** decide whether to add a `proxy.ts` for malformed IDs (§ 13).
6. **Manual screen-reader pass** (§ 8).

## 5. How this audit was run (repeatable)

- Gates: `npm run check`, `npm run api:verify`, `npm audit --omit=dev`.
- Routes: `npx next start -p 3100`, then `curl` each route for status, time, `h1` count and error notice text.
- Accessibility: `npm i --no-save playwright-core axe-core pngjs`, then `AUDIT_BASE=http://localhost:3100 CHROME_PATH=… node scripts/a11y-audit.mjs out.json <routes>` (Git Bash: `MSYS_NO_PATHCONV=1`).
- Responsive: Playwright at 360 / 390 / 768 / 1024 px (touch below 768), comparing `scrollWidth` to `innerWidth`.
- Throttle: 42 searches from one `x-forwarded-for` address, then one search from another address.
- Fault injection (first audit): a stub upstream answering 429 / 500 / hang / wrong JSON, with `DEADLOCK_API_BASE_URL=http://localhost:3999` and `.next/cache/fetch-cache` cleared.
- Asset kill switch (first audit): `NEXT_PUBLIC_GAME_ASSETS=off npm run build`, then count requests to the asset host.
