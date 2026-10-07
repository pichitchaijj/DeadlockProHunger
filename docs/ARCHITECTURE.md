# Deadlockprohunger — Architecture

Covers **1. Product architecture (technical)**, **4. Component architecture**, **9. Cache strategy**, **13. Performance strategy**, **14. IP/asset isolation strategy** and **15. Testing strategy**, **as built** (re-verified 2026-10-07 against `src/`, `package.json`, `next.config.ts` and `vercel.json`). 

**Status labels** (used in every planning doc): **Implemented** = built and verified in the code · **Partial** = some of it built · **Planned** = decided, not built · **Deprecated** = upstream marks it deprecated, never used · **Blocked** = can't proceed without an outside input (named each time). Anything not labelled is implemented.

Related: [API](./API.md) (data flow and endpoints) · [DATA_MODEL](./DATA_MODEL.md) · [ROUTES](./ROUTES.md) · [DESIGN](./DESIGN.md) · [PERFORMANCE](./PERFORMANCE.md) · [QA](./QA.md)

---

## 1. Technical architecture

### Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js 16 (App Router)**, React 19, TypeScript 6 strict (`verbatimModuleSyntax`, `erasableSyntaxOnly`) | Server components keep API calls server-side by default; time-based revalidation fits analytics data that changes every few hours; SEO for hero and build pages |
| Styling | **Tailwind CSS v4** with `@theme` tokens in `globals.css` | Design tokens live in one CSS file; no runtime CSS-in-JS |
| Database | **PostgreSQL** via **Drizzle**: schema, migrations and jobs **Implemented** and tested on PGlite; production on Neon **Blocked** (needs a deployed database and credentials) | Typed schema in TS, plain SQL migrations, small runtime; Neon pairs with Vercel and branches for previews. Optional: the site runs without it |
| Validation | **zod** | Parses the API boundary (only the fields we use) |
| API drift check | **`npm run api:verify`** (`scripts/verify-api.mjs`) | Checks every call site against the live OpenAPI spec. `openapi-typescript` generated types: **Planned** |
| Hosting | **Vercel** | Native Next.js, Cron (`vercel.json`), preview deployments |
| Lint | **Oxlint** (`react`, `typescript`, `jsx-a11y`, `nextjs` plugins) | Fast; already configured |
| Tests | **Vitest** (unit), **PGlite** (real Postgres in tests) | Pure model and analytics tests, plus repository tests on a real database |
| Audits | `scripts/a11y-*.mjs`, `scripts/perf-audit.mjs` (Playwright + axe, installed with `--no-save`) | Run on demand against `next start`; not project dependencies |

There is no client data-fetching library, global state library, chart library or animation library. Each would need a written reason before it is added.

### Environment variables (`.env.example`)

| Var | Scope | Purpose |
|---|---|---|
| `DEADLOCK_API_KEY` | server, optional | Sent as `X-API-KEY` (raises rate limits) |
| `DATABASE_URL` | server, optional | Postgres connection. Without it, pages use the live API only |
| `CRON_SECRET` | server | `Authorization: Bearer` for `/api/cron/*`; jobs refuse to run without it |
| `NEXT_PUBLIC_GAME_ASSETS` | public, build time | `off` replaces all game art with original fallbacks (kill switch) |
| `DEADLOCK_API_BASE_URL` | server, diagnostics | Point the client at a stub for fault tests |
| `DEADLOCK_API_TRACE` | server, diagnostics | `1` logs every upstream call |

### Runtime model

```
                    ┌────────────────────────── Vercel ──────────────────────────┐
 Browser ──HTTP──▶  │  app/ route (RSC)                                          │
                    │     └─▶ features/<page>/loaders.ts   (server, cached)      │
                    │            ├─▶ lib/deadlock/*  ──▶ api.deadlock-api.com    │
                    │            ├─▶ lib/db/store.ts ──▶ Postgres (optional)     │
                    │            └─▶ lib/analytics/* (pure)                      │
                    │                                                            │
 Palette ─fetch──▶  │  app/api/search  (throttled)  ──▶ features/search          │
 Vercel Cron ─────▶ │  app/api/cron/[job]  ──▶ lib/jobs ──▶ lib/deadlock + lib/db│
                    └────────────────────────────────────────────────────────────┘
```

The browser never calls deadlock-api.com. The one exception is the user-clicked raw-JSON citation link on match pages.

---

## 4. Component architecture

### Directory layout

```
src/
  app/                    routes only: pages, error.tsx, not-found.tsx, robots.ts, route handlers
    api/search/route.ts         command-palette search (throttled)
    api/cron/[job]/route.ts     reference | daily | builds | prune
  config/navigation.ts    the only source of nav items (built flag, phase)
  features/<page>/        builds compare draft hero heroes home leaderboard match matches meta players search
    loaders.ts            server: fetch + assemble view models
    model.ts              pure view-model building (unit-tested)
    query.ts              URL filter state
    components/           page-specific views
  components/
    ui/                   primitives (Button, Badge, Tabs, Table, Filter, Dialog, Tooltip, ScrollRegion, States, icons…)
    data/                 statistic displays (StatCard, DataCard, InsightCard, ScopeLine, TrendBadge, ConfidenceBadge, TierBadge, Sparkline, DataState)
    cards/                HeroCard, BuildCard, MatchCard, PlayerCard, WinRate
    game-assets/          the only place game imagery renders (HeroImage, HeroPortrait, ItemIcon, RankBadge)
    motion/               Reveal, CountUp, InView
    layout/               header/ (SiteHeader, PrimaryNav, MoreMenu, MobileNav…), command/ (CommandPalette), Footer, BrandMark, PageContainer, SkipLink
  lib/
    deadlock/             client.ts, errors.ts, *Endpoints.ts (server-only), constants.ts (client-safe), heroImages.ts, patchDate.ts
    analytics/            wilson, sampleTier, rankBands, tiers, trend, pickRate, compare, insights, scope (pure)
    db/                   schema.ts, client.ts, repo.ts, mappers.ts, store.ts (request-path helpers)
    jobs/                 scheduled ingestion
    cache/ttl.ts          data-cache lifetimes
    format.ts, scale.ts, rateLimit.ts, cx.ts
  mocks/                  DEMO-only fixtures for /design (never imported by loaders)
tests/unit/               Vitest
drizzle/                  migrations
scripts/                  api:verify, a11y and perf harnesses
```

### Component layers

| Layer | Rules |
|---|---|
| `components/ui` | No data knowledge. Tokens only. Accessible by default |
| `components/data` | Statistics take a `StatScope` (`lib/analytics/scope.ts`). Never fetch |
| `components/cards` | Compose ui + data + game-assets for one entity |
| `components/game-assets` | The only components that render game imagery. Honor the kill switch and fall back to original designs, including on load failure |
| `components/layout` | App chrome. The footer always includes the unofficial notice |
| `features/<page>/components` | Compose the layers above from view models built by `model.ts` |

### Server vs client components

- Default: server components. Client islands: filters and tabs that update the URL, the command palette, the mobile drawer and menus, the match timeline, and motion (`Reveal`, `CountUp`, `InView`).
- Client components receive serialized view models. They never import `lib/deadlock/*Endpoints.ts` or `lib/db` (`server-only` makes that a build error). Functions can't cross the boundary, so they take named options (e.g. `CountUp format="percent"`).
- Client components never read the clock or locale during render; the server passes `now`.

### Reuse rules

- One component per concept. Search `components/` before creating one.
- Variants are props, not copies.
- Page components live in their feature folder until a second page needs them; then they move to `components/`.

---

## 9. Cache strategy

### Tiers

1. **Per-request dedupe:** React `cache()` on shared loaders, plus memoized `fetch`.
2. **Next data cache:** every upstream `fetch` sets `next: { revalidate, tags }` from `lib/cache/ttl.ts`. Responses over the 2 MB fetch-cache limit (shop items, match detail, match history) are cached as zod projections with `unstable_cache`.
3. **Postgres (optional):** daily history, last-good snapshots and immutable matches ([DATA_MODEL](./DATA_MODEL.md)).

Lifetimes per data class and per endpoint: [API § 9](./API.md#9-production-data-sources-as-built).

### Keys and presets

- Analytics use **fixed presets** (rank band × window from `features/meta/scope.ts`). Timestamps are rounded (hour for analytics, minute for match lists), and whole-day windows end with `throughDay()`, so a preset maps to one stable cache key.
- Home sections cache their computed-at time and show **Stale** past their freshness budget.

### Scheduled jobs (Vercel Cron, daily)

`reference` 02:50, `daily` 03:00, `builds` 03:30, `prune` 04:00, `prewarm` 06:15 UTC (backup; the hourly prewarm runs from GitHub Actions, see Cache prewarming). Request budgets are in [DATA_MODEL § Jobs](./DATA_MODEL.md#jobs-apicronjob-verceljson-daily).

### Cache prewarming — **Implemented**

`GET /api/cron/prewarm` (`lib/jobs/prewarm.ts` + the pure runner `lib/jobs/prewarmRunner.ts`) loads, through the same loaders the pages use, the data the default views need, so their cache keys match exactly:

| Stage (in order) | What | Why |
|---|---|---|
| shared reference | hero list, rank tiers, patch feed | every page |
| meta model | 7d and 30d, all ranks | Home/Meta/Heroes/Hero/Analyze defaults (7d), Builds default (30d) |
| home | the six Home sections (their own section caches too) | most-visited page |
| builds tracked stats | one `hero-build-stats` call per hero (30d, all ranks), one task each | `/builds` default fires all of them at once on a cold cache: the site's worst burst |
| builds page | the default listing (then only hits) | |
| hero detail + analyze | overview data for the **3 most-picked heroes** in the 7d model (non-Low sample); the first also warms the all-hero matrix data every hero page shares | chosen from measured pick rate, never assumed |

- **Cache first, budget enforced:** every request goes through the normal client (cache → budget → API). Fresh keys are hits; nothing bypasses the token bucket.
- **Pacing:** at most 3 tasks in flight, and a task starts only while the analytics bucket has at least half its burst (20 of 40) unspent, so warming never takes the whole budget from users; if it doesn't recover within 20 s the task is skipped. The run stops at 240 s (route limit 300 s).
- **Circuit breaker:** after 3 rate-limited tasks in a row (upstream 429 or our budget), every remaining task is skipped. Measured against a 429 stub: 76 requests and 14 s instead of 218 and 57 s.
- **Report** (JSON response + one `[prewarm]` log line): status `ok|partial|failed`, per-task result, upstream network requests, cache hits, budget waits and refusals, duration. Counts and task names only; secrets are redacted from error text.
- **Measured** (cold cache): 55 tasks ok, 120 upstream requests, ~13 s. Then every target page's first visit needed 0 upstream requests (`/builds` 0.04 s instead of ~3 s). A second run: 0 requests, 177 hits, 3 s.
- **Schedule:** analytics keys roll over each hour (window end rounded to the hour), so warming must be hourly. Vercel Hobby crons are daily-only, so `.github/workflows/prewarm.yml` calls the endpoint at minute 7 of every hour; `vercel.json` adds a daily 06:15 UTC run as a backup.
- **Cache keys across bundles:** `unstable_cache` keys on the callback's source text, which differs between bundles (cron route vs pages). Every call site wraps its callback in `stableKey()` (`lib/cache/stableKey.ts`) so the key depends only on the key parts; without it a warmed entry was invisible to pages.

**Deployment (prewarm):**
1. Vercel project → Environment Variables: `CRON_SECRET` (long random value). Optional: `DEADLOCK_API_KEY`.
2. GitHub repository → Settings → Secrets and variables → Actions: secret `CRON_SECRET` (same value) and variable `SITE_URL` (production origin, no trailing slash). Without both, the workflow skips itself.
3. Check: Actions → "Prewarm cache" → Run workflow; the log shows the JSON report.

### Fallback — **Partial**

- **Implemented:** Match Detail reads the stored match first. Meta falls back to stored daily history. Leaderboard falls back to the regional snapshot. Both fallbacks label the view `source: 'snapshot'` with its time, and the UI shows the data's age. Our own `/api/search` is throttled per client (`lib/rateLimit.ts`).
- **Implemented:** outbound rate limiting in `client.ts`: cache first (`unstable_cache` keyed on URL + schema, holding the parsed projection) → on a miss only, a per-class token bucket (`lib/deadlock/budget.ts`: analytics 160/min, 320 with a key; batch ranks 16/min; bulk match metadata 24/min; others 80/s; 80% of the spec's per-IP limits, in memory per instance) → API → cache. A request that would wait longer than half its timeout (max 3 s) fails as a 429 (`rate-limit`) instead of queuing; concurrent misses for one key share a request.
- **Planned:** fallbacks for the other pages (read the latest `data_snapshots` row for the same request key when upstream fails or the rate budget is spent).
- **Blocked:** every fallback is inactive in production until a Postgres database is deployed (needs the owner's credentials).

---

## 13. Performance strategy

### Product targets (original decision, mid-range mobile on 4G)

| Metric | Target | Status (measured, [PERFORMANCE](./PERFORMANCE.md)) |
|---|---|---|
| LCP | < 2.5 s | **Implemented:** ≤ 520 ms mobile at 4× CPU (local, not 4G) |
| CLS | < 0.05 | **Implemented:** ≤ 0.0044 |
| INP | < 200 ms | **Planned:** not measured yet (the harness reports long tasks only) |
| Client JS on content pages | < 120 KB gzip | **Partial:** up to 153 KB gzip on the heaviest route. PERFORMANCE § 6 sets a 170 KB regression ceiling, but this target still stands |

PERFORMANCE § 6 holds the regression budgets used when re-running the harness.

### Practices

- **Implemented:**
  - Server components by default; client islands are small and leaf-level.
  - Game images have explicit width and height; hero art is served WebP first (`lib/deadlock/heroImages.ts`); below-the-fold images lazy-load.
  - Fonts through `next/font` (Barlow Condensed, a single italic file, Inter; `display: swap`).
  - Sections stream with `Suspense` skeletons sized like the final content. No root `loading.tsx` (it breaks 404 status codes).
  - Animate only `transform` and `opacity` (plus SVG stroke); `will-change` only during an animation. Looping animations run on `::after`. `InView` holds below-the-fold animations at frame 0 until they are scrolled into view.
  - Staggered reveals are capped at 12 items; tables never animate.
  - Tables render at most 50 rows server-side, with pagination beyond (Leaderboard, Players). Virtualization only if a page truly needs more than 200 rows at once.
  - Unbuilt nav links aren't prefetched.
  - Measure with `scripts/perf-audit.mjs` before optimizing.
- **Planned:** heavy optional views loaded with `next/dynamic` (not needed so far); Lighthouse in CI on preview deployments (no CI yet).

---

## 14. IP/asset isolation strategy

These are product design constraints, not a legal determination. They don't guarantee legal compliance.

| Rule | Implementation |
|---|---|
| Game imagery only as a data identifier | Only `components/game-assets/*` render hero, item or rank images. Pages pass `decorative` when the name is printed beside the image |
| Can be disabled without redesign | `NEXT_PUBLIC_GAME_ASSETS=off` makes every game-asset component render an original fallback with the same dimensions. Verified: 0 asset requests across 10 routes ([QA](./QA.md)) |
| No redistribution of extracted files | Nothing is downloaded, re-hosted or bundled. Image URLs come from the API's asset responses at runtime |
| Original brand identity | The owner's own logo (`public/brand/`, rendered only by `components/layout/BrandMark.tsx`; favicons `app/icon.png`, `app/apple-icon.png`); the Home "data city" backdrop is original SVG. No official logos, fonts or character art in branding or favicons |
| An asset URL is not a license | Asset usage needs review before any commercial use; the kill switch exists for that case |
| Unofficial notice | Every page footer: "Deadlockprohunger is an unofficial fan project. It is not affiliated with or endorsed by Valve. Deadlock and related marks are property of Valve Corporation. Game data provided by deadlock-api.com." |
| Never imply affiliation | No "official" wording, no Valve logos; page titles lead with our brand |

---

## 15. Testing strategy

### As built

| Layer | Tool | What |
|---|---|---|
| Unit | Vitest (`tests/unit/`, 19 files, 173 tests) | `lib/analytics` (Wilson, sample tiers, trend, tiers, insights with a descriptive-wording sweep, compare), every feature `model.ts`, search ranking, navigation, formatting, rate limiter |
| Database | Vitest + PGlite | Every repository function and constraint on a real Postgres |
| API contract | `npm run api:verify` | Paths, deprecation and MMR, query params and zod fields against the live spec |
| Accessibility | `scripts/a11y-audit.mjs`, `a11y-contrast.mjs`, `a11y-keyboard.mjs` | axe, pixel contrast, keyboard and dialogs per route ([ACCESSIBILITY](./ACCESSIBILITY.md)) |
| Performance | `scripts/perf-audit.mjs` | JS/HTML weight, LCP, CLS, upstream calls per route |
| Gate | `npm run check` | typecheck + lint + test + build, at the end of every phase |

Fault handling is tested by pointing `DEADLOCK_API_BASE_URL` at a stub that answers 429, 500, hangs or returns wrong-shaped JSON ([QA § 5](./QA.md)).

### Planned

- CI (GitHub Actions) on push and PR: `check`, `api:verify`, end-to-end. The project has no git repository yet, so CI waits for one.
- Recorded API fixtures (real responses saved once, labelled with endpoint and date, test-only) replayed by a local fixture server through `DEADLOCK_API_BASE_URL`, so end-to-end tests don't depend on upstream availability.
- Playwright end-to-end smoke test per route (renders, one `h1`, landmarks, no console errors) with axe, in CI.
- Contract check: `openapi-typescript` types plus a diff that fails when the upstream schema changes.
