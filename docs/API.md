# Deadlockprohunger — Data Sources & External API

Covers **6. Data architecture**, **7. External API integration**, and the **dataset catalog** (what real data exists, how fresh it is, and how we use it).

## How this was verified

Investigated on **2026-10-06** from three sources. Nothing below is assumed. Anything not confirmed is marked **Unverified**.

1. **OpenAPI spec**: `https://api.deadlock-api.com/openapi.json` ("Deadlock API 0.1.0"). Every endpoint's description, parameters, defaults, rate-limit table and response schema were read.
2. **Live REST calls** (a handful, within limits): `/v1/info`, `/v1/assets/ranks`, `/v1/assets/heroes`, `/v1/assets/client-versions`, `/v1/assets/ranked-seasons`, `/v2/patches`, `/v1/patches/big-days`, `/v1/matches/recently-fetched`, `/v1/matches/{id}/metadata`, `/v1/players/rank`, `/v1/leaderboard/Europe`, `/v1/analytics/hero-stats`, `/v1/analytics/game-stats`.
3. **MCP / Data Lake** at `https://api.deadlock-api.com/v1/mcp`: `initialize`, `tools/list`, `list_tables`, `list_columns` for every table, and freshness queries.

Re-verify before relying on any shape: **`npm run api:verify`** checks every call in `src/lib/deadlock/` against the live spec (path exists, GET, not deprecated, not MMR; every query param declared; every zod field present in the response schema) and exits 1 on any mismatch. Last run 2026-10-07: 37 call sites → 28 endpoints, all current; every path named in this doc exists in the live spec, and the deprecated list in §6 matches the spec's 14 deprecated paths exactly. See [§9](#9-production-data-sources-as-built) for what production actually uses.

Related: [DATA_MODEL](./DATA_MODEL.md) · [ARCHITECTURE](./ARCHITECTURE.md) · [ROUTES](./ROUTES.md)

Status labels (**Implemented**, **Partial**, **Planned**, **Deprecated**, **Blocked**) are defined in [ARCHITECTURE](./ARCHITECTURE.md). §4 entries say whether we store each dataset; §6 lists every **Deprecated** endpoint; §9 lists what is **Implemented** in production.

---

## 1. Sources

| Source | What it is | Freshness | How we use it |
|---|---|---|---|
| **REST API** `https://api.deadlock-api.com` | Typed endpoints: assets, analytics aggregates, players, matches, builds, leaderboards, patches | Per endpoint (see catalog) | **Runtime source** for the app, server-side only |
| **Data Lake** (DuckDB over hourly parquet snapshots of the API's ClickHouse tables). Reached through MCP at `/v1/mcp`. The `/v1/sql` deprecation note also points to `https://data.deadlock-api.com` | Raw tables: `match_player` (all per-player match rows), `leaderboard` / `hero_leaderboard` history, `steam_profiles`, `match_salts` | Hourly snapshots. Observed lag (2026-10-07 08:26 UTC): newest match 07:47 UTC, newest leaderboard 08:14 UTC | **Research and offline analysis only** (not a runtime dependency in the MVP) |
| **API meta** `/v1/info` | Ingest volume, table sizes | Live | Ops / about page |

Observed volume (`/v1/info`, 2026-10-06): `fetched_matches_per_day` = **106,124**.

### MCP / Data Lake details (re-verified 2026-10-07 over JSON-RPC)

- Server `deadlock-api` 0.1.0, protocol `2025-06-18`.
- Tools:
  - `execute_query` (argument `sql`; read-only DuckDB SQL)
  - `list_databases`, `list_tables`, `list_columns`
  - `list_heroes` (id → name/className, or full details by `id`)
  - `list_items` (requires `type` = `ability` | `weapon` | `upgrade`, or an `id`)
- Limits: results capped at **1,024 rows and 50 KB per query**, with a **45 s timeout** (the server's current instructions; it was 300 s on 2026-10-06). Only SELECT/WITH/FROM/DESCRIBE/SHOW/SUMMARIZE run.
- `match_player` is hundreds of GB. Filter on `match_id` or `start_time` (fast file skipping). Filtering on `account_id` alone scans everything, so combine it with a `start_time` range.
- `match_player` is incremental, and about 2% of rows can be duplicated. Use **`match_player_latest`** when counts matter.
- **Resolved upstream:** `TIMESTAMP WITH TIME ZONE` columns used to fail to serialize ("Invalid timezone Etc/UTC"). On 2026-10-07 they return ISO strings, so casting is no longer needed.
- Known issue (still true 2026-10-07: the `deadlock` tools didn't load in Claude Code): Claude Code's built-in MCP client rejects this server's `tools/list` (schema validation on `ttlMs` / `cacheScope`). Direct JSON-RPC over HTTP works. Research scripts live in the session scratchpad, not in the repo.

Data Lake tables:

| Table | Export | Key columns |
|---|---|---|
| `match_player` | incremental | 157 columns (file count no longer queryable: file-system functions are disabled). Match: `match_id`, `start_time`, `duration_s`, `match_mode`, `game_mode`, `average_badge[_team0/1]`, `winning_team`, objectives, mid_boss. Player: `account_id`, `hero_id`, `team`, `kills`/`deaths`/`assists`, `net_worth`, `assigned_lane`, `party`, `items.*` (purchase time, sold time, item_id), `stats.*` (per-tick time series), `death_details.*` (positions), `ability_stats`, `hero_build_id`, `pregame_hero_id`, `banned_hero_ids`, `player_rank_*` (rank progress), `won`, `mvp_rank`, `accolades.*` |
| `match_player_latest` | view | as above, deduplicated |
| `leaderboard` | hourly full snapshot | `fetched_at`, `region`, `account_name`, `rank`, `leaderboard_position`, `top_hero_ids`. History from **2026-04-03** (19,074 snapshots, 16.1 M rows, 5 regions on 2026-10-07). |
| `hero_leaderboard` | hourly full snapshot | as above + `hero_id` |
| `steam_profiles` | hourly full snapshot | `account_id`, `personaname`, `profileurl`, `avatar*`, `personastate`, `realname`, `countrycode`, `last_updated`, `friends.*` |
| `steam_profile_observed_names` | hourly full snapshot | `account_id`, `observed_name`, `match_id`, `observed_at` |
| `match_salts` | hourly full snapshot | `match_id`, `cluster_id`, `metadata_salt`, `replay_salt` |

Data Lake enums are **strings** (e.g. `match_mode` = `'Ranked'`, `game_mode` = `'Normal'`). Some REST responses return the same enums as **integers**: for example, `/v1/matches/recently-fetched` returned `match_mode: 1, game_mode: 4`. Map them in the feature models (`features/matches/model.ts`; raw values are never shown) using the ClickHouse enum values listed in the Data Lake column comments:

| Enum | Values |
|---|---|
| `match_mode` | 0 Invalid, 1 Unranked, 2 PrivateLobby, 3 CoopBot, 4 Ranked, 5 ServerTest, 6 Tutorial, 7 HeroLabs, 8 NewPlayerPlacement |
| `game_mode` | 0 Invalid, 1 Normal, 2 OneVsOneTest, 3 Sandbox, 4 StreetBrawl, 5 ExploreNYC, 6 Internal |
| `team` | 0 Team0, 1 Team1, 16 Spectator |
| `player_match_outcome` | 0 Invalid, 1 Win, 2 Loss, 3 Penalized, 4 PenalizedParty, 5 NotScored |

---

## 2. Data architecture

```
Browser
  │  HTML / RSC payload only. Never calls deadlock-api.com directly.
  ▼
Next.js server (Vercel)
  │  route → features/<domain>/loaders.ts → lib/deadlock endpoint fn
  ▼
Cache tiers
  1. React cache()          per-request dedupe
  2. Next data cache        fetch(..., { next: { revalidate, tags } })
  3. Postgres (Neon)        reference data, daily history, last-good snapshots, immutable matches
  ▼
Deadlock REST API
```

Scheduled jobs (Vercel Cron, daily) write to Postgres. User requests read from the cache tiers and only reach upstream on a miss. The Data Lake is not in this path.

| Layer | Location | Responsibility | May import |
|---|---|---|---|
| External integration | `src/lib/deadlock/` | HTTP, auth header, retries, rate budgets, zod parsing, enum mapping, typed endpoint fns | nothing app-specific |
| Database access | `src/lib/db/` | Drizzle schema, queries, upserts | — |
| Analytics | `src/lib/analytics/` | Pure metric functions | no I/O |
| Data fetching / business logic | `src/features/<domain>/loaders.ts` | Combine API + DB + analytics into view models; set cache policy | `lib/*` |
| UI | `src/components/*`, `src/features/<domain>/components/` | Render typed view models | formatters only |

Every statistical view model carries a `StatScope` (window, patch, rank band / badge range, game mode, **sample size**, `source: 'live' | 'snapshot'`, `fetchedAt`). Components that show statistics require it as a prop.

---

## 3. Facts that apply across endpoints

### Auth
- Optional. Spec security schemes: `X-API-KEY` header or `api_key` query parameter.
- We use the **header only**, from server env `DEADLOCK_API_KEY`. No key in the MVP.

### Rate-limit model
- Each endpoint publishes IP / Key / Global limits. **All `/v1/analytics/*` endpoints share one bucket: 200 req/min per IP** (400 with a key, 2,000 global).
- Vercel functions share outbound IPs with other tenants, so our effective budget may be lower than the published per-IP figure. Design target: ≤ 60 analytics req/min at peak.

### Common analytics filters (verified on the analytics endpoints)

| Filter | Notes |
|---|---|
| `game_mode` | `normal` \| `street_brawl` \| `explore_n_y_c` \| `internal`. Default **`normal`**. |
| `match_mode` | `unranked` \| `private_lobby` \| `coop_bot` \| `ranked` \| `server_test` \| `tutorial` \| `hero_labs` (comma-separated). Default **`ranked,unranked`**. |
| `min_unix_timestamp` / `max_unix_timestamp` | Descriptions say the default is "30 days ago", but the published schema default is a **fixed number (`1788566400` = 2026-09-05)**, captured when the spec was generated. **Always pass explicit timestamps.** |
| Day rounding (verified 2026-10-07) | `hero-stats` and `item-stats` round both bounds to whole UTC days: a start anywhere in a day includes that whole day, and an end at the next day's 00:00 (or after ~23:00) includes the **whole next day**. A window of whole days must end mid-day on its last day (`throughDay()` in `lib/deadlock/endpoints.ts`). `hero-counter-stats` filters by the exact timestamp (half a day returns about half the matches). |
| `min_average_badge` / `max_average_badge` | Badge encoding below. Filters by match average badge. |
| `min_duration_s` / `max_duration_s` | up to 7,000 s |
| `min_networth` / `max_networth` | player final net worth |
| `min_match_id` / `max_match_id` | |
| `account_id` / `account_ids` | restrict to players |
| `include_item_ids` / `exclude_item_ids`, `ability_order_prefix`, `ability_unlock_order_prefix` | build-path filters |
| `min_matches` | many endpoints default to **20**. We set our own (≥ 100 for matchup cells). |

Array parameters are comma-separated in the query string.

### Badge / rank encoding (verified)

- `badge = tier * 10 + subrank`. Subranks I–VI are 1–6.
  - Live example: `badge 106` → `rank 10` (Ascendant), `subrank 6`.
- Tiers from `/v1/assets/ranks`: 0 Obscurus, 1 Initiate, 2 Seeker, 3 Acolyte, 4 Sentinel, 5 Mystic, 6 Ritualist, 7 Emissary, 8 Oracle, 9 Phantom, 10 Ascendant, 11 Eternus.
- `badge = 0` means **no rank reported** (Obscurus / unranked, or still in placement). Display as "Unranked", not as a low rank.
- Eternus subranks are daily percentile cuts recomputed by Valve.

### Hero and item ids (verified)
- 39 active heroes (`only_active=true`), with ids such as `1` Infernus (`hero_inferno`), `2` Seven (`hero_gigawatt`), `3` Vindicta (`hero_hornet`).
- Item ids are large unsigned 32-bit integers (e.g. `1548066885` Extended Magazine). They need **bigint** in Postgres.
- `account_id` is SteamID3, unsigned 32-bit (bigint in Postgres). `match_id` is unsigned 64-bit.

---

## 4. Dataset catalog

Legend:
- **Cache** is the Next data cache TTL.
- **PG** means stored in Postgres.
- **Direct** means a page may call it on demand (on a cache miss).
- **Job only** means only scheduled jobs call it.

### 4.1 Heroes

| | |
|---|---|
| Source | `GET /v1/assets/heroes` (`language`, `client_version`, `only_active`); `GET /v1/assets/heroes/{hero_id}`; `GET /v1/assets/heroes/by-name/{name}` |
| Fields | `id`, `class_name`, `name`, `player_selectable`, `disabled`, `in_development`, `needs_testing`, `limited_testing`, `complexity`, `hero_type?`, `tags`, `description{lore?, playstyle?, role?}`, `colors{ui, style?, style_hex?}`, `images{icon_hero_card, icon_image_small, minimap_image, background_image, … +_webp}`, `starting_stats{max_health, max_move_speed, weapon_power, …}`, `items` (ability/weapon slot map), `level_info`, `scaling_stats`, `popular_items?{early_game, mid_game, late_game}` |
| Update frequency | Changes with game client versions (assets are parsed from each patch's KV3 files). Defaults to the latest known client version. |
| Cache | 24h, tag `assets` |
| PG | **Yes**: `heroes` (synced daily) |
| Direct | Job only (pages read PG) |
| Limitations | Includes non-playable/in-development heroes unless `only_active=true`. `description.role` is optional, so there's no guaranteed role taxonomy. Image URLs are game art: render only through `components/game-assets`. |
| Rate limit | Not stated in the spec. Treat as low-volume (1 call per daily sync). |

### 4.2 Items

| | |
|---|---|
| Source | `GET /v1/assets/items` (all abilities, weapons, upgrades); `/v1/assets/items/{id_or_class_name}`, `/by-hero-id/{id}`, `/by-slot-type/{slot_type}`, `/by-type/{type}` |
| Fields | `Item` is a union of `Ability` \| `Weapon` \| `Upgrade`. Upgrade fields: `id`, `class_name`, `name`, `type`, `item_slot_type`, `item_tier`, `cost`, `shopable`, `disabled`, `is_active_item`, `component_items`, `upgrades`, `imbue`, `corrupted_info`, `properties`, `tooltip_sections`, `image`/`shop_image` (+webp), `hero`/`heroes` |
| Update frequency | Per client version |
| Cache | 24h, tag `assets` |
| PG | **Yes**: `items` (shop upgrades, from the `reference` job) |
| Direct | Job only |
| Limitations | `shopable: false` items still exist (e.g. removed upgrades) and must be hidden from shop lists. The id space mixes abilities, weapons and upgrades. Corrupted items (build 6712+) reuse the normal item's id. |
| Rate limit | Not stated. One call per daily sync. |

### 4.3 Builds

| | |
|---|---|
| Source | `GET /v1/builds` (search), `GET /v1/builds/{hero_id}/{build_id}` (single), `GET /v1/builds/by-author/{account_id}`, `GET /v1/assets/build-tags` |
| Fields | `Build{hero_build{hero_build_id, origin_build_id, hero_id, author_account_id, name, description?, details, language, version, tags?, publish_timestamp?, last_updated_timestamp?, development_build?}, num_favorites?, num_weekly_favorites?, num_ignores?, num_reports?, rollup_category?}`. Tags: `{id, class_name, label, icon}`. |
| Search params | `hero_id`, `sort_by` (`weekly_favorites` \| `favorites` \| `ignores` \| `reports` \| `updated_at` \| `published_at` \| `version`), `sort_direction`, `only_latest`, `start`, `limit` (default 100), `search_name`, `tag`, `build_language`, `author_id`, timestamp ranges |
| Update frequency | Builds are user-published in game. A single build is "served from our database, otherwise fetched live from the Game Coordinator". |
| Cache | Search 1h. Single build 1h. Build tags 24h. |
| PG | Builds: **yes**, each hero's 20 most-favorited plus their items (`builds`, `build_items`). Build tags: no |
| Direct | Yes (search, single build) |
| Limitations | `force_refetch` hits the Game Coordinator, so we never use it. |
| Rate limit | Search: 100 req/s IP. Single build: **20 req/min IP when fetched from the Game Coordinator** (100/min key); DB hits are not limited. |

### 4.4 Ability orders

| | |
|---|---|
| Source | `GET /v1/analytics/ability-order-stats` (`hero_id` **required**) |
| Fields | `AnalyticsAbilityOrderStats{abilities (ordered ability ids), matches, wins, losses, players, total_kills, total_deaths, total_assists}` |
| Params | common analytics filters + `min_ability_upgrades`, `max_ability_upgrades`, `min_matches` (default 20) |
| Update frequency | Aggregated from ingested matches. The upstream result-cache duration is not stated for this endpoint. |
| Cache | 6h |
| PG | `ability_orders` (daily rolling-window snapshots, `daily` job) |
| Direct | Yes (Hero Detail), with fixed presets |
| Limitations | Ability ids map to `items` of type ability. Many permutations exist, so small samples are common: apply sample tiers. |
| Rate limit | Shared analytics bucket (200/min IP) |

### 4.5 Hero statistics

| | |
|---|---|
| Source | `GET /v1/analytics/hero-stats` |
| Fields | `AnalyticsHeroStats{hero_id, bucket, matches, wins, losses, matches_per_bucket, total_kills, total_deaths, total_assists, total_net_worth, total_last_hits, total_denies, total_player_damage, total_player_damage_taken, total_boss_damage, total_creep_damage, total_neutral_damage, total_max_health, total_shots_hit, total_shots_missed, total_permanent_buffs, permanent_buff_matches, permanent_buff_timing_matches, total_first_permanent_buff_time_s}` |
| Params | common filters + `bucket` (`no_bucket` \| `avg_badge` \| `start_time_hour` \| `start_time_day` \| `start_time_week` \| `start_time_month`), `min/max_hero_matches[_total]` |
| Verified behavior | One call returns **all heroes** (39 rows). There is **no hero filter** — passing `hero_ids` was ignored. With `bucket=start_time_day`, `bucket` is the **unix timestamp of the UTC day start** (e.g. `1791244800`). With `no_bucket`, `bucket` is `0`. |
| Update frequency | Continuous ingest (~106k matches/day). The upstream result-cache duration is not stated for this endpoint. |
| Cache | 6h |
| PG | **Yes**: daily totals per rank band in `hero_stats_snapshots` (`daily` job); Meta falls back to them |
| Direct | Yes (Meta, Heroes, Home) with presets |
| Limitations | Totals only (no per-match distributions); averages are derived. |
| Rate limit | Shared analytics bucket |

**Pick-rate denominator — verified caveat.** For the last 7 days (normal mode):
- Σ `hero-stats.matches` = 5,033,917.
- `/v1/analytics/game-stats.total_matches` = 406,192.

That's 12.39 hero-slots per match, not exactly 12. The two endpoints don't count exactly the same population, so pick rate must use a **self-consistent denominator from hero-stats alone**: `pick_rate = hero.matches / (Σ hero.matches / 12)`. Do not mix it with `game-stats.total_matches`. *(PRODUCT.md's metric table should be updated to match.)*

### 4.6 Hero counters (matchups)

| | |
|---|---|
| Source | `GET /v1/analytics/hero-counter-stats` |
| Fields | `HeroCounterStats{hero_id, enemy_hero_id, matches_played, wins, kills, deaths, assists, networth, last_hits, denies, creeps, obj_damage, enemy_kills, enemy_deaths, enemy_assists, enemy_networth, enemy_last_hits, enemy_denies, enemy_creeps, enemy_obj_damage}` |
| Params | common filters + `same_lane_filter` (**default `true`**), `min_matches` (default 20), `max_matches`, `min/max_enemy_networth` |
| Update frequency | Upstream caches **6h** per parameter combination (stated) |
| Cache | 6h |
| PG | Daily totals in `hero_matchups` (`all` band, any and same lane) |
| Direct | Yes (Hero Detail → Matchups), presets only |
| Limitations | Returns the full matrix (all hero pairs) for the filters; we slice per hero. **The same-lane default changes the meaning**: label the view "Lane opponents" vs "Any opponent" explicitly. |
| Rate limit | Shared analytics bucket |

### 4.7 Hero synergies

| | |
|---|---|
| Source | `GET /v1/analytics/hero-synergy-stats` |
| Fields | `HeroSynergyStats{hero_id1, hero_id2, matches_played, wins, kills1/2, deaths1/2, assists1/2, networth1/2, last_hits1/2, denies1/2, creeps1/2, obj_damage1/2}` |
| Params | as counters; `same_lane_filter` default **`true`** (pairs who shared a lane) |
| Update frequency | Upstream caches 6h |
| Cache | 6h |
| PG | Daily totals in `hero_synergies` (`all` band) |
| Direct | Yes (Hero Detail), presets only |
| Limitations | Pair order is not guaranteed, so normalize to `(min_id, max_id)`. Same-lane default as above. |
| Rate limit | Shared analytics bucket |

### 4.8 Hero combinations

| | |
|---|---|
| Source | `GET /v1/analytics/hero-comb-stats` |
| Fields | `HeroCombStats{hero_ids, matches, wins, losses}` |
| Params | `comb_size` (default **6** = whole team), `include_hero_ids`, `exclude_hero_ids`, `include_enemy_hero_ids`, `exclude_enemy_hero_ids`, `min_matches` (default 20) |
| Update frequency | Upstream caches 6h |
| Cache | 6h |
| PG | No (post-MVP: snapshot only) |
| Direct | Post-MVP (Draft Lab) |
| Limitations | Full-team combinations are very sparse; most combos are tiny samples. Use with smaller `comb_size` and strict sample gates. |
| Rate limit | Shared analytics bucket |

### 4.9 Lane matchups and lane soul curve — **Subject to change**

| | |
|---|---|
| Source | `GET /v1/analytics/lane-matchup-stats`, `GET /v1/analytics/lane-soul-curve` |
| Status | The spec says: "**Subject to change:** newly added and not yet stable. Its parameters, response fields and semantics may change or be removed without notice." |
| Fields | Matchup: `LaneMatchupStats{assigned_lane, hero_ids, enemy_hero_ids, matches_played, wins, sample_matches, sample_time_s, net_worth_diff, stats}`. Curve: `LaneSoulCurve{assigned_lane, hero_ids, enemy_hero_ids, matches_played, sample_matches, sample_times_s, net_worth_diff, net_worth_diff_std, stats}` |
| Params | `assigned_lanes`, `hero_ids`, `enemy_hero_ids`, `stats`, `group_by`, `sample_time_s` (default 900) / `min_time_s` (180), `max_time_s`, `min_matches` (20) |
| Semantics | Duo vs duo. Only lanes where both sides had exactly two players count. **Every matchup appears twice** (sides swapped). Win rate covers the whole match; other stats are read at `sample_time_s`. Game samples come every 180 s up to 15 min, then every 300 s. |
| Cache | 6h (upstream caches 6h) |
| PG | No |
| Direct | **Post-MVP only, behind a feature flag** |
| Limitations | Without `hero_ids` + `enemy_hero_ids`, it computes the full matrix ("considerably more expensive"). Always scope it. |
| Rate limit | Shared analytics bucket |

### 4.10 Item statistics

| | |
|---|---|
| Source | `GET /v1/analytics/item-stats`; related: `/v1/analytics/item-permutation-stats`, `/v1/analytics/build-item-stats` |
| Fields | `ItemStats{item_id, bucket, matches, wins, losses, players, avg_buy_time_s, avg_sell_time_s, avg_buy_time_relative, avg_sell_time_relative}`. Permutations: `{item_ids, matches, wins, losses}`. Build items: `{item_id, builds}`. |
| Params | common filters + `hero_id` / `hero_ids`, `bucket` (`no_bucket` \| `hero` \| `team` \| `start_time_*` \| `game_time_min` \| `game_time_normalized_percentage` \| `net_worth_by_1000/2000/3000/5000/10000`), `enemy_hero_ids`, `enemy_hero_ids_all_match`, `same_lane_filter`, `min/max_bought_at_s`, `item_order`, `corrupted_items` (`exclude` \| `include` \| `only`), `min_matches` (20) |
| Update frequency | Upstream caches item-stats and permutations **6h**, build-item-stats **1h** (stated) |
| Cache | 6h (build-item-stats 1h) |
| PG | Not stored |
| Direct | Yes (Hero Detail → Items), presets only |
| Limitations | Raw item win rate is confounded by wealth: players who are ahead buy more items sooner. The item-flow endpoint documents this and offers an adjusted figure (4.11). `include_corrupted_items` is a deprecated alias of `corrupted_items=include`. |
| Rate limit | Shared analytics bucket |

### 4.11 Item flow

| | |
|---|---|
| Source | `GET /v1/analytics/item-flow-stats` |
| Fields | `ItemFlowStats{baseline, summary, nodes[{column, item_id, matches, wins, losses, players, adjusted_win_rate, avg_net_worth_at_buy, total_kills/deaths/assists}], edges[{from_column, from_item_id, to_item_id, matches, wins, losses}], reached_per_column}` |
| Params | `phase_interval_s` (default 600), `phase_count` (4), `hero_ids`, `locked_item_ids`, `locked_columns`, common filters |
| Semantics (from spec) | `adjusted_win_rate` re-weights each item's win rate to the stage's net-worth distribution. The spec says it "is still observational, not a controlled/causal estimate". `reached_per_column` shows survivorship (late columns are long games only). Corrupted items are not counted as purchases. |
| Cache | 6h (upstream caches 6h) |
| PG | No (post-MVP snapshot) |
| Direct | Post-MVP (Items / Advanced) |
| Limitations | Must show the survivorship and observational caveats in the UI. |
| Rate limit | Shared analytics bucket |

### 4.12 Player statistics

| | |
|---|---|
| Sources | `GET /v1/players/hero-stats?account_ids=` (per player per hero); `GET /v1/players/{id}/mate-stats`; `GET /v1/players/{id}/enemy-stats`; `GET /v1/analytics/player-stats/metrics` (population distributions); `GET /v1/analytics/player-performance-curve`; `GET /v1/analytics/scoreboards/players` and `/heroes` |
| Fields | `HeroStats{account_id, hero_id, matches, matches_played, wins, kills, deaths, assists, accuracy, crit_shot_rate, kills_per_min, deaths_per_min, assists_per_min, networth_per_min, damage_per_min, damage_taken_per_min, damage_per_soul, obj_damage_per_min, last_hits_per_min, denies_per_min, creeps_per_min, ending_level, time_played, last_played, mvp_rank_counts, mvp_rated_matches, …}`. Mates: `{mate_id, matches, matches_played, wins}`. Enemies: `{enemy_id, matches, matches_played, wins}`. Metrics: map of metric → `{avg, std, percentile1…99}`. Scoreboard: `PlayerEntry{account_id, rank, value, matches, badge?, badge_progress?}`. |
| Update frequency | From ingested matches. Metrics are cached upstream 6h, the performance curve 12h. |
| Cache | Player endpoints 10 min. Metrics 6h. Curve 12h. |
| PG | Career-wide per-hero totals in `player_hero_stats` (replaced on each profile view; never shown as window stats) |
| Direct | Yes for player hero-stats, mates, enemies (Player Detail). Metrics: post-MVP ("percentile vs population"). |
| Limitations | Coverage depends on which of the player's matches the API ingested; it is not guaranteed complete. Metric quantiles are DDSketch approximations (max relative error 0.01). |
| Rate limit | Player endpoints 100 req/s IP. Metrics, curve and scoreboards use the shared analytics bucket. |

**Not usable — Patreon-only:**
- `/v1/players/{account_id}/account-stats` and `/v1/players/{account_id}/card` are marked "**PATREON ONLY**" and require the player to befriend the API's Steam bot. Limits are 5 req/min IP. Excluded from the product.

### 4.13 Player match history

| | |
|---|---|
| Source | `GET /v1/players/{account_id}/match-history` |
| Fields | `PlayerMatchHistoryEntry{match_id, account_id, hero_id, hero_level, start_time, match_duration_s, game_mode, match_mode, player_team, match_result, player_match_outcome, player_kills, player_deaths, player_assists, net_worth, last_hits, denies, objectives_mask_team0/1, abandoned_time_s?, team_abandoned?, ranked_display_badge?, ranked_delta?, ranked_calibration_match?, ranked_used_demotion_protection?, brawl_*?}` |
| Behavior | If the account is friends with an API bot, Steam and ClickHouse data are combined (up to date, full history). Otherwise **only the stored ClickHouse history** is returned. |
| Cache | 10 min |
| PG | No (opened matches are stored separately) |
| Direct | Yes (Player Detail). **Never `force_refetch`.** |
| Limitations | History may be incomplete for non-bot-friend accounts. `ranked_display_badge` / `ranked_delta` replace the deprecated MMR history. |
| Rate limit | 100 req/s IP. Bot-friend refetch 10/h. `force_refetch` 1/h. |

### 4.14 Rank (current)

| | |
|---|---|
| Source | `GET /v1/players/{account_id}/rank`; batch `GET /v1/players/rank?account_ids=`; images `/v1/players/{account_id}/rank/image`, `/v1/players/rank/image` (average), `/v1/assets/ranks/{tier}/{subrank}/image`; definitions `/v1/assets/ranks`, `/v1/assets/ranked-seasons` |
| Fields | `RankResponse{badge, rank, subrank, last_match?{match_id, start_time, player_rank_initial_display_rank, player_rank_initial_flat_progress?, player_rank_final_flat_progress?, player_rank_desired_progress_change?, player_rank_initial_calibration_games?, player_rank_initial_demotion_protection_games?, player_rank_consumed_demotion_protection?, player_rank_initial_win_streak?}}`. Batch adds `account_id`. |
| Semantics | The rank at the end of the player's **latest ranked match** (entered rank + progress awarded). A subrank spans 1,000 progress points. Unset during placement. Within Eternus, the badge is the one the player entered the match with. |
| Verified | Batch call returned e.g. `{account_id: 338104565, badge: 106, rank: 10, subrank: 6, last_match: {…, player_rank_desired_progress_change: 410, …}}` |
| Cache | 10 min |
| PG | Rank observations in `player_rank_snapshots` (a row only when the rank state changes) |
| Direct | Yes |
| Limitations | Protected accounts are left out of batch results. Rank only changes after ranked matches. Images are binary (PNG/WebP), not URLs, so render them via `RankBadge` only. |
| Rate limit | Single: not stated. **Batch: 20 req/min IP** (100/min key), so batch all 12 match players into one call. |

**Ranked seasons (verified):**
- One season, "Beta Season 1" (`calibration_matches: 8`, `min_wins: 60`, `valid_party_sizes: [1, 2]`).
- Interval 1 has `leaderboard_id: 1001` and ends at unix `1791493200` (2026-10-08 UTC). Interval 2 starts then.
- The leaderboard id changes per interval, so read it from this endpoint and never hardcode it.

### 4.15 Rank distribution

| | |
|---|---|
| Source | `GET /v1/players/rank/distribution`; `GET /v1/analytics/badge-distribution` |
| Fields | `RankDistributionEntry{badge, rank, subrank, players}`. `BadgeDistribution{badge_level, total_matches, unique_players}` |
| Semantics | Counts players by the rank at the end of their latest ranked match in the range. Placement players are excluded. In badge-distribution, `total_matches` counts matches by average badge, and `unique_players` matches the rank distribution. `min_unix_timestamp` is clamped to the first ranked season. |
| Cache | 24h (changes slowly; used for rank-band presets) |
| PG | Last-good snapshot in `data_snapshots` (`daily` job) |
| Direct | Job only (daily) |
| Limitations | Only ranked matches. |
| Rate limit | rank/distribution: **5 req/min IP** (strict). badge-distribution: shared analytics bucket. Prefer `badge-distribution` in the daily job. |

### 4.16 Leaderboards

| | |
|---|---|
| Source | `GET /v1/leaderboard/{region}`, `GET /v1/leaderboard/{region}/{hero_id}` (`leaderboard_id` optional). Regions: `Europe`, `Asia`, `NAmerica`, `SAmerica`, `Oceania`. |
| Fields | `Leaderboard{entries[{account_name?, possible_account_ids?, rank?, top_hero_ids?}]}` |
| Update frequency | "Valve updates the leaderboard once per hour" |
| Verified | Europe returned **1,000 entries**. **392 entries had multiple `possible_account_ids`** (rank 1 had 8), and **27 had none**. `top_hero_ids` can be empty. |
| Cache | 1h |
| PG | Last-good snapshot only. History already exists in the Data Lake (`leaderboard`, `hero_leaderboard`, hourly since 2026-04-03), so we don't duplicate it. |
| Direct | Yes |
| Limitations | Entries are matched by display name. **Link to a player page only when exactly one `possible_account_id` exists.** |
| Rate limit | 100 req/s IP |

### 4.17 Match metadata

| | |
|---|---|
| Source | `GET /v1/matches/{match_id}/metadata` (`disable_steam`, `is_custom`); bulk `GET /v1/matches/metadata` |
| Fields (verified live) | Top level: `match_info`, `hero_build_ids`, `pregame_hero_ids`, `banned_hero_ids`. `match_info`: `match_id`, `start_time`, `duration_s`, `match_outcome`, `winning_team`, `game_mode`, `match_mode`, `average_badge_team0/1`, `objectives`, `objectives_mask_team0/1`, `mid_boss`, `teams`, `team_score`, `damage_matrix`, `match_paths`, `match_pauses`, `players`, `street_brawl_rounds`, `ranked_type`, `rank_interval`, … Player: `account_id`, `player_slot`, `team`, `hero_id`, `kills`, `deaths`, `assists`, `net_worth`, `last_hits`, `denies`, `level`, `assigned_lane`, `items[{game_time_s, item_id, upgrade_id, sold_time_s, flags, imbued_ability_id, upgrade_info}]`, `stats[]` (per-tick, ~51 fields), `death_details`, `ability_stats`, `accolades`, `mvp_rank`, `player_rank_data`, `player_match_outcome`, `power_up_buffs` |
| Bulk params | `include_info` (default true), `include_more_info`, `include_objectives`, `include_mid_boss`, `include_player_info`, `include_player_kda`, `include_player_items`, `include_player_stats`, `include_player_final_stats`, `include_player_death_details`, filters (`min/max_average_badge`, `hero_ids`, `account_ids`, time, mode), `order_by` (`match_id` \| `start_time` \| `average_badge`), `limit` (default 1000), `format` (`json` \| `ndjson`) |
| Update frequency | A match is immutable once complete |
| Cache | ∞ (immutable) |
| PG | **Yes**: `matches` + `match_players`, `match_heroes`, `match_events` (on first open; read first after that) |
| Direct | Yes, single with **`disable_steam=true`** |
| Limitations | `hero_build_id` is the build **selected at game start**, not later changes. The spec states no response schema for the single endpoint, so we parse it with our own zod schema of the fields we use. |
| Rate limit | Single: from cache 100/s, from S3 100/10 s, **from Steam 3/h per IP**. Bulk: **30 req/min IP**. |

### 4.18 Recent matches

| | |
|---|---|
| Source | `GET /v1/matches/recently-fetched` (match ids fetched by the API in the last 10 minutes); for curated lists: bulk `GET /v1/matches/metadata` with `min_average_badge`, `order_by=start_time`, `order_direction=desc`, `limit` |
| Fields | `ClickhouseMatchInfo{match_id, start_time, duration_s, game_mode, match_mode, average_badge?, average_badge_team0?, average_badge_team1?, players[{account_id}]}` |
| Verified | Returned 518 matches. Enums came back as **integers** (`game_mode: 4` = StreetBrawl). `average_badge` can be `null` or `0` for unranked modes. |
| Cache | 10 min |
| PG | No |
| Direct | Yes for the bulk query (`/matches` list); `recently-fetched` is not needed in the MVP |
| Limitations | `recently-fetched` mixes every mode, so filter to `game_mode = 1` (Normal). |
| Rate limit | recently-fetched 100 req/s. Bulk metadata 30 req/min IP. |

### 4.19 Active matches

| | |
|---|---|
| Source | `GET /v1/matches/active` (`account_id`, `account_ids`) |
| Fields | `ActiveMatch{match_id?, lobby_id?, start_time?, duration_s?, game_mode?, match_mode?, region_mode?, match_score?, net_worth_team_0?, net_worth_team_1?, objectives_mask_team0/1?, spectators?, open_spectator_slots?, winning_team?, players[{account_id?, hero_id?, team?, abandoned?}]}` (+ `_parsed` variants) |
| Semantics | "Fetched from the watch tab in game, which is limited to the **top 200 matches**." |
| Cache | 60 s |
| PG | No |
| Direct | Post-MVP (featured live games) |
| Limitations | Only the top 200 watchable matches, not all live games. All fields optional. |
| Rate limit | 100 req/s IP |

### 4.20 Demo queries

| | |
|---|---|
| Source | `POST /v1/matches/demo/query` (body `{match_id, query, format}`) → `{job_id, status}`; `GET /v1/matches/demo/query/{job_id}` → `{status, estimated_wait_seconds?, result_url?, error?, format, match_id}`; `GET /v1/matches/demo/schema` (`match_id` optional); `GET /v1/matches/demo/live/query` (SSE) |
| Semantics | SQL over a match's demo file. Async: download, parse and query takes **~55 s**. The result is a public Parquet or `.ndjson.zst` artifact. Identical submissions are deduplicated. Unknown tables or columns are rejected with 400 against `/demo/schema`. |
| Cache | Result URLs per `(match_id, query)`; PG reference only |
| PG | No (post-MVP: store job → result URL) |
| Direct | **Not in the MVP.** Post-MVP background jobs only, never inside a page request. |
| Limitations | Slow (~55 s). Needs salts, and fetching salts from Steam is rate limited. Joining controllers to pawns has caveats (documented in spec). |
| Rate limit | Demo query: **200 req/h IP**. Live: 20/min with `broadcast_url`, **6/h with `match_id`**. Salts from Steam: 10 req/30 min IP. |

### 4.21 Map data

| | |
|---|---|
| Source | `GET /v1/assets/map` (`client_version`); positional stats: `GET /v1/analytics/kill-death-stats` |
| Fields | `MapData{radius, images{minimap, plain, background?, frame, mid, mid_tunnels?, rat_tunnels?}, objective_positions, zipline_paths[{origin, color, P0/P1/P2_points}], neutral_camps?[{name, kind, icon, position, left_relative, top_relative}], entities?{shops, teleporters, crates, golden_statues, soul_urn_spawns, …}}`. Kill/death: `KillDeathStats{position_x, position_y, killer_team, kills, deaths}` on a **128×128 raster**. |
| Notes | Neutral camps exist from build 6711. `entities` exist only for builds whose assets include the extract. |
| Cache | Map 24h (per client version). Kill-death 6h. |
| PG | Map: raw JSON per client version (post-MVP) |
| Direct | Post-MVP (heatmaps) |
| Limitations | Map images are game assets, subject to the asset kill switch. |
| Rate limit | Map: not stated. Kill-death: shared analytics bucket. |

### 4.22 Patch / version information

| | |
|---|---|
| Sources | `GET /v2/patches` (unified feed); `GET /v1/assets/client-versions`; `GET /v1/patches/big-days` |
| Fields | `/v2/patches`: `FeedItem` = forum `{title, pub_date, link, guid, content, category}` or steam `{title, pub_date, link, guid, content}`, each with `source` (`forum` \| `steam`). client-versions: **a plain array of integers** (ascending). big-days: array of ISO timestamps. |
| Verified | `/v2/patches`: 30 entries, newest `[steam] "Minor Update - 10-05-2026"` (2026-10-05T23:05Z). client-versions: **828** versions, latest `6753`. big-days: 15 dates, **newest 2026-03-11**. The spec says this list is "manually maintained", and it is **stale**. |
| Cache | Patches 1h. Client versions 24h. |
| PG | **Yes**: `patches`, `client_versions` |
| Direct | Job + 1h on demand for patches |
| Limitations | client-versions has **no release dates**, so it can't define time windows on its own. Patch windows come from `/v2/patches` `pub_date`. Do not use `big-days` for window boundaries (stale). The feed contains both news posts and changelogs, so classify by `source` and title. |
| Rate limit | 100 req/s IP |

---

## 5. Summary matrix

| Dataset | Endpoint(s) | Cache | PG | Page calls it? | Limit to respect |
|---|---|---|---|---|---|
| Heroes | `/v1/assets/heroes` | 24h | ✔ `heroes` | No (job) | — |
| Items | `/v1/assets/items` | 24h | ✔ `items` | No (job) | — |
| Builds | `/v1/builds`, `/v1/builds/{hero_id}/{build_id}` | 1h | tags only | ✔ | GC fetch 20/min |
| Ability orders | `/v1/analytics/ability-order-stats` | 6h | snapshot | ✔ presets | analytics 200/min |
| Hero stats | `/v1/analytics/hero-stats` | 6h | ✔ daily + snapshot | ✔ presets | analytics |
| Counters | `/v1/analytics/hero-counter-stats` | 6h | snapshot | ✔ presets | analytics |
| Synergies | `/v1/analytics/hero-synergy-stats` | 6h | snapshot | ✔ presets | analytics |
| Combinations | `/v1/analytics/hero-comb-stats` | 6h | — | post-MVP | analytics |
| Lane matchups | `/v1/analytics/lane-*` (unstable) | 6h | — | post-MVP, flag | analytics |
| Item stats | `/v1/analytics/item-stats` | 6h | snapshot | ✔ presets | analytics |
| Item flow | `/v1/analytics/item-flow-stats` | 6h | — | post-MVP | analytics |
| Player stats | `/v1/players/hero-stats`, mate/enemy | 10 min | — | ✔ | 100/s |
| Match history | `/v1/players/{id}/match-history` | 10 min | — | ✔ | never `force_refetch` |
| Rank | `/v1/players/{id}/rank`, `/v1/players/rank` | 10 min | ✔ `players.badge` | ✔ | batch 20/min |
| Rank distribution | `/v1/analytics/badge-distribution` | 24h | snapshot | No (job) | analytics |
| Leaderboard | `/v1/leaderboard/{region}[/{hero_id}]` | 1h | snapshot | ✔ | 100/s |
| Match metadata | `/v1/matches/{id}/metadata?disable_steam=true` | ∞ | ✔ `matches` | ✔ | Steam 3/h |
| Recent matches | `/v1/matches/metadata` (bulk) | 10 min | — | ✔ | 30/min |
| Active matches | `/v1/matches/active` | 60 s | — | post-MVP | 100/s |
| Demo queries | `/v1/matches/demo/*` | — | — | post-MVP jobs | 200/h |
| Map | `/v1/assets/map`, kill-death-stats | 24h / 6h | post-MVP | post-MVP | — / analytics |
| Patches/versions | `/v2/patches`, `/v1/assets/client-versions` | 1h / 24h | ✔ | job + on demand | 100/s |

---

## 6. Deprecated endpoints and replacements

All of these are marked `deprecated` in the spec. The replacement column quotes or paraphrases the spec's own deprecation note.

| Deprecated | Spec note | Use instead |
|---|---|---|
| `GET /v1/players/mmr` | "The MMR estimate is gone… Use `/v1/players/rank?account_ids=...`" | `/v1/players/rank` |
| `GET /v1/players/mmr/{hero_id}` | Batch hero MMR (deprecated) | No per-hero rank exists. Use `/v1/players/hero-stats` for per-hero performance. |
| `GET /v1/players/mmr/distribution` | "Use `/v1/players/rank/distribution` instead." | `/v1/players/rank/distribution` or `/v1/analytics/badge-distribution` |
| `GET /v1/players/mmr/distribution/{hero_id}` | Hero MMR distribution (deprecated) | No direct replacement |
| `GET /v1/players/{account_id}/mmr-history` | "Use the `ranked_display_badge` and `ranked_delta` fields of `/v1/players/{account_id}/match-history`" | match-history fields |
| `GET /v1/players/{account_id}/mmr-history/{hero_id}` | Hero MMR history (deprecated) | No direct replacement |
| `GET /v1/players/{account_id}/rank-predict` | "Deprecated alias of `/v1/players/{account_id}/rank`" | `/v1/players/{account_id}/rank` |
| `GET /v1/players/{account_id}/rank-predict/image` | Deprecated | `/v1/players/{account_id}/rank/image` |
| `GET /v1/players/rank-predict/image` | Deprecated | `/v1/players/rank/image` |
| `GET /v1/patches` | "Use `/v2/patches` instead" | `/v2/patches` |
| `GET /v1/sql`, `/v1/sql/tables`, `/v1/sql/tables/{table}/schema` | "Direct SQL access will be removed. Use the public data lake at https://data.deadlock-api.com … or the MCP server at `/v1/mcp`" | Data Lake / MCP (research), typed REST (app) |
| `GET /v1/assets/loot-tables` | "the game dropped `loot_tables.vdata` in build 6711; … returns 404" | None |

Also deprecated as **parameters**: `include_corrupted_items` → use `corrupted_items=include`.

`npm run api:verify` fails on any call to a deprecated or MMR path (there is no CI yet, so run it after touching an endpoint).

---

## 7. Client integration rules

`src/lib/deadlock/client.ts`, server-only (`import 'server-only'`). **Implemented:**

- Base URL `https://api.deadlock-api.com` (test-only override `DEADLOCK_API_BASE_URL`). `User-Agent: deadlockprohunger`.
- Optional `X-API-KEY` header from the server env `DEADLOCK_API_KEY`. Never the query param, never a `NEXT_PUBLIC_` variable; no client component can import the client (`server-only` makes that a build error).
- Timeout 10 s default (per-call `timeoutMs`: 15 s for heavy analytics, 20 s for match history, 2.5 s for interactive search).
- Retry: **one** retry on network errors and on 429/502/503/504, honoring `Retry-After` (capped at 3 s). Timeouts are **not** retried (a second full wait doubled the time to an answer, [QA § 11](./QA.md)). Interactive lookups pass `retry: false`.
- zod validation of the fields we use (extra fields allowed). A mismatch throws "Unexpected response shape", classified as `invalid`.
- Cache: Next data cache per call (`revalidate`, `tags`). Responses over the 2 MB fetch-cache entry limit are cached as zod projections with `unstable_cache` (shop items, match detail, match history).
- Explicit `min_unix_timestamp` / `max_unix_timestamp`, rounded (hour for analytics, minute for match lists) so identical presets share cache keys. Arrays are comma-joined.
- Errors: `DeadlockApiError` (`lib/deadlock/apiError.ts`) → `classifyError` (`lib/deadlock/errors.ts`) → `rate-limit | timeout | invalid | not-found | unavailable`. Loaders that return `{ ok: false }` carry the kind across the boundary (`DataError`).
- Never `force_refetch`; always `disable_steam=true` on match metadata (including the user-facing raw-JSON link).

**Partial:** a Postgres fallback exists for Match Detail (stored match first), Meta (daily history) and Leaderboard (regional snapshot); see [DATA_MODEL](./DATA_MODEL.md#how-pages-use-the-database-as-built). **Implemented (rate limiting):** cache first (`unstable_cache` keyed on URL + schema, holding the parsed projection) → on a miss only, a per-class token bucket (`lib/deadlock/budget.ts`: analytics 160/min, 320 with a key; batch ranks 16/min; bulk match metadata 24/min; others 80/s; 80% of the spec's per-IP limits, in memory per instance) → API → cache. A request that would wait longer than half its timeout (max 3 s) fails as a 429 (`rate-limit`) instead of queuing; concurrent misses for one key share a request. **Planned:** fallbacks for the other pages, and `openapi-typescript` generated types. **Blocked:** every Postgres fallback is inactive in production until a database is deployed. `npm run api:verify` is the drift check.

## 8. Failure handling (as built)

Every page section renders one of these states; none fills a gap with placeholder or estimated numbers.

| State | When | What the user sees |
|---|---|---|
| Loading | Section streaming (Suspense) | Skeleton matching the final layout, with a screen-reader label |
| Empty | Valid answer with nothing to show (e.g. no hero moved beyond normal variation) | Explains why it's empty |
| Rate limit | 429 after the retry | "Rate limited … fills in again within a few minutes" |
| Timeout / unavailable | No answer, network error or 5xx | "Data source is slow" / "Data unavailable", with a retry where useful |
| Invalid | zod mismatch | "Unexpected data … isn't shown rather than risk showing it wrong" |
| Stale | A cached section is older than its freshness budget (revalidation keeps failing, so Next keeps serving the last good value) | "Updated N ago" plus a **Stale** badge |
| Unknown patch | Patch feed fails, or no changelog title parses as a date | "Patch unknown"; "current patch" windows fall back to the last 7 days |
| Not found | 4xx for an id (match not processed yet, private player) | Page-specific "not available yet" message |

Failures are isolated per section (Home: summary, patch, pulse, heroes, builds, matches each load and fail on their own). Verified by building Home against a fake API answering 429 (all data sections showed "rate limited", the patch card "Patch unknown") and against a refused connection ("data unavailable"); in both cases the page built and its static content rendered.

## 9. Production data sources (as built)

Every external call goes **UI → server loader (`features/*/loaders.ts`) → cache → `lib/deadlock` client → Deadlock API**. The browser never calls the API itself; the only exception is the user-clicked raw-JSON citation link on match pages.

### Cache classes

| Class | Lifetime | Why |
|---|---|---|
| Static reference (heroes, ranks, items, Steam names) | 24 h | Changes only with game updates |
| Patch feed | 1 h | New changelog posts are infrequent; dates come from the titles |
| Analytics (hero, item, ability and build stats; counters; synergies) | 6 h | Matches the upstream analytics cache |
| Rank distribution | 24 h | Slow-moving; 5 req/min upstream |
| Leaderboards, batch ranks, rank scoreboard | 1 h | Valve updates leaderboards hourly |
| Builds | 1 h listing; 10 min name search | Favorites move daily |
| Recent match lists | 2 min (list), 10 min (hero matches) | Freshness matters; bulk metadata is 30 req/min |
| Active (live) matches | 1 min | The watch tab refreshes about once a minute |
| Player data (rank, history, hero stats, mates, enemies) | 10 min | Per player; keeps repeat views cheap |
| Player search | 5 min | Per query |
| Match detail | 24 h (projection) | Completed matches don't change |
| Home sections | meta 1 h, builds 1 h, matches 10 min, patch 1 h (`unstable_cache` storing the computed-at time) | "Stale" after 12 h / 3 h / 1 h / 6 h |

Per request, loaders are wrapped in React `cache` (and `fetch` is memoized), so components that share data cause one upstream call. Client components never call the API; the search palette debounces, cancels and memoizes its own `/api/search` per query, so re-renders never refetch.

### Endpoints

From `npm run api:verify -- --md` (limits are the spec's per-IP values), annotated.

| Endpoint | Spec IP limit | Cache | Used by | Notes |
|---|---|---|---|---|
| `/v1/assets/heroes` | — | 24 h | every page | `only_active=true` |
| `/v1/assets/ranks` | — | 24 h | rank labels, rank badges | tiers 0–11; `images.large_webp` (assets CDN) for the tier badge. Per-subrank images are rendered on demand by api.deadlock-api.com, so they aren't used (the browser would call the API directly); the subrank is text |
| `/v1/assets/items/by-hero-id/{id}` | — | 24 h | Hero abilities | |
| `/v1/assets/items/by-type/{type}` | — | 24 h projection | items, builds, search | `upgrade`; ~2 MB raw |
| `/v2/patches` | 100/s | 1 h | patch windows, Home | dates from forum titles; `content` is only a short link-preview excerpt |
| `/v1/analytics/hero-stats` | 200/min | 6 h | Meta, Heroes, Hero, Home, Draft | by day / badge / duration / totals |
| `/v1/analytics/hero-counter-stats` | 200/min | 6 h | Hero, Compare, Draft | `same_lane_filter`, `min_matches=100` |
| `/v1/analytics/hero-synergy-stats` | 200/min | 6 h | Hero, Compare, Draft | `min_matches=100` |
| `/v1/analytics/item-stats` | 200/min | 6 h | Hero items, Builds | |
| `/v1/analytics/ability-order-stats` | 200/min | 6 h | Hero abilities, Builds | |
| `/v1/analytics/hero-build-stats/{hero_id}` | 200/min | 6 h | Builds, Compare, Home | no `game_mode` filter upstream |
| `/v1/analytics/item-flow-stats` | 200/min | 6 h | Build detail | `min_matches=500` (2 MB limit) |
| `/v1/analytics/badge-distribution` | 200/min | 24 h | Meta rank shares | |
| `/v1/analytics/hero-ban-stats` | 200/min | 6 h | Home hero performance (Bans tab) | counts only, from matches whose bans were read from the demo; no match total, so shown as share of recorded bans, never a ban rate; no `game_mode` param |
| `/v1/info` | — | 1 h | Home stats strip | `fetched_matches_per_day`, `table_sizes.steam_profiles.rows`: facts about the source, labelled as such |
| `/v1/analytics/scoreboards/players` | 200/min | 1 h (rank) / 6 h | Leaderboard | global ranked and performance views |
| `/v1/builds` | 100/s | 1 h / 10 min | Builds, Home, search | `only_latest=true`, `sort_by=weekly_favorites`, `search_name` |
| `/v1/leaderboard/{region}` and `/{region}/{hero_id}` | 100/s | 1 h | Leaderboard | linked only when `possible_account_ids` has exactly one id |
| `/v1/players/rank` | 20/min | 1 h | Leaderboard, build authors | **current rank**, batch |
| `/v1/players/{account_id}/rank` | — | 10 min | Profile | **current rank**, single |
| `/v1/players/{account_id}/match-history` | 100/s | 10 min projection | Profile, Compare | never `force_refetch` |
| `/v1/players/hero-stats` | 100/s | 10 min | Profile | |
| `/v1/players/{account_id}/mate-stats`, `enemy-stats` | 100/s | 10 min | Profile, Compare | `min_matches_played` |
| `/v1/players/steam` | 100/s | 24 h | names everywhere | public fields only |
| `/v1/players/steam-search` | 100/s | 5 min | Players, Matches, search | 2.5 s budget in search |
| `/v1/matches/metadata` | 30/min | 2–10 min | Matches, Home, Hero matches | `include_player_kda`, never `include_player_info` |
| `/v1/matches/{match_id}/metadata` | cache 100/s · S3 100/10s · Steam 3/h | 24 h projection | Match detail | `disable_steam=true` |
| `/v1/matches/active` | 100/s | 1 min | Matches live strip | |

Not used: every endpoint marked deprecated in the spec (§6), including all MMR endpoints. Rank data comes only from the current rank endpoints above.

## 10. Open items

- **Unverified:** whether `https://data.deadlock-api.com` (DuckLake) is suitable for scheduled jobs (auth, egress, stability). Evaluate before any post-MVP feature that needs raw `match_player` aggregates.
- **Unverified:** the rate limits for `/v1/assets/*` and the single-player `/v1/players/{id}/rank` (none are published in the spec).
- Re-check the pick-rate denominator finding (§4.5) once `hero_stats_snapshots` has production data; record the observed ratio over time.
