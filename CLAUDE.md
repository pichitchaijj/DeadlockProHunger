# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Deadlockprohunger

An unofficial community analytics and strategy platform for Deadlock.

Core principle: **DATA → INSIGHT → DECISION → ACTION**

It should feel like a premium editorial gaming intelligence platform, not a generic statistics dashboard. It must be "deep like an analyst tool, simple like a modern consumer product." When advanced data and simple UX conflict, use progressive disclosure.

## Current codebase state

Next.js 16 (App Router) + React 19 + TypeScript 6 + Tailwind CSS v4. Design system and app shell are built. Meta (`/meta`), Heroes (`/heroes`), Hero Detail (`/heroes/[hero]`), Builds (`/builds`), Build Detail (`/builds/[hero]/[buildId]`) Matches (`/matches`) Match Detail (`/matches/[matchId]`), Players search (`/players`), Player profiles (`/players/[accountId]`), Leaderboard (`/leaderboard`), Analyze (`/analyze`) and Home (`/`) use live Deadlock API data. Only the internal `/design` showcase uses labeled mock data. No database yet.

- `src/lib/deadlock/`: server-only API client (`client.ts`) and typed endpoint functions (`endpoints.ts`). Every call: cache first (`unstable_cache`, key = URL + schema fingerprint, value = parsed projection) → on a miss only, a per-class token bucket (`budget.ts`, 80% of the spec's per-IP limits, per instance) → fetch (no-store) → zod → cache. Over-budget requests fail as 429 (`rate-limit`), never queue past half their timeout. Bump `CACHE_VERSION` to discard cached API entries. The Postgres snapshot fallback is still partial.
- `src/lib/analytics/`: pure, unit-tested metric rules: sample tiers, Wilson interval, tiers (`tiers.ts`), trend rule (`trend.ts`), pick rate (Σ matches ÷ 12), rank bands.
- `src/features/meta/scope.ts`: the single definition of patch/7d/30d windows, rank bands and labels; every stats page resolves scope through it.
- `src/lib/deadlock/heroEndpoints.ts`: hero-detail endpoints. Matrix calls (counters, synergies, by-badge, by-duration) return all heroes and share cache entries. The 2 MB upgrade list is cached as a projection via `unstable_cache`.
- Build labels (`features/builds/model.ts`): "best-performing" only when the interval clears every other tracked build for the hero; otherwise high-performing / frequently used / popular / high-confidence, each with a rule shown in the UI. Never call a build "best" outside that rule.
- Matches (`lib/deadlock/matchEndpoints.ts`): use `include_player_kda` (+ `extra_player_columns=net_worth`), never `include_player_info` (~30× larger). Raw API values (team ids, enum strings like `KECitadelGameModeNormal`, badges) are mapped in `features/matches/model.ts` and never shown.
- Match detail (`lib/deadlock/matchDetail.ts`): single-match metadata is cached as a zod projection via `unstable_cache` (raw can exceed 2 MB); errors are thrown inside the cache so "not processed yet" is never cached. `objectives[].team` is the OWNER; stat ticks are cumulative samples (3-min to 15:00, then 5-min). Match Story phases sit on those samples (9:00, 20:00) and state counts only.
- Players (`lib/deadlock/playerEndpoints.ts`): public profile fields only (never realname/country/friends). Match-history win/loss = `match_result === player_team` (`player_match_outcome` is 0 on most older matches; only 3–5 are excluded). Leaderboard entries link to a profile only when `possible_account_ids` has exactly one id. Per-player stats use the `player` sample scale (`sampleTier(n, 'player')`); profiles state results, never skill ratings.
- Compare (`/compare`, `features/compare`): hero/build/player vs. Reuses each detail page's loader so numbers match. "Key differences" come only from `features/compare/model.ts`: win rates need non-overlapping Wilson intervals and no Low sample; popularity needs a 1.5× (favorites 2×) gap; group results merge to one line per side. Wording states the measurement, never an interpretation ("higher win rate in matches over 35 min", not "better late game"). Builds for different heroes aren't compared on win rate directly.
- Draft Lab (`/draft`, `features/draft`): draft state lives in the URL (`?allies=&enemies=`, slugs). Pair results are compared with the additive expectation from individual win rates (same team wr₁+wr₂−50%, opposing wr₁−wr₂+50%); a relationship is "clear" only with a non-Low sample, an interval excluding the expectation, AND a gap ≥ 1pp (`MIN_EFFECT`; huge samples make tiny gaps "significant"). Only clear relationships are drawn or used. Recommendations need ≥1 clear positive and more positives than negatives (high = ≥2 positives, no negatives). Balance = per-match hero damage / damage taken / objective damage percentiles from `getHeroTotals`; utility (healing, CC) isn't in the API, so it's stated as unmeasured. Stretched SVGs (`preserveAspectRatio=none` + non-scaling stroke) can't use `data-draw`; use `animate-fade-in`.
- Insight Engine (`lib/analytics/insights.ts`, pure): one generator per kind (rising/falling, recent shift, matchups, pairing, popular / high-performing build, item trend, rank and match-length splits, rank popularity). Each returns an insight only when its rule passes (non-Low sample, separated 95% intervals, gap ≥ `MIN_EFFECT` 1pp; item trend ≥ 3pp; popularity ≥ 1.5×) and carries its `metrics`, `rule`, context note and caveat. Wording is descriptive only; tests sweep every generator with `nonDescriptiveTerms`. Render with `components/data/InsightCard` (native `<details>` "Why?"). Used on Hero Detail (`heroInsights` in `features/hero/model.ts`).
- Upstream day rounding: `hero-stats`/`item-stats` round time bounds to whole UTC days, and an end at the next day's 00:00 pulls in that whole day; end whole-day windows with `throughDay()` (`lib/deadlock/endpoints.ts`). `hero-counter-stats` filters exactly.
- Analyze (`/analyze`, `features/analyze`): hero analysis workspace that reuses the Meta loader and Hero Detail loaders (no data source of its own). Hero inputs (`laneMatchups`, `heroSynergies`, `lengthSplit`, `dayRows`, `heroBuilds`, … in `features/hero/loaders.ts`) are React-`cache`d per HeroContext, so sections sharing a context fetch and model each dataset once; sections load only what they show. Trends follow the selected window (`trendRange`, sliced from the 60-day `dayRows`). `getActiveHeroes`/`getRanks`/`getPatchFeed` are memoized per request. `DEADLOCK_API_TRACE=1` logs path + query, so true duplicates are visible. Peer comparison (`model.ts`) ranks only non-Low samples and calls a hero higher/lower than the rest of its group only with separated intervals and a gap ≥ `MIN_EFFECT`.
- Home (`features/home`): logo hero (`BrandMark variant="primary"`, scale-only reveal: it is the LCP, never fade it), stats strip (Meta model + `/v1/info` source counters, labelled as source facts), Hero performance (`heroPerformance` in `model.ts`; bans = share of recorded bans from `hero-ban-stats`, never a rate). Rank badges: tier image `images.large_webp` from `/v1/assets/ranks` via `scope.tierImages` → `RankBadge`; never the per-subrank image URLs (they hit the API from the browser).
- Leaderboard (`features/leaderboard`): regional views = Valve leaderboards; Global and Performance = `/v1/analytics/scoreboards/players` (tracked matches, all regions). "Rank change" = the batch rank endpoint's latest-match progress delta; a badge different from the one entered with = promoted/demoted.
- Global search (Ctrl/⌘+K, `components/layout/command/CommandPalette.tsx` → `GET /api/search` → `features/search`): heroes/items/patches from cached asset feeds; builds (`search_name`) and players (steam-search) per query with a 2.5s budget and `retry: false` (upstream build name search can take ~8s); partial answers aren't cached. `/api/search` is throttled per client (`lib/rateLimit.ts`, 40/min, in-memory per instance → 429 + `Retry-After`). `features/search/model.ts` ranks and groups (fixed order, 5 per group), filters Steam's fuzzy player matches, and adds hero shortcuts. Items have no page yet, so they are info rows skipped by arrow keys. Teams aren't in the API, so there is no Teams group.
- API checks: `npm run api:verify` validates every call in `src/lib/deadlock/` against the live OpenAPI spec (paths, deprecation/MMR, query params, zod fields); run it after touching an endpoint. Errors: `classifyError` (`lib/deadlock/errors.ts`) maps failures to `rate-limit | timeout | invalid | not-found | unavailable`; render them with `DataNotice` and data age with `Freshness` (`components/data/DataState.tsx`). Home sections use `unstable_cache` + computed-at time for the Stale state. Production sources and cache classes: `docs/API.md` §9.
- `lib/deadlock/constants.ts` holds plain constants (regions, scoreboard metrics) importable from client code and tests; `*Endpoints.ts` files are server-only.
- Performance (`docs/PERFORMANCE.md`): measure with `scripts/perf-audit.mjs` before optimizing; budgets in § 6. `DEADLOCK_API_TRACE=1` logs every upstream call. Client components never read the clock/locale during render (pass `now` from the server). Nav items carry `built`; unbuilt links don't prefetch (tested). Hero image URLs come from `lib/deadlock/heroImages.ts` (WebP first). Looping animations run on `::after` with transform/opacity only.
- Production readiness (`docs/QA.md`): page loads go through `attempt()` (`lib/deadlock/errors.ts`) and render failures with `DataNotice` (never a generic "didn't respond"). Only `isMissing()` (4xx except 429) may mean "doesn't exist": a rate limit must never read as missing data. Timeouts aren't retried. Don't add a root `loading.tsx`: it streams before `notFound()` and turns 404s into 200s. Security headers live in `next.config.ts`; env vars in `.env.example`.
- Accessibility (`docs/ACCESSIBILITY.md`, harnesses `scripts/a11y-*.mjs`): zero axe violations is the bar. Horizontal scrollers whose content has nothing focusable use `components/ui/ScrollRegion` (named, focusable). Game images whose name is printed beside them pass `decorative` (alt=""). Charts with many markers use one Tab stop + arrow keys (match timeline). Never color alone: add a word, sign, arrow or dash. Touch targets ≥ 44px on coarse pointers (`pointer-coarse:min-h-11`/`min-w-11`).
- Mobile (`docs/MOBILE.md`): phones get cards below `sm`, not shrunk tables; small text links get `pointer-coarse:min-h-11`; chart axis labels are HTML, not SVG text. Two base rules in `globals.css` prevent page-widening: grid items `min-width: 0`, scroll containers `position: relative`. Test phones with touch emulation and compare `innerWidth` to the device width.
- Win-rate bars use `lib/scale.ts` (50%-centered, widened so nothing clips).
- `src/features/<page>/`: `loaders.ts` (server, fetch + assemble), `model.ts` (pure view-model building, tested), `query.ts` (URL filter state), `components/`.

- `src/app/globals.css`: all design tokens (`@theme`). Components use token utilities, never raw hex.
- `src/components/ui/`: primitives (Button, IconButton, Badge, Tag, Tabs, SearchInput, Filter, Tooltip, Modal/Drawer, Table, Skeleton, SectionHeader, Empty/Error/Loading states).
- `src/components/data/`: statistic displays (StatCard, DataCard, ScopeLine, TrendBadge, ConfidenceBadge, Sparkline). Statistics take a `StatScope` (`src/lib/analytics/scope.ts`).
- `src/components/cards/`: HeroCard, BuildCard, MatchCard, PlayerCard.
- `src/components/game-assets/`: the **only** place game imagery may render. `HeroImage` renders all hero art and falls back to an original design when assets are off (`NEXT_PUBLIC_GAME_ASSETS=off`), missing, or fail to load (including failures before hydration). Pages must look complete without art.
- `src/components/motion/`: `Reveal` (scroll reveal; `variant="section"` = 20px, items 8px), `CountUp` (once on entry; reserves the final width so there is no layout shift), `InView` (holds CSS animations inside at frame 0 until scrolled into view: use it around below-the-fold charts, item rows and timelines). Motion tokens and the reduced-motion override live in `globals.css`. Reduced motion zeroes durations AND delays, and turns loops (drift, live pulse, shimmer, boot scan) off entirely. Animate transform/opacity/stroke only; hero art may scale slightly on hover but is never otherwise animated.
- `src/components/layout/`: app shell. `header/` (SiteHeader, PrimaryNav, MoreMenu, MobileNav drawer, SearchTrigger, LoginPlaceholder), `command/` (Ctrl/⌘+K CommandPalette + provider), Footer, PageContainer, SkipLink. Nav items come only from `src/config/navigation.ts`.
- Unbuilt sections resolve to `src/app/not-found.tsx`.
- `/design`: internal showcase of every component, using fictional data from `src/mocks/` (labeled DEMO DATA, noindex).

### Commands

- `npm run dev`: Next.js dev server
- `npm run build`: production build (also type-checks)
- `npm run lint`: Oxlint (not ESLint), with `react`, `typescript`, `jsx-a11y`, and `nextjs` plugins
- `npm run typecheck`: `tsc --noEmit`
- `npm test`: Vitest unit tests (`tests/unit/`). Run one file with `npx vitest run tests/unit/format.test.ts`.
- `npm run check`: typecheck + lint + test + build. This is the gate at the end of every phase.

### TypeScript and lint constraints

- `verbatimModuleSyntax`: use `import type` for type-only imports.
- `erasableSyntaxOnly`: no `enum`, `namespace`, or constructor parameter properties.
- `noUnusedLocals` and `noUnusedParameters` are errors.
- `@/*` maps to `src/*`.
- Client components can't receive functions from server components; pass named options instead (e.g. `CountUp format="percent"`).
- Lint suppressions need a `--` reason comment.

## Workflow

For major tasks:

1. Inspect the existing code.
2. Explain what you found.
3. Create a plan.
4. Ask for clarification only when it's genuinely necessary.
5. Implement the smallest coherent change.
6. Run validation (typecheck/build/tests) and fix errors before moving to the next phase.
7. Summarize what changed.
8. Identify the next logical step.

Planning docs live in `docs/` (PRODUCT, ARCHITECTURE, ROUTES, DATA_MODEL, API, DESIGN, ROADMAP, MOBILE). Follow the ROADMAP phases in order.

Never build the entire product in one uncontrolled change. Don't replace working architecture without approval, don't do large unrelated refactors, and don't introduce libraries without a clear reason.

## Architecture

Preferred stack: Next.js, TypeScript, Tailwind CSS, PostgreSQL.

Keep these layers separate:
- UI
- data fetching
- business logic
- analytics
- database access
- external API integration

Never put API calls directly inside presentation components.

Data flow: **Frontend → server-side data layer → cache → external API / data lake.**
- Never expose API keys in client-side code.
- Don't make repeated direct browser requests to external APIs.
- Use caching, deduplication, and request batching. Respect external API rate limits.

Component rules:
- Reuse the design system and don't duplicate components.
- Keep components focused.
- Prefer readable code over clever code.

## Deadlock API

- API: https://api.deadlock-api.com
- Docs: https://api.deadlock-api.com/docs
- OpenAPI: https://api.deadlock-api.com/openapi.json
- Data Lake / MCP: https://api.deadlock-api.com/v1/mcp (configured locally as the `deadlock` MCP server)

Domains: players, matches, analytics, builds, leaderboard, heroes, items, ranks, map, demo.

- Inspect the current OpenAPI schema before implementing any endpoint. Never guess endpoint names or response shapes.
- Never assume deprecated endpoints are current.
- Prefer current rank endpoints over deprecated MMR endpoints.

## Analytics principles

- Every statistic must carry its context: patch, time range, sample size, and rank scope and role where available.
- Don't present small samples as strong conclusions. Show sample size or confidence where statistically appropriate.
- Never invent statistics, fabricate trends, or hardcode fake live data into production components.
- Mock data is allowed only during initial UI development and must be clearly labeled as mock/demo.

## Information architecture

- **Primary nav:** Home, Meta, Heroes, Builds, Matches, Analyze
- **Secondary nav:** Players, Leaderboard, Items, Patch, Tools, Community
- **MVP pages:** Home, Meta, Heroes, Hero Detail, Builds, Matches, Match Detail, Players, Player Detail, Leaderboard
- **Later phases:** Compare, Draft Lab, Personal Dashboard, Coach, Trends, Advanced Analytics

## UX principles

- Simple first, deep later, using progressive disclosure.
- Never overwhelm the first screen with raw data.
- Every important metric should answer a useful question. Give a "Why?" explanation for key insights where possible.
- Prefer insight cards over walls of numbers. Tables are for deep analysis, not the first layer.
- Design mobile intentionally, not as a compressed desktop layout.

## Visual direction

Personality: dark, editorial, underground, tactical, cinematic, data-driven, modern, characterful, premium, restrained. It draws on comic/editorial gaming culture but keeps its own original design language.

| Token | Hex |
|---|---|
| Background | `#0B1220` |
| Surface | `#1A253F` |
| Steel | `#3B556F` |
| Accent (cyan) | `#4FC2C0` |
| Highlight | `#66FFE8` |
| Orange | `#F58220` |
| Pink | `#ED438B` |
| Text primary | `#F5F7FA` |
| Text secondary | `#A9B4C5` |

Color use:
- Cyan marks interactive, positive, and current states.
- Use orange sparingly, for warning and trending states.
- Use pink sparingly, for special states.
- Don't make every component neon.

Typography:
- Headlines: bold condensed editorial display.
- UI and navigation: clean modern sans.
- Body: highly readable system sans.
- Keep the text hierarchy strong.

### Motion ("data awakening")

Animation should communicate information, not just decorate.

- **Use:** fade with a slight upward move, subtle scale-in, graph drawing, counter animation, staggered card reveal, item/build assembly, timeline playback, subtle background drift, restrained glow, subtle hover elevation.
- **Avoid:** constant flashing, excessive particles, aggressive parallax, excessive bounce, animated tables, unnecessary layout shifts.
- **Timing:** FAST 150–250ms · MEDIUM 300–450ms · SLOW 500–800ms · CINEMATIC 2–12s.
- Always respect `prefers-reduced-motion`.

## IP and asset rules

These are product design constraints, not a legal determination. Never claim they guarantee legal compliance.

- The site is unofficial. Never imply affiliation with Valve, and include a clear unofficial-project notice in the footer.
- Never use Valve or Deadlock branding as our brand identity.
- The logo must be original. Don't recreate official logos or make derivatives of official character art for branding.
- Game imagery may appear only as a data identifier for the relevant hero, item, or match, never as the site's main identity.
- Prefer original UI, backgrounds, illustrations, icons, and visualizations.
- Don't redistribute extracted game files.
- An external asset URL doesn't mean we have commercial rights to that asset.
- Keep game asset usage isolated in dedicated components so those assets can be replaced or disabled without a redesign.

## Accessibility

Use semantic HTML and provide:
- a proper heading hierarchy
- a skip link
- keyboard navigation
- visible focus states
- sufficient color contrast
- aria-labels where appropriate
- accessible tooltips
- reduced-motion support

## Performance

- Animate `transform` and `opacity`, and use `will-change` sparingly.
- Optimize images and lazy-load non-critical imagery.
- Avoid unnecessary client-side JavaScript.
- Don't animate hundreds of DOM nodes at once.
- Virtualize very large tables if needed.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
