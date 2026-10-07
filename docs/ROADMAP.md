# Deadlockprohunger — Roadmap

Covers **16. Development phases**. Built by a solo developer with Claude Code.

## How phases work

- Phases run **in order**. Each phase is a set of small, coherent changes, not one big change.
- Each phase ends with `npm run check` green (typecheck + lint + tests + build) and the phase's acceptance checks done. Errors are fixed before the next phase starts.
- Each session follows the CLAUDE.md workflow: inspect → explain → plan → smallest change → validate → summarize → next step.
- Size estimates assume part-time work: **S** ≈ 1–3 sessions, **M** ≈ 4–8 sessions, **L** ≈ 8+ sessions.

Related: [PRODUCT](./PRODUCT.md) · [ARCHITECTURE](./ARCHITECTURE.md) · [ROUTES](./ROUTES.md) · [API](./API.md) · [DATA_MODEL](./DATA_MODEL.md) · [DESIGN](./DESIGN.md) · [QA](./QA.md)

---

## Status (re-verified 2026-10-07)

The phase lists below are the **original plan**, kept for reference. Where the build differs, the other docs describe what was built. This table is the current state. Status labels (**Implemented**, **Partial**, **Planned**, **Deprecated**, **Blocked**) are defined in [ARCHITECTURE](./ARCHITECTURE.md).

| Phase | Status | Open items |
|---|---|---|
| P0 Foundation | **Implemented** | Built differently: header + mobile drawer instead of a bottom tab bar; no `/about`; no git repository or CI yet |
| P1 Data layer | **Partial** | Done: client (timeout, one retry, zod, error classes), endpoints, TTLs, Drizzle schema (18 tables), 4 cron jobs, analytics with tests, `api:verify`. **Planned:** per-class token buckets; snapshot fallback beyond Match Detail, Meta and Leaderboard; `openapi-typescript` types; recorded fixtures. **Blocked:** deploying Postgres (needs the owner's database and credentials) |
| P2 Heroes | **Implemented** | Hero Detail tabs are Overview, Builds, Matchups, Abilities, Trends, Matches |
| P3 Meta + Home | **Implemented** | **Planned:** Insight Engine on Meta and Home |
| P4 Players + Leaderboard | **Implemented** | Leaderboard is one route with `view`/`scope` params (Global + Performance from the scoreboard endpoint), not `/leaderboard/[region]` |
| P5 Matches + Analyze | **Implemented** | Matches and Match Detail (stored after first open, read first after that). `/analyze` is a hero analysis workspace; the paste-an-ID input stays **Planned** (global search covers match IDs and names) |
| P6 Builds | **Implemented** | |
| P7 Launch hardening | **Partial** | Done: axe and keyboard audits, performance budgets, robots, error/empty/loading review, fault injection, mocks only on `/design` ([QA](./QA.md)). **Planned:** sitemap, OG images, NVDA pass, analytics and error monitoring. **Blocked:** CI (the project isn't a git repository yet) |
| Post-MVP 3 Compare | **Implemented** (early) | |
| Post-MVP 5 Draft Lab | **Implemented** (early) | |
| Post-MVP 1, 2, 4, 7, 8 (Items, Patch, Trends, Coach, Advanced) | **Planned** | Hero Detail already has a Trends tab |
| Post-MVP 6 Personal Dashboard | **Blocked** | Needs approval: Steam OpenID sign-in, sessions and a user table are a new architecture layer |
| Deprecated upstream endpoints (MMR, `/v1/patches`, `/v1/sql`) | **Deprecated** | Never used; `api:verify` fails on them |

**Next, in order:** token buckets in `client.ts` → remaining snapshot fallbacks and a deployed Postgres → Insight Engine on Meta/Home/Build Detail → launch items in P7 → Personal Dashboard (after approval).

---

## MVP

### P0 — Foundation · M

Goal: an empty but production-shaped Next.js app with the design system's base and the site shell.

- Remove the Vite starter (`index.html`, `vite.config.ts`, `src/*`, `tsconfig.*.json`). Scaffold Next.js App Router + TypeScript strict + Tailwind v4. Keep `.oxlintrc.json`.
- `globals.css` with all tokens from [DESIGN](./DESIGN.md): colors, fonts (`next/font`), radii, motion, reduced-motion override.
- Layout components: `SiteShell`, `TopNav`, `BottomTabBar`, `Footer` (unofficial notice), `SkipLink`, `PageHeader`.
- Core `ui` primitives needed by the shell: `Button`, `Card`, `Badge`, `Skeleton`.
- Original brand: wordmark and glyph SVGs, favicon.
- `/about` page (static) and placeholder pages for MVP routes that show an honest "coming soon" — no fake numbers.
- Vitest, Playwright, axe; GitHub Actions CI running `check` + e2e.
- Vercel project + preview deployments.
- Update CLAUDE.md "Current codebase state" and "Commands" for Next.js.

Done when: CI green on a Vercel preview; axe passes on every placeholder route; keyboard and skip link work; mobile bottom bar works at 375px.

### P1 — Data layer · M

Goal: typed, rate-safe, cached access to the Deadlock API and Postgres, with tested analytics math.

- `npm run api:types` (openapi-typescript) → `src/lib/deadlock/schema.d.ts`; CI diff check.
- `lib/deadlock/client.ts`: server-only, optional `X-API-KEY`, timeout, retry/backoff, token buckets, zod parsing, logging.
- Endpoint functions for asset endpoints and `hero-stats` / `game-stats` first.
- `lib/cache/ttl.ts` and `tags.ts`.
- Neon + Drizzle: reference tables, `stat_snapshots`, `sync_runs`, migrations.
- `/api/cron/sync-assets` + Vercel Cron config.
- `lib/analytics`: `winRate`, `wilson`, `sampleTier`, `rank` (badge encode/decode), `rankBands`, formatters — with unit tests.
- Recorded fixtures + fixture server for tests.

Done when: assets sync into Neon from a preview deploy; a hero-stats call is served from cache on the second request; snapshot fallback works when the client is forced to fail; unit test coverage of `lib/analytics` is complete.

### P2 — Heroes · M

- `components/game-assets`: `HeroPortrait`, `HeroIcon`, `ItemIcon`, `AbilityIcon` with the `NEXT_PUBLIC_GAME_ASSETS` kill switch and original fallbacks.
- `components/data`: `StatValue`, `SampleSizeBadge`, `ConfidenceIndicator`, `WinRateBar`, `InsightCard`, `WhyPanel`, `DataTable`, `FilterBar`.
- `/heroes` grid and `/heroes/[slug]` with Overview, Matchups, Items tabs (Builds tab comes in P6).
- Endpoints: `hero-counter-stats`, `hero-synergy-stats`, `item-stats`, `ability-order-stats`.
- "Why?" insight templates for hero pages.

Done when: every number on hero pages shows scope and sample size; low-sample rows are muted and excluded from L1; site renders correctly with game assets `off`.

### P3 — Meta + Home · M

- Rank-band and window presets, URL-synced.
- `/api/cron/snapshot-daily` → `hero_stats_daily`, plus `/v2/patches` → `patches`.
- `lib/analytics/trend.ts` (interval-overlap rule) and `tiers.ts`, with tests.
- `/meta` tier view + table; "How tiers work" panel.
- `/` Home insight cards; trend cards hidden until enough daily history exists.
- Motion: reveal, stagger, counter, sparkline draw.

Done when: tiers and trends are reproducible from stored data; no trend shown without significant difference; reduced-motion verified.

### P4 — Players + Leaderboard · M

- `/players` search with `/api/search/players` (debounced, throttled).
- `/players/[accountId]`: current rank (`/v1/players/{id}/rank`, "Unranked" handling), recent form, hero stats vs rank-band average, match history, mates/enemies.
- `players` table cache.
- `/leaderboard/[region]` with hero filter and season `leaderboard_id`.
- `RankBadge` game-asset component.

Done when: no deprecated MMR or rank-predict endpoints are referenced anywhere (CI grep); protected accounts handled; leaderboard ambiguity (`possible_account_ids`) handled.

### P5 — Matches + Analyze · M

- `/matches/[matchId]`: team scoreboards, items, objectives; stored in `matches` after first fetch; `disable_steam=true`.
- Batch ranks for match players via `/v1/players/rank`.
- `/matches` list of recent high-rank matches (bulk metadata).
- `/analyze` hub routing match IDs, names, SteamID3/64, and profile URLs.

Done when: a stored match never triggers a second upstream call; "not available yet" state works.

### P6 — Builds · S–M

- `/builds` browser by hero, sort, tags.
- `/builds/[heroSlug]/[buildId]` with build win rate (`hero-build-stats`) and item stats.
- Builds tab on Hero Detail.
- Build-assembly motion.

Done when: build win rates show sample tier; builds without stats say so instead of hiding.

### P7 — Launch hardening · M

- Full a11y pass (keyboard, NVDA spot check, axe).
- Performance budgets verified (Lighthouse on key routes, bundle check).
- SEO: metadata, sitemap, robots, original OG image generation.
- Empty/error/loading states reviewed on every route; upstream-down fallback exercised.
- Remove all mock data and `DemoDataBadge` usage from production paths (CI grep for `src/mocks` imports).
- Basic privacy-friendly analytics and error monitoring (choice made then, with a reason).

Done when: all MVP routes meet budgets and pass checks; public launch.

---

## Post-MVP (in priority order)

| # | Feature | Depends on | Notes |
|---|---|---|---|
| 1 | **Items** pages | P2 components, `items` table | `item-stats` by bucket (`game_time_min`, `net_worth_by_*`) |
| 2 | **Patch** pages | `patches` table | Patch notes feed + before/after hero stats from `hero_stats_daily` |
| 3 | **Compare** | P2, P4 | Hero vs hero, player vs player; reuses data components |
| 4 | **Trends** | ≥ 30 days of `hero_stats_daily` | Possibly justifies a chart library |
| 5 | **Draft Lab** | counter + synergy stats | Suggest picks from current draft; sample-gated |
| 6 | **Personal Dashboard** | Steam OpenID auth, user table | First feature needing accounts |
| 7 | **Coach** | Dashboard, enough player data | Rule-based recommendations first |
| 8 | **Advanced Analytics** | Custom filters, API key | Lane stats (`lane-matchup-stats`, `lane-soul-curve` — "Subject to Change"), item flow, custom ranges |
| — | Live matches | `/v1/matches/active` | Featured live games on Home |
| — | Street Brawl mode | `game_mode=street_brawl` | Mode switch in filters |

---

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Upstream analytics limit (200 req/min shared per IP; Vercel IPs shared) | Throttled pages | Presets, hour-rounded keys, 6h cache, snapshot fallback (partly built), token buckets (open); request an API key before launch |
| API schema drift | Broken parsing | zod at the boundary; `npm run api:verify` against the live spec (generated types and CI planned) |
| Deprecated endpoints removed | Broken features | Never use them (`npm run api:verify` fails on any deprecated or MMR path; run after touching an endpoint) |
| Vercel Hobby cron is daily only | No intra-day history | History is daily by design; everything else is on-demand ISR. Upgrade only if needed. |
| Game asset rights | Forced removal of imagery | Isolation in `game-assets/` + kill switch with layout-stable fallbacks |
| Neon storage growth from match metadata | Cost | Store only opened matches; trim projection if needed |
| Solo-dev scope creep | MVP never ships | Phases in order; post-MVP list is a backlog, not a promise |
