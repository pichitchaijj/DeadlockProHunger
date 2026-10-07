# Deadlockprohunger — Product

> Unofficial community analytics and strategy platform for Deadlock.
> Not affiliated with or endorsed by Valve.

**Core principle:** DATA → INSIGHT → DECISION → ACTION

**Positioning:** "Deep like an analyst tool. Simple like a modern consumer product."
A premium editorial gaming-intelligence platform, not a generic stats dashboard.

Related docs: [ARCHITECTURE](./ARCHITECTURE.md) · [ROUTES](./ROUTES.md) · [API](./API.md) · [DATA_MODEL](./DATA_MODEL.md) · [DESIGN](./DESIGN.md) · [ROADMAP](./ROADMAP.md) · [QA](./QA.md)

**Status (re-verified 2026-10-07):** Status labels (**Implemented**, **Partial**, **Planned**, **Deprecated**, **Blocked**) are defined in [ARCHITECTURE](./ARCHITECTURE.md). **Implemented:** every first-release page is live on real data: Home, Meta, Heroes, Hero Detail, Builds (plus Build Detail), Matches, Match Detail, Players, Player Detail and Leaderboard. Compare and Draft Lab were built ahead of plan. Analyze is a hero analysis workspace. **Blocked:** Personal Dashboard, pending approval for Steam sign-in. The analytics rules below are implemented in `src/lib/analytics/` and unit-tested.

---

## 1. Product architecture

### Pillars

| Pillar | What it means | MVP surface |
|---|---|---|
| **Meta intelligence** | What is strong right now, for my rank, and why | Home, Meta, Heroes |
| **Hero mastery** | How to play a hero: matchups, items, builds | Hero Detail, Builds |
| **Self-analysis** | How am I doing, and what should I change | Players, Player Detail, Match Detail |
| **Competitive pulse** | Who is at the top, what they play | Leaderboard |

### Users

| User | Need | Default experience |
|---|---|---|
| **New player** | "What hero is easy and good? What do I buy?" | Insight cards, plain-language "Why?", recommended builds |
| **Improving player** | "Why am I losing? What counters my hero?" | Player detail, matchups, item timing |
| **High-rank analyst** | "Show me the raw numbers with filters" | Tables, rank-band filters, sample sizes, intervals |

All three share the same pages. Depth is unlocked through progressive disclosure, not separate modes.

### The insight loop

Every page is designed around the same four steps:

```
DATA        real aggregates from the Deadlock API (with scope + sample size)
  ↓
INSIGHT     a sentence that answers a question ("Haze is the top pick at Oracle+")
  ↓
DECISION    what this means for the player ("strong into your main's counters")
  ↓
ACTION      a link that lets them act (open build, view matchup, compare)
```

A metric that does not answer a useful question does not go on the first screen.

---

## 2. Information architecture

### Navigation

| Primary | Secondary |
|---|---|
| Home | Players |
| Meta | Leaderboard |
| Heroes | Items *(post-MVP)* |
| Builds | Patch *(post-MVP)* |
| Matches | Tools *(post-MVP)* |
| Analyze | Community *(post-MVP)* |

Compare and Draft Lab sit in the secondary list too. Items with no page yet (Analyze, Items, Patch, Tools, Community) are listed with a "Later" marker where post-MVP, resolve to "Nothing here yet", and aren't prefetched (`src/config/navigation.ts`). See [ROUTES](./ROUTES.md) for the full route map.

### Three-layer page model

Every content page follows the same layering:

| Layer | Purpose | Components | Visible by default |
|---|---|---|---|
| **L1 — What matters** | 2–4 insight cards answering the page's key question | `InsightCard`, `StatCard`, `TrendBadge` | Yes |
| **L2 — Why** | Context: sample size, interval, scope, comparison, explanation | `InsightCard`'s "Why?" (`<details>`), `ScopeLine`, `ConfidenceBadge` | Collapsed / inline on demand |
| **L3 — Deep data** | Full sortable tables and filters | `Table`, `Filter`, `Tabs` | Below the fold or in a tab |

Rules:
- The first screen never shows a raw table.
- Every L1 number carries its scope (rank band, time window or patch) somewhere visible on the card.
- L3 tables are for analysis, not decoration: no animation on table rows.

### Filter model (MVP)

Filters are **presets**, not free-form ranges. This keeps the UI simple and keeps upstream API usage within budget (see [ARCHITECTURE § Cache](./ARCHITECTURE.md#9-cache-strategy)).

| Filter | MVP values | URL param |
|---|---|---|
| Rank band | All · Low (Initiate–Sentinel) · Mid (Mystic–Emissary) · High (Oracle–Phantom) · Top (Ascendant–Eternus), by **match average** badge (`lib/analytics/rankBands.ts`) | `rank` |
| Window | Last 7 days · Last 30 days · Current patch (`features/meta/scope.ts`; the default and allowed set vary by page, see ROUTES) | `window` |
| Match mode | All or ranked only (Meta) | `mode` |
| Game mode | Normal. Street Brawl post-MVP | — |

Filter state lives in the URL so every view is shareable.

---

## 10. Analytics strategy

### Non-negotiables (from CLAUDE.md)

- Every statistic preserves **patch / time window, rank scope, role (if available), and sample size**.
- Never invent statistics, never fabricate trends, never hardcode fake live data into production components.
- Mock data is allowed only during early UI work and must render a visible `DEMO DATA` badge. Mock fixtures live under `src/mocks/` and are never imported by production loaders.

### Metric definitions

All formulas live in `src/lib/analytics/` as pure functions with unit tests. Inputs are the raw counts returned by the API (see [API](./API.md)).

| Metric | Definition | Source fields |
|---|---|---|
| Win rate | `wins / matches` | `AnalyticsHeroStats.wins`, `.matches` |
| Win-rate interval | 95% Wilson score interval on `wins, matches` | same |
| Pick rate | `hero.matches / (Σ all heroes' matches / 12)` over the same filters (`lib/analytics/pickRate.ts`). `game-stats.total_matches` isn't used: it counts a slightly different population ([API § 4.5](./API.md#45-hero-statistics)) | `AnalyticsHeroStats.matches` |
| KDA | `(kills + assists) / max(deaths, 1)` from totals | `total_kills`, `total_assists`, `total_deaths` |
| Avg net worth | `total_net_worth / matches` | `total_net_worth` |
| Matchup win rate | `wins / matches_played` for hero vs enemy | `HeroCounterStats` |
| Synergy win rate | `wins / matches_played` for the pair | `HeroSynergyStats` |
| Item win rate | `wins / matches` for buyers | `ItemStats` |
| Item timing | `avg_buy_time_s` (absolute) and `avg_buy_time_relative` | `ItemStats` |
| Build win rate | `wins / matches` | `HeroBuildStats` |

The field names above come from the OpenAPI schema; `npm run api:verify` checks every zod field the code reads against the live spec.

### Sample size and confidence

Sample tiers are starting thresholds, tuned once real distributions are visible. Individual players use a smaller scale (`sampleTier(n, 'player')`: Low < 20, Moderate 20–100, High > 100).

| Tier | Matches | Treatment |
|---|---|---|
| **Low** | < 200 | Muted styling, "Low sample" badge. Never used in L1 insight cards or "top/bottom" lists. |
| **Moderate** | 200 – 1,000 | Shown normally, with the interval visible in L2. |
| **High** | > 1,000 | Shown normally. Eligible for headline insights. |

Matchup and synergy cells need at least **100 games** to be shown at all (use the API's `min_matches` parameter so we don't pay for rows we discard).

`ConfidenceBadge` shows the sample tier (dot count, `n =` and the tier name), and `ScopeLine` puts window, rank and sample size beside every statistic.

### Trends

A change is only labeled a trend when it is statistically distinguishable:

1. Compare window A (e.g. last 7 days) with window B (the 7 days before).
2. Compute both Wilson intervals.
3. If the intervals do not overlap → "Rising" / "Falling" (cyan / orange). Otherwise → "Stable".
4. Never show a trend if either window is in the Low tier.

Both windows come from `hero-stats` day buckets on the live API (`lib/analytics/trend.ts`). The daily job also stores day totals in `hero_stats_snapshots` ([DATA_MODEL](./DATA_MODEL.md)) so history can reach beyond upstream windows. When nothing moved beyond normal variation, the UI says so rather than showing a trend.

Relationships between heroes (Compare, Draft Lab, insights) use a stricter rule: non-Low sample, separated 95% intervals **and** a gap of at least 1 percentage point (`MIN_EFFECT`), because huge samples make tiny gaps "significant".

### "Why?" explanations (Insight Engine)

Insights come from `lib/analytics/insights.ts`: one pure generator per kind (rising/falling, recent shift, matchups, pairing, popular and high-performing builds, item trend, rank and match-length splits, rank popularity). Each returns an insight only when its rule passes, and carries its metrics, the rule, a context note and a caveat, shown in the card's "Why?". There is no free-form generation and no LLM text.

Wording is **descriptive only** ("higher win rate in matches over 35 min", never "better late game"); tests sweep every generator for non-descriptive terms. **Implemented** on Hero Detail; **Planned** for Meta, Home and Build Detail.

### Patch awareness

- Current-patch boundaries come from `/v2/patches`: the date is parsed from the forum changelog title, because `pub_date` is unreliable. A patch window starts on its UTC day.
- When the patch feed fails or no title parses, the UI says "Patch unknown" and "current patch" falls back to the last 7 days.
- A patch window that is still short is flagged on Meta with a "New patch" badge (limited data). **Planned** (original decision): default to the pre-patch window with a toggle while the new patch has little data.

---

## 11. Mobile strategy

Mobile is designed first, at a 375px reference width, not compressed from desktop.

| Concern | Mobile pattern | Desktop pattern |
|---|---|---|
| Primary nav | Header with search and a hamburger that opens a full-height navigation drawer (all primary + secondary items, 48px+ targets, safe-area padding). | Top bar with all primary items. Secondary in a "More" menu. Ctrl/⌘+K opens the command palette. |
| Insight cards | Single column stack, swipeable carousel only for "top heroes" rows | 2–4 column grid |
| Tables (L3) | Ranked list. Each row shows 2–3 key values and expands for the rest. | Full sortable table |
| Filters | Compact chip row plus a bottom sheet for full filters | Inline filter bar |
| Hero detail tabs | Sticky segmented control under the hero header | Tabs plus side summary panel |
| Match detail | Team-by-team stacked cards | Two-column team layout |

Other rules:
- Touch targets ≥ 44 × 44px.
- No hover-only information. Everything reachable by tap and focus.
- Respect safe-area insets for the bottom bar.
- Heavy charts are replaced by a text summary plus a simple bar on small screens when they would be unreadable.

---

As built, phones get cards below `sm` instead of shrunken tables, chart axis labels are HTML, and the drawer, palette and timeline are verified with touch emulation ([MOBILE](./MOBILE.md)).

## Out of scope for the MVP

- Accounts and login (Steam OpenID comes with the Personal Dashboard post-MVP).
- User-generated content, comments, community features.
- Arbitrary custom filter ranges (presets only).
- Any monetization.
