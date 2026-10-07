import { sql } from 'drizzle-orm'
import { bigint, bigserial, boolean, check, date, index, integer, jsonb, pgTable, primaryKey, smallint, text, timestamp, unique } from 'drizzle-orm/pg-core'

/*
 * Deadlockprohunger database (docs/DATA_MODEL.md).
 *
 * A cache and history store, NOT a mirror of the Deadlock API. A table exists only when it gives
 * something the live API can't: our own history (trends beyond upstream windows), fast lookups
 * across data we've already seen (search, "recent matches with hero X"), immutable data we never
 * want to refetch (finished matches), or a last-good fallback when upstream is down.
 *
 * Conventions: snake_case; upstream ids as primary keys; ids that can exceed 2^31 are bigint
 * (item ids, account ids, match ids); timestamps are timestamptz; statistics are stored as TOTALS
 * (wins, matches, sums) so any window can be re-aggregated exactly. Private Steam fields
 * (real name, country, friends) are never stored.
 *
 * Scope: every historical analytics record carries its time (a UTC day, an instant, or an explicit
 * window) AND `patch_guid`, the forum patch in effect then. repo.ts assigns the patch on every write
 * and re-assigns it when the patch list changes, so writers can't omit or stale it.
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })
const id64 = (name: string) => bigint(name, { mode: 'number' })

/** Rank bands are our presets (lib/analytics/rankBands.ts). */
const RANK_BAND_CHECK = (col: string) => sql.raw(`${col} in ('all','low','mid','high','top')`)

/**
 * The patch in effect for a record: the newest patch dated on or before its UTC day (patch windows are
 * day-aligned, as in features/meta/scope.ts). Null only when no stored patch covers it.
 */
const patchGuid = () => text('patch_guid').references(() => patches.guid, { onDelete: 'set null' })

// ── Reference ────────────────────────────────────────────────────────

/** Heroes (synced daily). Only fields pages use; art URLs are data identifiers for game-assets. */
export const heroes = pgTable('heroes', {
  heroId: smallint('hero_id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  className: text('class_name').notNull(),
  heroType: text('hero_type'),
  complexity: smallint('complexity'),
  iconUrl: text('icon_url'),
  cardUrl: text('card_url'),
  isActive: boolean('is_active').notNull().default(true),
  syncedAt: ts('synced_at').notNull().defaultNow(),
})

/** Shop upgrades and abilities referenced by builds and ability orders. */
export const items = pgTable(
  'items',
  {
    itemId: id64('item_id').primaryKey(),
    className: text('class_name'),
    name: text('name'),
    type: text('type').notNull(), // 'upgrade' | 'ability' | 'weapon'
    slot: text('slot'),
    tier: smallint('tier'),
    cost: integer('cost'),
    shopable: boolean('shopable').notNull().default(false),
    heroId: smallint('hero_id').references(() => heroes.heroId), // abilities only
    iconUrl: text('icon_url'),
    syncedAt: ts('synced_at').notNull().defaultNow(),
  },
  (t) => [index('items_type_shopable_idx').on(t.type, t.shopable), index('items_name_lower_idx').on(sql`lower(${t.name})`)],
)

/** Forum changelog posts. `effective_at` is the date from the title (pub_date is unreliable). */
export const patches = pgTable(
  'patches',
  {
    guid: text('guid').primaryKey(),
    source: text('source').notNull(),
    title: text('title').notNull(),
    link: text('link'),
    effectiveAt: ts('effective_at').notNull(),
    postedAt: ts('posted_at'),
    /** The feed's short link-preview text (not the notes), kept for display and search. */
    excerpt: text('excerpt'),
    syncedAt: ts('synced_at').notNull().defaultNow(),
  },
  (t) => [index('patches_effective_idx').on(t.effectiveAt.desc())],
)

// ── Builds ───────────────────────────────────────────────────────────

/**
 * Builds we show: each hero's most-favorited builds (daily sync) plus any build a user opens.
 * Stored for build search ("builds using item X") and favorites history; not every upstream build.
 */
export const builds = pgTable(
  'builds',
  {
    buildId: id64('build_id').primaryKey(),
    version: integer('version').notNull(),
    heroId: smallint('hero_id').notNull().references(() => heroes.heroId),
    name: text('name').notNull(),
    authorAccountId: id64('author_account_id'),
    language: integer('language'),
    tags: integer('tags').array(),
    weeklyFavorites: integer('weekly_favorites'),
    favorites: integer('favorites'),
    publishedAt: ts('published_at'),
    updatedAt: ts('updated_at'),
    syncedAt: ts('synced_at').notNull().defaultNow(),
  },
  (t) => [
    index('builds_hero_favorites_idx').on(t.heroId, t.weeklyFavorites.desc()),
    index('builds_name_lower_idx').on(sql`lower(${t.name})`),
  ],
)

/** One row per item slot in a build's layout; the item index makes "builds using X" a lookup. */
export const buildItems = pgTable(
  'build_items',
  {
    buildId: id64('build_id').notNull().references(() => builds.buildId, { onDelete: 'cascade' }),
    categoryIndex: smallint('category_index').notNull(),
    position: smallint('position').notNull(),
    itemId: id64('item_id').notNull(),
    categoryName: text('category_name'),
  },
  (t) => [primaryKey({ columns: [t.buildId, t.categoryIndex, t.position] }), index('build_items_item_idx').on(t.itemId)],
)

// ── Hero analytics history (daily totals) ────────────────────────────

/**
 * HeroStatsSnapshot: per UTC day × hero × rank band, as totals. Sum days for any window;
 * pick rate = hero matches ÷ (Σ matches ÷ 12) over the same rows. The last 3 days are re-synced
 * because upstream keeps ingesting late matches.
 */
export const heroStatsSnapshots = pgTable(
  'hero_stats_snapshots',
  {
    day: date('day', { mode: 'string' }).notNull(),
    heroId: smallint('hero_id').notNull().references(() => heroes.heroId),
    rankBand: text('rank_band').notNull(),
    gameMode: text('game_mode').notNull().default('normal'),
    matchMode: text('match_mode').notNull().default('ranked,unranked'),
    matches: integer('matches').notNull(),
    wins: integer('wins').notNull(),
    losses: integer('losses').notNull(),
    kills: id64('kills').notNull(),
    deaths: id64('deaths').notNull(),
    assists: id64('assists').notNull(),
    netWorth: id64('net_worth').notNull(),
    playerDamage: id64('player_damage'),
    damageTaken: id64('damage_taken'),
    objectiveDamage: id64('objective_damage'),
    patchGuid: patchGuid(),
    syncedAt: ts('synced_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.day, t.heroId, t.rankBand, t.gameMode, t.matchMode] }),
    index('hero_stats_hero_day_idx').on(t.heroId, t.rankBand, t.day.desc()),
    check('hero_stats_band_chk', RANK_BAND_CHECK('rank_band')),
    check('hero_stats_wins_chk', sql`${t.wins} <= ${t.matches}`),
  ],
)

/** HeroMatchup: daily totals of hero vs enemy (any lane or same lane). Additive across days. */
export const heroMatchups = pgTable(
  'hero_matchups',
  {
    day: date('day', { mode: 'string' }).notNull(),
    heroId: smallint('hero_id').notNull(),
    enemyHeroId: smallint('enemy_hero_id').notNull(),
    rankBand: text('rank_band').notNull(),
    sameLane: boolean('same_lane').notNull(),
    matches: integer('matches').notNull(),
    wins: integer('wins').notNull(),
    patchGuid: patchGuid(),
    syncedAt: ts('synced_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.day, t.heroId, t.enemyHeroId, t.rankBand, t.sameLane] }),
    index('hero_matchups_pair_idx').on(t.heroId, t.enemyHeroId, t.day.desc()),
    check('hero_matchups_band_chk', RANK_BAND_CHECK('rank_band')),
  ],
)

/** HeroSynergy: daily totals for two heroes on the same team, stored once per pair (id1 < id2). */
export const heroSynergies = pgTable(
  'hero_synergies',
  {
    day: date('day', { mode: 'string' }).notNull(),
    heroId1: smallint('hero_id_1').notNull(),
    heroId2: smallint('hero_id_2').notNull(),
    rankBand: text('rank_band').notNull(),
    matches: integer('matches').notNull(),
    wins: integer('wins').notNull(),
    patchGuid: patchGuid(),
    syncedAt: ts('synced_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.day, t.heroId1, t.heroId2, t.rankBand] }),
    check('hero_synergies_order_chk', sql`${t.heroId1} < ${t.heroId2}`),
    check('hero_synergies_band_chk', RANK_BAND_CHECK('rank_band')),
  ],
)

/**
 * AbilityOrder: the most-played ability upgrade sequences per hero, captured daily over a rolling
 * window (window_start..window_end). Not additive across snapshots; compare snapshots instead.
 * The job starts the window no earlier than the current patch; `patch_guid` is null if a window
 * still spans two patches (e.g. a patch dated later), so a mixed window is never labeled one patch.
 */
export const abilityOrders = pgTable(
  'ability_orders',
  {
    snapshotDay: date('snapshot_day', { mode: 'string' }).notNull(),
    heroId: smallint('hero_id').notNull().references(() => heroes.heroId),
    rankBand: text('rank_band').notNull(),
    /** Stable key of the sequence (ids joined by '-'); the sequence itself is `abilities`. */
    sequenceKey: text('sequence_key').notNull(),
    abilities: bigint('abilities', { mode: 'number' }).array().notNull(),
    matches: integer('matches').notNull(),
    wins: integer('wins').notNull(),
    windowStart: ts('window_start').notNull(),
    windowEnd: ts('window_end').notNull(),
    patchGuid: patchGuid(),
  },
  (t) => [
    primaryKey({ columns: [t.snapshotDay, t.heroId, t.rankBand, t.sequenceKey] }),
    check('ability_orders_band_chk', RANK_BAND_CHECK('rank_band')),
    check('ability_orders_window_chk', sql`${t.windowStart} <= ${t.windowEnd}`),
  ],
)

// ── Players (public data only) ───────────────────────────────────────

/** Players we've seen (profile views, leaderboards, stored matches). Public Steam fields only. */
export const players = pgTable(
  'players',
  {
    accountId: id64('account_id').primaryKey(),
    personaName: text('persona_name'),
    avatarUrl: text('avatar_url'),
    firstSeenAt: ts('first_seen_at').notNull().defaultNow(),
    profileFetchedAt: ts('profile_fetched_at'),
  },
  (t) => [index('players_name_lower_idx').on(sql`lower(${t.personaName})`)],
)

/**
 * PlayerRankSnapshot: append-only rank observations. A row is written only when the observed rank
 * state changes (new badge or a new latest ranked match), so repeat views add nothing.
 */
export const playerRankSnapshots = pgTable(
  'player_rank_snapshots',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    accountId: id64('account_id').notNull().references(() => players.accountId, { onDelete: 'cascade' }),
    observedAt: ts('observed_at').notNull().defaultNow(),
    badge: smallint('badge').notNull(),
    rankTier: smallint('rank_tier'),
    subrank: smallint('subrank'),
    lastMatchId: id64('last_match_id'),
    lastMatchAt: ts('last_match_at'),
    source: text('source').notNull(), // 'profile' | 'leaderboard' | 'match'
    patchGuid: patchGuid(), // at observed_at
  },
  (t) => [
    index('player_rank_account_idx').on(t.accountId, t.observedAt.desc()),
    // NULLS NOT DISTINCT: an observation without a latest match still dedupes against an identical one.
    unique('player_rank_state_uq').on(t.accountId, t.badge, t.lastMatchId).nullsNotDistinct(),
  ],
)

/**
 * PlayerHeroStats: latest per-hero totals for players we've seen (fast profiles, "top players on X").
 * Not history: each fetch replaces the rows. Scope is career-wide (every tracked match up to
 * fetched_at), so these rows carry no patch and must never be shown as patch or window stats.
 */
export const playerHeroStats = pgTable(
  'player_hero_stats',
  {
    accountId: id64('account_id').notNull().references(() => players.accountId, { onDelete: 'cascade' }),
    heroId: smallint('hero_id').notNull(),
    matches: integer('matches').notNull(),
    wins: integer('wins').notNull(),
    kills: integer('kills').notNull(),
    deaths: integer('deaths').notNull(),
    assists: integer('assists').notNull(),
    lastPlayedAt: ts('last_played_at'),
    fetchedAt: ts('fetched_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.heroId] }), index('player_hero_stats_hero_idx').on(t.heroId, t.matches.desc())],
)

// ── Matches (immutable once finished) ────────────────────────────────

/** Matches stored when first opened. `detail` is the validated projection the match page renders. */
export const matches = pgTable(
  'matches',
  {
    matchId: id64('match_id').primaryKey(),
    startedAt: ts('started_at').notNull(),
    durationS: integer('duration_s').notNull(),
    gameMode: smallint('game_mode').notNull(),
    matchMode: smallint('match_mode').notNull(),
    winningTeam: smallint('winning_team'),
    averageBadgeTeam0: smallint('average_badge_team0'),
    averageBadgeTeam1: smallint('average_badge_team1'),
    notScored: boolean('not_scored'),
    patchGuid: patchGuid(), // at started_at
    detail: jsonb('detail').notNull(),
    fetchedAt: ts('fetched_at').notNull().defaultNow(),
  },
  (t) => [index('matches_started_idx').on(t.startedAt.desc())],
)

/** MatchPlayer: final line per player slot; indexes power "stored matches for this account". */
export const matchPlayers = pgTable(
  'match_players',
  {
    matchId: id64('match_id').notNull().references(() => matches.matchId, { onDelete: 'cascade' }),
    playerSlot: smallint('player_slot').notNull(),
    accountId: id64('account_id').notNull(),
    team: smallint('team').notNull(),
    heroId: smallint('hero_id').notNull(),
    won: boolean('won'),
    lane: smallint('lane'),
    kills: smallint('kills').notNull(),
    deaths: smallint('deaths').notNull(),
    assists: smallint('assists').notNull(),
    netWorth: integer('net_worth').notNull(),
    lastHits: integer('last_hits').notNull(),
    denies: integer('denies').notNull(),
    level: smallint('level').notNull(),
    heroBuildId: id64('hero_build_id'),
    startedAt: ts('started_at').notNull(),
    patchGuid: patchGuid(), // denormalized from the match, like started_at
  },
  (t) => [primaryKey({ columns: [t.matchId, t.playerSlot] }), index('match_players_account_idx').on(t.accountId, t.startedAt.desc())],
)

/**
 * MatchHero: hero involvement per match, picks and bans (and pre-game swaps), with start time
 * denormalized so "recent stored matches with hero X" is one index scan.
 */
export const matchHeroes = pgTable(
  'match_heroes',
  {
    matchId: id64('match_id').notNull().references(() => matches.matchId, { onDelete: 'cascade' }),
    heroId: smallint('hero_id').notNull(),
    kind: text('kind').notNull(), // 'picked' | 'banned' | 'swapped_from'
    team: smallint('team'),
    won: boolean('won'),
    startedAt: ts('started_at').notNull(),
    patchGuid: patchGuid(), // denormalized from the match, like started_at
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.heroId, t.kind] }),
    index('match_heroes_hero_idx').on(t.heroId, t.startedAt.desc()),
    check('match_heroes_kind_chk', sql`${t.kind} in ('picked','banned','swapped_from')`),
  ],
)

/** MatchEvent: kills, objectives destroyed and mid-boss kills, from the match metadata. Scoped by its match (time_s is match time). */
export const matchEvents = pgTable(
  'match_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    matchId: id64('match_id').notNull().references(() => matches.matchId, { onDelete: 'cascade' }),
    timeS: integer('time_s').notNull(),
    kind: text('kind').notNull(), // 'kill' | 'objective' | 'mid_boss'
    team: smallint('team'), // acting team (killer's team; team that destroyed / claimed)
    actorSlot: smallint('actor_slot'),
    targetSlot: smallint('target_slot'),
    objectiveId: integer('objective_id'),
  },
  (t) => [index('match_events_match_idx').on(t.matchId, t.timeS), check('match_events_kind_chk', sql`${t.kind} in ('kill','objective','mid_boss')`)],
)

// ── Snapshots and operations ─────────────────────────────────────────

/**
 * DataSnapshot: last good parsed response per (endpoint, normalized params), with the scope needed
 * to render it honestly (window, rank range, sample size). The fallback when upstream fails.
 */
export const dataSnapshots = pgTable(
  'data_snapshots',
  {
    key: text('key').primaryKey(), // endpoint + '?' + sorted params
    endpoint: text('endpoint').notNull(),
    params: jsonb('params').notNull(),
    windowStart: ts('window_start'),
    windowEnd: ts('window_end'),
    minBadge: smallint('min_badge'),
    maxBadge: smallint('max_badge'),
    sampleSize: integer('sample_size'),
    patchGuid: patchGuid(), // the window's patch (null if it spans two); fetched_at's for point-in-time payloads
    payload: jsonb('payload').notNull(),
    fetchedAt: ts('fetched_at').notNull().defaultNow(),
  },
  (t) => [index('data_snapshots_fetched_idx').on(t.fetchedAt)],
)

/** One row per job run: what ran, how many upstream requests it used, and how it ended. */
export const syncRuns = pgTable(
  'sync_runs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    job: text('job').notNull(),
    startedAt: ts('started_at').notNull().defaultNow(),
    finishedAt: ts('finished_at'),
    status: text('status').notNull(), // 'running' | 'ok' | 'partial' | 'failed'
    requests: integer('requests').notNull().default(0),
    rows: jsonb('rows'),
    error: text('error'),
  },
  (t) => [index('sync_runs_job_idx').on(t.job, t.startedAt.desc())],
)
