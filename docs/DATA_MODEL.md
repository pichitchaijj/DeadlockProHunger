# Deadlockprohunger — Data Model

Covers **8. Database schema**, **as built** (re-verified 2026-10-07 against `src/lib/db/schema.ts`, `repo.ts`, `store.ts` and `src/lib/jobs/`). PostgreSQL (Neon in production), defined with Drizzle, migrations in `drizzle/` (`0000_init.sql`, `0001_patch_scope.sql`). Every repository function is tested against PGlite, a real Postgres (`tests/unit/db-repo.test.ts`).

The database is a **cache and history store**, not a mirror of the Deadlock API or its Data Lake. A table exists only when it gives something the live API can't:
1. **Our own history:** daily hero totals, matchups, synergies, ability orders and rank observations, so trends can reach beyond upstream windows.
2. **Fast lookups across data we've already seen:** stored builds by item, stored matches by hero or account, players by name.
3. **Immutable data we never want to refetch:** finished matches.
4. **A last-good fallback** for when upstream is down or rate-limited.

**Optional by design.** Without `DATABASE_URL` the site runs on the live API alone. The request-path helpers in `store.ts` treat any database failure as "nothing stored", and write only after the response is sent (`after()`), so the database can never break or slow a page.

**Status:** schema, migrations, repository, request-path helpers and jobs are **Implemented** and tested. Production use is **Blocked** until a Postgres database is deployed and `DATABASE_URL` and `CRON_SECRET` are set (needs the owner's credentials; [QA § 6](./QA.md)). Status labels are defined in [ARCHITECTURE](./ARCHITECTURE.md).

Related: [API](./API.md) · [ARCHITECTURE § Cache](./ARCHITECTURE.md#9-cache-strategy) · [PRODUCT § Analytics](./PRODUCT.md#10-analytics-strategy)

---

## Storage decision per dataset

Datasets as catalogued in [API § 4](./API.md#4-dataset-catalog).

| Dataset | Decision | Table | Status |
|---|---|---|---|
| Heroes | Store (reference, every page) | `heroes` | Implemented |
| Items | Store shop upgrades (reference) | `items` | Implemented |
| Patches | Store (window boundaries; Patch page later) | `patches` | Implemented |
| Builds | Store each hero's top 20 plus their items (search by item, favorites history) | `builds`, `build_items` | Implemented (written; pages don't read them yet) |
| Build tags | Live (24 h cache) | — | Not stored (was planned as a table; not needed so far) |
| Hero statistics | Store daily totals per rank band (our own history) | `hero_stats_snapshots` | Implemented; Meta reads it as a fallback |
| Hero counters / synergies | Store daily totals | `hero_matchups`, `hero_synergies` | Implemented (`all` band only; pages don't read them yet) |
| Ability orders | Store daily rolling-window snapshots | `ability_orders` | Implemented (pages don't read them yet) |
| Item statistics, item flow | Live (6 h cache) | — | Not stored |
| Hero combinations, lane matchups | Post-MVP | — | Planned. Lane endpoints are "Subject to change" upstream |
| Rank (current) | Store observations when the state changes | `player_rank_snapshots` | Implemented (profile views) |
| Rank distribution | Last-good snapshot | `data_snapshots` | Implemented (written daily) |
| Leaderboards | Last-good regional snapshot; history is already in the Data Lake | `data_snapshots` | Implemented; Leaderboard reads it as a fallback |
| Player hero stats | Store career totals (fast profiles, "top players on X") | `player_hero_stats` | Implemented (written; pages don't read them yet) |
| Player match history, mates, enemies | Live (10 min cache) | — | Not stored |
| Match metadata | Store on first open; immutable | `matches` + 3 child tables | Implemented; Match Detail reads it first |
| Recent / active matches | Live (short-lived) | — | Not stored |
| Ranks, ranked seasons, client versions (assets) | Live (24 h cache) | — | Not stored (were planned as tables; not needed so far) |
| Demo queries, map data | Post-MVP | — | Planned |
| Deprecated endpoints (`/v1/patches`, MMR, `/v1/sql`) | Never used | — | Deprecated |

---

## Conventions

- `snake_case` table and column names. Upstream ids are primary keys where naturally unique.
- Only the columns pages use are stored, as typed columns. There are no `raw jsonb` mirrors; the exception is `matches.detail`, the validated projection the match page renders.
- Statistics are stored as **totals** (wins, matches, sums), so any window can be re-aggregated exactly.
- Timestamps are `timestamptz`; upstream unix seconds are converted at the boundary (`mappers.ts`). Days are UTC `date`s.
- Private Steam fields (real name, country, friends) are **never** stored.

### Patch and time scope (required)

Every historical analytics record keeps both its **time** and its **patch**:

| Table | Time scope | `patch_guid` is the patch in effect on… |
|---|---|---|
| `hero_stats_snapshots`, `hero_matchups`, `hero_synergies` | `day` (UTC) | that day |
| `ability_orders` | `window_start`..`window_end` | the whole window (null if it spans two patches) |
| `data_snapshots` | `window_start`..`window_end`, else `fetched_at` | the whole window / the fetch time |
| `player_rank_snapshots` | `observed_at` | the observation day |
| `matches`, `match_players`, `match_heroes` | `started_at` | the match day (`match_events` inherit via `match_id`) |

- A patch's window starts on its UTC day (as in `features/meta/scope.ts`), so a day belongs to exactly one patch. `patch_guid` is null only when no stored patch covers the record, or a window spans two.
- `repo.ts` sets `patch_guid` on every write; callers never pass it. When `upsertPatches` sees a new or re-dated patch, `reassignPatches` re-derives every stored patch from the earliest affected day.
- The daily job starts the ability-order window no earlier than the current patch.
- `player_hero_stats` is not history: it holds career-wide totals replaced on each fetch, so it carries no patch and must never be shown as patch or window stats.

### Id types (verified)

| Id | Upstream type | Postgres | Notes |
|---|---|---|---|
| `hero_id` | UInt8 (Data Lake) | `smallint` | |
| `item_id` | UInt32 | **`bigint`** | Values above 2,147,483,647 exist (e.g. `3535785353`), so `int` overflows |
| `account_id` | UInt32 (SteamID3) | **`bigint`** | Unsigned 32-bit |
| `match_id`, `build_id` | UInt64 / int | `bigint` | |
| `badge` | int | `smallint` | `tier * 10 + subrank`; `0` = no rank |

### Enums

`matches.game_mode` and `match_mode` keep the upstream **integer** values. Mapping raw enums (`KECitadelGameModeNormal`, team ids, badges) to words happens in `features/matches/model.ts`, never in storage, and raw values are never shown. Rank bands are our own strings (`all|low|mid|high|top`), enforced by a check constraint.

---

## Tables (18)

### Reference

| Table | Key | Columns | Filled by |
|---|---|---|---|
| `heroes` | `hero_id` | `slug` (unique), `name`, `class_name`, `hero_type`, `complexity`, `icon_url`, `card_url`, `is_active`, `synced_at` | `reference` job ← `/v1/assets/heroes?only_active=true` |
| `items` | `item_id` | `class_name`, `name`, `type`, `slot`, `tier`, `cost`, `shopable`, `hero_id` (abilities), `icon_url`, `synced_at`. Indexes `(type, shopable)`, `lower(name)` | `reference` job ← shop upgrades (`/v1/assets/items/by-type/upgrade`) |
| `patches` | `guid` | `source`, `title`, `link`, `effective_at` (**date parsed from the title**; `pub_date` is unreliable), `posted_at`, `excerpt` (the feed's short preview, not the notes) | `reference` job ← `/v2/patches` |

Art URLs (`icon_url`, `card_url`) are data identifiers read only through `components/game-assets`.

### Builds

| Table | Key | Columns | Filled by |
|---|---|---|---|
| `builds` | `build_id` | `version`, `hero_id`, `name`, `author_account_id`, `language`, `tags[]`, `weekly_favorites`, `favorites`, `published_at`, `updated_at`. Indexes `(hero_id, weekly_favorites desc)`, `lower(name)` | `builds` job: each hero's 20 most-favorited (`/v1/builds`) |
| `build_items` | `(build_id, category_index, position)` | `item_id` (indexed: "builds using item X"), `category_name` | with its build |

### Hero analytics history (daily totals)

| Table | Key | Columns | Filled by |
|---|---|---|---|
| `hero_stats_snapshots` | `(day, hero_id, rank_band, game_mode, match_mode)` | `matches`, `wins`, `losses`, `kills`, `deaths`, `assists`, `net_worth`, `player_damage`, `damage_taken`, `objective_damage`, `patch_guid`. Checks: rank band, `wins ≤ matches` | `daily` job ← `hero-stats` by day, one request per rank band |
| `hero_matchups` | `(day, hero_id, enemy_hero_id, rank_band, same_lane)` | `matches`, `wins`, `patch_guid` | `daily` ← `hero-counter-stats`, any-lane and same-lane, one-day windows |
| `hero_synergies` | `(day, hero_id_1, hero_id_2, rank_band)` | `matches`, `wins`, `patch_guid`. Check `hero_id_1 < hero_id_2` (one row per pair) | `daily` ← `hero-synergy-stats`, one-day windows |
| `ability_orders` | `(snapshot_day, hero_id, rank_band, sequence_key)` | `abilities[]`, `matches`, `wins`, `window_start`, `window_end`, `patch_guid`. Not additive across snapshots: compare snapshots instead | `daily` ← `ability-order-stats`, rolling 7-day window, never before the current patch |

- **Pick rate from history:** `hero matches ÷ (Σ all heroes' matches ÷ 12)` over the same rows ([API § 4.5](./API.md#45-hero-statistics) explains why `game-stats.total_matches` isn't the denominator).
- **Re-sync rule:** upstream keeps ingesting late matches, so the daily job re-fetches the last 3 days of hero stats and upserts. Matchups and synergies use completed days only, so daily rows add up.
- Only the `all` rank band is stored for matchups, synergies and ability orders so far.

### Players (public data only)

| Table | Key | Columns | Written when |
|---|---|---|---|
| `players` | `account_id` | `persona_name` (index `lower()`), `avatar_url`, `first_seen_at`, `profile_fetched_at` | a profile is viewed (at most once per player every 10 min) |
| `player_rank_snapshots` | `id` | `account_id`, `observed_at`, `badge`, `rank_tier`, `subrank`, `last_match_id`, `last_match_at`, `source` (`profile\|leaderboard\|match`), `patch_guid`. Unique `(account_id, badge, last_match_id)` NULLS NOT DISTINCT: a row only when the rank state changes | profile views (current rank endpoints only) |
| `player_hero_stats` | `(account_id, hero_id)` | `matches`, `wins`, `kills`, `deaths`, `assists`, `last_played_at`, `fetched_at`. Career-wide, replaced on each fetch | profile views |

### Matches (immutable once finished)

| Table | Key | Columns |
|---|---|---|
| `matches` | `match_id` | `started_at`, `duration_s`, `game_mode`, `match_mode`, `winning_team`, `average_badge_team0/1`, `not_scored`, `patch_guid`, **`detail` jsonb** (the validated projection Match Detail renders), `fetched_at` |
| `match_players` | `(match_id, player_slot)` | `account_id`, `team`, `hero_id`, `won`, `lane`, K/D/A, `net_worth`, `last_hits`, `denies`, `level`, `hero_build_id`, `started_at`, `patch_guid`. Index `(account_id, started_at desc)` |
| `match_heroes` | `(match_id, hero_id, kind)` | `kind` = `picked\|banned\|swapped_from`, `team`, `won`, `started_at`, `patch_guid`. Index `(hero_id, started_at desc)` |
| `match_events` | `id` | `match_id`, `time_s`, `kind` = `kill\|objective\|mid_boss`, `team` (acting team), `actor_slot`, `target_slot`, `objective_id` |

Written after a user first opens a match (`storeMatch`); Match Detail reads the database first (`readStoredMatch`), so a stored match costs no upstream call.

### Snapshots and operations

| Table | Key | Columns |
|---|---|---|
| `data_snapshots` | `key` (endpoint + sorted params) | `endpoint`, `params`, `window_start`, `window_end`, `min_badge`, `max_badge`, `sample_size`, `patch_guid`, `payload`, `fetched_at`. The scope columns let a snapshot render with its full context |
| `sync_runs` | `id` | `job`, `started_at`, `finished_at`, `status` (`running\|ok\|partial\|failed`), `requests`, `rows` (per-table counts), `error` |

---

## How pages use the database (as built)

| Page | Read | Write |
|---|---|---|
| Match Detail | Stored match first, then upstream | The match and its players, heroes and events, after the response |
| Meta | Daily history (`heroStatsFromHistory`) as a fallback, labelled `source: 'snapshot'` with its time | — |
| Leaderboard | Regional board snapshot (`readSnapshot`) when upstream fails; hero boards aren't snapshotted | — |
| Player Detail | — | Profile, rank observation, per-hero totals (`storeProfile`) |

**Planned:** snapshot fallbacks for Home, Heroes, Hero Detail and Builds; pages reading `builds`/`build_items` (builds using item X), `match_heroes` (recent stored matches with hero X), matchups/synergies/ability-order history, and `player_rank_snapshots` (rank history).

## Jobs (`/api/cron/{job}`, `vercel.json`, daily)

| Job | Schedule (UTC) | Work | Upstream requests |
|---|---|---|---|
| `reference` | 02:50 | heroes, shop items, patches (then re-assign patches) | 3 |
| `daily` | 03:00 | hero stats per rank band; matchups (any + same lane) and synergies per completed day; ability orders per hero; snapshots of the badge distribution and the 5 regional leaderboards | ≈ 60 for the default 3 days (5 + 9 + ~39 + 1 + 5). `?days=` 1–30 backfills |
| `builds` | 03:30 | each hero's 20 most-favorited builds and their items | 1 per hero (~39) + 1 |
| `prune` | 04:00 | delete snapshots > 30 days, ability orders > 90 days, matchups/synergies > 400 days, runs > 90 days | 0 |

Each job counts its requests, runs at most 4 upstream calls in parallel, continues past a failed unit (`partial`), is idempotent (upserts), and logs one `sync_runs` row.

## Entity overview

```
patches ◄── patch_guid ── (every history and match table)
heroes ──< hero_stats_snapshots, ability_orders, builds ──< build_items
           hero_matchups, hero_synergies            (hero ids, no FK)
items                                               (referenced by build_items.item_id, no FK)
players ──< player_rank_snapshots, player_hero_stats
matches ──< match_players, match_heroes, match_events
data_snapshots, sync_runs
```

## Not stored

- Raw upstream objects, apart from the `matches.detail` projection.
- Player match history, mates and enemies: live with a 10 min cache.
- Leaderboard **history**: already in the Data Lake (hourly). Only the last-good regional snapshot is kept.
- Rank distribution history: only the last-good snapshot.
- Ranks and ranked-season assets: read live with a 24 h cache.
- Data from Patreon-only endpoints, demo files or anything extracted from game files.
- Steam `realname`, `countrycode`, friends lists.
- `/v1/patches/big-days` (manually maintained, stale) and the deprecated `/v1/patches`.
