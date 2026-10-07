# Deadlockprohunger — Route Map

Covers **3. Route map**, **as built** (re-verified 2026-10-07 against `src/app/` and `features/*/query.ts`). Endpoint details, limits and cache lifetimes per endpoint are in [API § 9](./API.md#9-production-data-sources-as-built); this page doesn't repeat them. Status labels (**Implemented**, **Partial**, **Planned**, **Deprecated**, **Blocked**) are defined in [ARCHITECTURE](./ARCHITECTURE.md); every route below is Implemented unless labelled.

---

## Global conventions

| Convention | Detail |
|---|---|
| Scope | Stats pages resolve their window and rank band through `features/meta/scope.ts`. `?rank=all\|low\|mid\|high\|top` (default `all`; bands in `lib/analytics/rankBands.ts`, filtering by **match average** badge). `?window=7d\|30d\|patch`; the default and allowed set vary by page (below). `patch` falls back to 7 days when the patch date is unknown. |
| URL state | Filters live in the URL (`features/<page>/query.ts` parses and validates them), so every view is shareable. Unknown values fall back to defaults; they never error. |
| Slugs | Hero slugs come from the hero name in `/v1/assets/heroes` (`slugify`). Unknown slug → 404. |
| IDs | `matchId` (1–12 digits) and `accountId` are validated before any upstream call. Invalid → 404. |
| Metadata | **Partial.** Titles use the template "Deadlockprohunger — %s", and pages set descriptions. **Planned:** an OG image per page (original brand art + text, never game art) and a sitemap. |
| States | Sections stream with `Suspense` skeletons. Failures render `DataNotice` with the classified reason (`attempt()`, [QA](./QA.md)). The root `error.tsx` catches render errors. There is **no** `loading.tsx`: it would start streaming before `notFound()` and turn 404s into 200s. |
| Not built | Nav items with `built: false` (`src/config/navigation.ts`) resolve to `not-found.tsx` ("Nothing here yet") and aren't prefetched. |

---

## MVP pages

### `/` — Home
Question: *"What's happening in Deadlock right now, and where should I go?"*
- Hero (storyboard `../REFเว็บ/Home.png`): the owner's logo (scale-only reveal, so it is visible from the first frame and is the page's largest paint), the brand statement, CTAs, and a stats strip: heroes, matches analyzed (7 days), new matches per day and player profiles known to the data source (`/v1/info`, labelled as the source's own counters).
- Sections, each loading and failing on its own: **Current patch snapshot**, **Deadlock pulse** (this week's numbers), **Hero performance** (top 5 by win rate / pick rate / recorded bans, tabs; Low samples never rank; bans as share of recorded bans), **Who's moving** (trend rule only; empty when nothing moved beyond normal variation), **Trending builds**, recent matches, quick entry tiles with section icons.
- Not built from the storyboard on purpose: its illustrated city and character art (the site keeps the original "data city"), a builds total and KDA (no source in the current model).
- Each section is cached with its computed-at time and shows a **Stale** badge past its freshness budget.

### `/meta` — Meta
Question: *"Which heroes are strong at my rank this window?"*
- Layer 1 "At a glance" → Layer 2 "Tiers" (S/A/B/C from the Wilson interval, `lib/analytics/tiers.ts`) → Layer 3 full table.
- Params: `window` (`7d` default, `30d`, `patch`), `rank`, `role` (`marksman|mystic|brawler|assassin`), `mode` (`all|ranked`), `sort` (`tier|winRate|pickRate|matches`), `dir`, `low=1` (show Low-sample heroes, hidden by default).
- Falls back to stored daily history (`hero_stats_snapshots`) when it covers the window, labelled as a snapshot.

### `/heroes` — Heroes
Question: *"Which hero do I want to learn about?"*
- Hero directory with search, role and complexity filters, and sort (`name|winRate|pickRate|matches`).
- Params: `window` (`7d` default, `30d`, `patch`), `rank`, `q`, `role`, `complexity`, `sort`.

### `/heroes/[hero]` — Hero Detail
- Header plus insight cards from the Insight Engine (`heroInsights`).
- Tabs via `?tab=`: **overview** (default), **builds**, **matchups**, **abilities**, **trends**, **matches**.
- Params: `window` (`7d` default), `rank`, `lane` (`lane` default = same-lane matchups, or `any`).

### `/builds` — Builds
Question: *"What should I build on this hero?"*
- Categories: **meta** (default), **pro**, **community**. Each category's definition is shown in the UI.
- Params: `category`, `hero` (slug or `all`), `window` (`30d` default, `7d`, `patch`), `rank`.
- Build labels follow `features/builds/model.ts`: "best-performing" only when the interval clears every other tracked build.

### `/builds/[hero]/[buildId]` — Build Detail
- Build win rate, tracked matches and scope; "Why this build?"; items grouped Early · Core · Late; ability order; item flow.

### `/matches` — Matches
Question: *"Find a match, or see recent games."*
- Filters: `hero`, `player` (account id), `result` (`any|win|loss`, for that hero or player), `duration` (`any|short|standard|long`), `date` (`24h` default, `7d`, `patch`), `rank`. A live strip shows active matches. Finding a match by ID works through global search (Ctrl/⌘+K), which recognizes match ids.

### `/matches/[matchId]` — Match Detail
- Sections: Story, Teams, Players, Lineup, Timeline (one Tab stop with arrow keys), Builds, Performance, Graphs, Events, Advanced.
- Read from the database first when stored (finished matches are immutable), otherwise from upstream, then stored after the response.
- "Not available yet" when upstream hasn't processed the match. A rate limit never reads as "doesn't exist" (`isMissing()`).

### `/players` — Players
Question: *"Find a player."*
- Name / SteamID search (`?q=`), plus browsing views with a minimum recent team-average rank (`?rank=`).
- **Planned:** accept a Steam profile URL in the search (the Analyze hub's job).

### `/players/[accountId]` — Player Detail
- Current rank (current rank endpoints only; "Unranked" when `badge = 0`), win rate, recent matches, per-hero stats on the `player` sample scale, mates and enemies.
- Public profile fields only. Profiles state results, never skill ratings.
- Private or protected accounts get a respectful "Player not found" state that says they aren't shown.

### `/leaderboard` — Leaderboard
- One route, with views selected by params (there is no `/leaderboard/[region]`):
  - `view`: `ranked` (default) or `performance`.
  - `scope`: `global` (default; `/v1/analytics/scoreboards/players`, all regions) or a region `Europe|NAmerica|SAmerica|Asia|Oceania` (Valve leaderboards).
  - `hero`, `role`, `metric`, `min` (minimum matches: `20|50|100`, default 50), `window` (`30d` default, `7d`), `rank`, `page`.
- Rank change = the latest-match progress delta from the batch rank endpoint. Rows link to a profile only when `possible_account_ids` has exactly one id.

### `/analyze` — Analyze workspace
Question: *"How is this hero really doing, and where does it stand?"*
- No new data source: reuses the Meta loader (every hero in scope) and the Hero Detail loaders (context, insights, trends, builds, matchups), so numbers match those pages. The only new logic is `features/analyze/model.ts` (peer comparison, tested).
- Params: `hero` (slug; none = picker plus each role's pooled win rate), `window` (`7d` default, `30d`, `patch`), `rank`, `role` (narrows the picker), `peers` (`role` default or `all`).
- Sections: scope controls and hero picker (folds into "Change hero" once one is chosen) → identity and core metrics (win rate with interval and weekly trend, pick rate, matches; a Low-sample notice when it applies) → insights → win/pick-rate trends for the selected window (cut from one shared 60-day daily series; the text states the dates and any days the source has no data for) → comparison with peers (ranked only with enough data; "higher/lower than the rest" only with separated intervals and a gap ≥ 1pp) → build performance → matchups → "How to read this".
- Unknown `hero` → "Unknown hero" with the picker (200, the page exists). Failures use `DataNotice` per page and `ErrorState` per section.
- **Planned (original hub idea):** one input that accepts a match ID, player name, SteamID or profile URL. Match IDs and player names already work through global search (Ctrl/⌘+K).

---

## Built ahead of the original plan (post-MVP)

| Route | What it is |
|---|---|
| `/compare` | Hero, build or player vs. (`?type=heroes\|builds\|players&a=&b=`, plus `window`, `rank`). Reuses each detail page's loader; "Key differences" only from `features/compare/model.ts` |
| `/draft` | Draft Lab (`?allies=&enemies=` slugs, `side`, `window`, `rank`). Only "clear" pair relationships are drawn or used |

## Internal routes

| Route | Purpose | Protection |
|---|---|---|
| `/design` | Component showcase with labelled DEMO DATA from `src/mocks/` | `noindex`; disallowed in `robots.txt` |
| `GET /api/search?q=` | Command-palette search: heroes, items, patches, builds, players, match ids | Query trimmed and length-capped; 40 queries per client per minute (429 + `Retry-After`); each source capped at 3 s |
| `GET /api/cron/{reference\|daily\|builds\|prune\|prewarm}` | Database jobs (`vercel.json`, daily) and the cache prewarm (hourly via GitHub Actions, daily backup on Vercel; needs no database) | `Authorization: Bearer $CRON_SECRET`, constant-time compare; refuses without the secret; `days` clamped to 1–30 |
| `/robots.txt`, `/icon.png`, `/apple-icon.png`, `/brand/*` | Static | — |

Pages fetch through server components, not through our own API. `/api/search` exists only because the palette is a client component.

---

## Reserved (Planned)

| Route | Phase ([ROADMAP](./ROADMAP.md)) |
|---|---|
| `/items`, `/items/[slug]` | Post-MVP 1 |
| `/patch`, `/patch/[id]` | Post-MVP 2 |
| `/trends` | Post-MVP 4 (Hero Detail already has a Trends tab) |
| `/me` | Personal Dashboard: **Blocked** on approval for Steam sign-in (accounts are a new architecture layer) |
| `/tools`, `/community` | Later |
| `/about` | Was planned in P0 and isn't built. Methodology lives in the in-page "Why?" panels and rules for now |
