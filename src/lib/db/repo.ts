/*
 * Repositories. Every function takes a `Db` (production: node-postgres on Neon; tests: PGlite),
 * so this module has no environment access and can be tested against real Postgres.
 * Writes are idempotent upserts; immutable data (finished matches) is insert-once.
 * Every write of a historical record also sets its `patch_guid` (schema.ts § Scope).
 */
import { and, desc, eq, getTableColumns, gte, inArray, lt, lte, sql, type SQL } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT, PgTable } from 'drizzle-orm/pg-core'
import type { matchRows } from './mappers'
import * as s from './schema'

export type Db = PgDatabase<PgQueryResultHKT, typeof s>
type Insert<T extends { $inferInsert: unknown }> = T['$inferInsert']

/** Postgres limits a statement to 65,535 bind parameters; batch wide inserts well below it. */
async function inBatches<T>(rows: T[], size: number, write: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await write(rows.slice(i, i + size))
}

/**
 * `set` for an upsert: each listed column takes the incoming row's value. Keys are the table's TS
 * property names: Drizzle silently ignores any other key, which would leave that column stale.
 */
function excluded<T extends PgTable>(table: T, keys: (keyof T['_']['columns'] & string)[]) {
  const columns = getTableColumns(table)
  return Object.fromEntries(keys.map((k) => [k, sql.raw(`excluded."${columns[k].name}"`)]))
}

// ── Patch scope ──────────────────────────────────────────────────────

const utcDay = (instant: unknown) => sql`(${instant} at time zone 'UTC')::date`

/** The patch in effect on a UTC day: the newest one dated on or before it (patch windows are day-aligned). */
const patchOn = (day: SQL) =>
  sql`(select p.guid from patches p where (p.effective_at at time zone 'UTC')::date <= ${day} order by p.effective_at desc, p.guid desc limit 1)`

/** The single patch covering a whole window; null when the window spans two patches. */
const patchOver = (startDay: SQL, endDay: SQL) => sql`(case when ${patchOn(startDay)} = ${patchOn(endDay)} then ${patchOn(endDay)} end)`

/** Per patch-scoped table: the UTC day a row belongs to (a window's end) and its patch, from the row's own columns. */
const PATCH_SCOPES = (() => {
  const snap = s.dataSnapshots
  const snapEnd = utcDay(sql`coalesce(${snap.windowEnd}, ${snap.fetchedAt})`)
  const byDay = (table: PgTable, day: SQL) => ({ table, day, patch: patchOn(day) })
  return {
    heroStats: byDay(s.heroStatsSnapshots, sql`${s.heroStatsSnapshots.day}`),
    matchups: byDay(s.heroMatchups, sql`${s.heroMatchups.day}`),
    synergies: byDay(s.heroSynergies, sql`${s.heroSynergies.day}`),
    rank: byDay(s.playerRankSnapshots, utcDay(s.playerRankSnapshots.observedAt)),
    matches: byDay(s.matches, utcDay(s.matches.startedAt)),
    matchPlayers: byDay(s.matchPlayers, utcDay(s.matchPlayers.startedAt)),
    matchHeroes: byDay(s.matchHeroes, utcDay(s.matchHeroes.startedAt)),
    abilityOrders: { table: s.abilityOrders, day: utcDay(s.abilityOrders.windowEnd), patch: patchOver(utcDay(s.abilityOrders.windowStart), utcDay(s.abilityOrders.windowEnd)) },
    snapshots: { table: snap, day: snapEnd, patch: patchOver(utcDay(sql`coalesce(${snap.windowStart}, ${snap.windowEnd}, ${snap.fetchedAt})`), snapEnd) },
  } satisfies Record<string, { table: PgTable; day: SQL; patch: SQL }>
})()
type PatchScope = keyof typeof PATCH_SCOPES

/** Sets `patch_guid` from each matching row's own time columns. */
function assignPatch(db: Db, scope: PatchScope, where: SQL) {
  const { table, patch } = PATCH_SCOPES[scope]
  return db.execute(sql`update ${table} set patch_guid = ${patch} where ${where} and patch_guid is distinct from ${patch}`)
}

/** Daily-total rows get their patch in the insert itself, so a wide batch needs no follow-up update. */
const withDayPatch = <T extends { day: string }>(rows: T[]) => rows.map((r) => ({ ...r, patchGuid: patchOn(sql`${r.day}::date`) }))

/**
 * Re-derives every stored patch from a UTC day ('YYYY-MM-DD') on. Runs when the patch list changes:
 * a patch synced after the data it covers, or a re-dated one, must not leave rows on the old patch.
 */
export async function reassignPatches(db: Db, since: string) {
  for (const scope of Object.keys(PATCH_SCOPES) as PatchScope[]) await assignPatch(db, scope, sql`${PATCH_SCOPES[scope].day} >= ${since}::date`)
}

// ── Reference ────────────────────────────────────────────────────────

export async function upsertHeroes(db: Db, rows: Insert<typeof s.heroes>[]) {
  if (!rows.length) return 0
  await db.insert(s.heroes).values(rows).onConflictDoUpdate({
    target: s.heroes.heroId,
    set: excluded(s.heroes, ['slug', 'name', 'className', 'heroType', 'complexity', 'iconUrl', 'cardUrl', 'isActive', 'syncedAt']),
  })
  return rows.length
}

export async function upsertItems(db: Db, rows: Insert<typeof s.items>[]) {
  await inBatches(rows, 500, (batch) =>
    db.insert(s.items).values(batch).onConflictDoUpdate({
      target: s.items.itemId,
      set: excluded(s.items, ['className', 'name', 'type', 'slot', 'tier', 'cost', 'shopable', 'heroId', 'iconUrl', 'syncedAt']),
    }),
  )
  return rows.length
}

/** Upserts patches; when one is new or re-dated, re-derives stored patches from the earliest affected day. */
export async function upsertPatches(db: Db, rows: Insert<typeof s.patches>[]) {
  if (!rows.length) return 0
  const before = new Map((await db.select({ guid: s.patches.guid, at: s.patches.effectiveAt }).from(s.patches)).map((p) => [p.guid, p.at.getTime()]))
  await db.insert(s.patches).values(rows).onConflictDoUpdate({
    target: s.patches.guid,
    set: excluded(s.patches, ['title', 'link', 'effectiveAt', 'postedAt', 'excerpt', 'syncedAt']),
  })
  const affected = rows.flatMap((r) => {
    const old = before.get(r.guid)
    const at = r.effectiveAt.getTime()
    return old === at ? [] : old === undefined ? [at] : [old, at]
  })
  if (affected.length) await reassignPatches(db, new Date(Math.min(...affected)).toISOString().slice(0, 10))
  return rows.length
}

/** The newest patch, or the one in effect on a UTC day ('YYYY-MM-DD'). */
export function latestPatch(db: Db, onDay?: string) {
  return db
    .select()
    .from(s.patches)
    .where(onDay ? sql`(${s.patches.effectiveAt} at time zone 'UTC')::date <= ${onDay}::date` : undefined)
    .orderBy(desc(s.patches.effectiveAt), desc(s.patches.guid))
    .limit(1)
    .then((r) => r[0] ?? null)
}

// ── Hero analytics history ───────────────────────────────────────────

export async function upsertHeroStats(db: Db, rows: Insert<typeof s.heroStatsSnapshots>[]) {
  await inBatches(rows, 400, (batch) =>
    db
      .insert(s.heroStatsSnapshots)
      .values(withDayPatch(batch))
      .onConflictDoUpdate({
        target: [s.heroStatsSnapshots.day, s.heroStatsSnapshots.heroId, s.heroStatsSnapshots.rankBand, s.heroStatsSnapshots.gameMode, s.heroStatsSnapshots.matchMode],
        set: excluded(s.heroStatsSnapshots, ['matches', 'wins', 'losses', 'kills', 'deaths', 'assists', 'netWorth', 'playerDamage', 'damageTaken', 'objectiveDamage', 'patchGuid', 'syncedAt']),
      }),
  )
  return rows.length
}

/**
 * Totals per hero for an inclusive day range, re-aggregated from daily rows. `days` reports how
 * many distinct days are present, so callers can tell a complete window from a gappy one.
 */
export function heroStatsWindow(db: Db, p: { from: string; to: string; rankBand: string }) {
  const t = s.heroStatsSnapshots
  return db
    .select({
      heroId: t.heroId,
      matches: sql<number>`sum(${t.matches})::int`,
      wins: sql<number>`sum(${t.wins})::int`,
      days: sql<number>`count(distinct ${t.day})::int`,
    })
    .from(t)
    .where(and(gte(t.day, p.from), lte(t.day, p.to), eq(t.rankBand, p.rankBand), eq(t.gameMode, 'normal')))
    .groupBy(t.heroId)
}

/** Daily series for one hero (oldest first), for long-range trend charts. */
export function heroDailySeries(db: Db, p: { heroId: number; from: string; to: string; rankBand: string }) {
  const t = s.heroStatsSnapshots
  return db
    .select({ day: t.day, matches: t.matches, wins: t.wins })
    .from(t)
    .where(and(eq(t.heroId, p.heroId), eq(t.rankBand, p.rankBand), eq(t.gameMode, 'normal'), gte(t.day, p.from), lte(t.day, p.to)))
    .orderBy(t.day)
}

export async function upsertMatchups(db: Db, rows: Insert<typeof s.heroMatchups>[]) {
  const t = s.heroMatchups
  await inBatches(rows, 500, (batch) =>
    db.insert(t).values(withDayPatch(batch)).onConflictDoUpdate({ target: [t.day, t.heroId, t.enemyHeroId, t.rankBand, t.sameLane], set: excluded(t, ['matches', 'wins', 'patchGuid', 'syncedAt']) }),
  )
  return rows.length
}

export async function upsertSynergies(db: Db, rows: Insert<typeof s.heroSynergies>[]) {
  const t = s.heroSynergies
  await inBatches(rows, 500, (batch) =>
    db.insert(t).values(withDayPatch(batch)).onConflictDoUpdate({ target: [t.day, t.heroId1, t.heroId2, t.rankBand], set: excluded(t, ['matches', 'wins', 'patchGuid', 'syncedAt']) }),
  )
  return rows.length
}

/** Matchup totals over a day range (additive daily rows). */
export function matchupWindow(db: Db, p: { heroId: number; from: string; to: string; rankBand: string; sameLane: boolean }) {
  const t = s.heroMatchups
  return db
    .select({ enemyHeroId: t.enemyHeroId, matches: sql<number>`sum(${t.matches})::int`, wins: sql<number>`sum(${t.wins})::int` })
    .from(t)
    .where(and(eq(t.heroId, p.heroId), eq(t.rankBand, p.rankBand), eq(t.sameLane, p.sameLane), gte(t.day, p.from), lte(t.day, p.to)))
    .groupBy(t.enemyHeroId)
}

/** Replaces one hero's ability-order snapshot for a day (top sequences change, so old rows go). */
export async function replaceAbilityOrders(db: Db, key: { snapshotDay: string; heroId: number; rankBand: string }, rows: Insert<typeof s.abilityOrders>[]) {
  const t = s.abilityOrders
  const sameKey = and(eq(t.snapshotDay, key.snapshotDay), eq(t.heroId, key.heroId), eq(t.rankBand, key.rankBand))!
  await db.transaction(async (tx) => {
    await tx.delete(t).where(sameKey)
    if (rows.length) await tx.insert(t).values(rows)
    await assignPatch(tx, 'abilityOrders', sameKey)
  })
  return rows.length
}

// ── Builds ───────────────────────────────────────────────────────────

/** Upserts a build and replaces its item layout (a new version can reorder everything). */
export async function upsertBuild(db: Db, data: { build: Insert<typeof s.builds>; items: Insert<typeof s.buildItems>[] }) {
  await db.transaction(async (tx) => {
    await tx.insert(s.builds).values(data.build).onConflictDoUpdate({
      target: s.builds.buildId,
      set: excluded(s.builds, ['version', 'heroId', 'name', 'authorAccountId', 'language', 'tags', 'weeklyFavorites', 'favorites', 'publishedAt', 'updatedAt', 'syncedAt']),
    })
    await tx.delete(s.buildItems).where(eq(s.buildItems.buildId, data.build.buildId))
    if (data.items.length) await tx.insert(s.buildItems).values(data.items)
  })
}

/** Stored builds containing an item, most favorited first. */
export function buildsWithItem(db: Db, itemId: number, limit = 20) {
  return db
    .selectDistinctOn([s.builds.weeklyFavorites, s.builds.buildId], { buildId: s.builds.buildId, heroId: s.builds.heroId, name: s.builds.name, weeklyFavorites: s.builds.weeklyFavorites })
    .from(s.builds)
    .innerJoin(s.buildItems, eq(s.buildItems.buildId, s.builds.buildId))
    .where(eq(s.buildItems.itemId, itemId))
    .orderBy(sql`${s.builds.weeklyFavorites} desc nulls last`, s.builds.buildId)
    .limit(limit)
}

// ── Players ──────────────────────────────────────────────────────────

/** Public profile fields only. A null name/avatar never overwrites a known one. */
export async function upsertPlayers(db: Db, rows: Array<{ accountId: number; personaName?: string | null; avatarUrl?: string | null; profileFetched?: boolean }>) {
  if (!rows.length) return 0
  const now = new Date()
  await db
    .insert(s.players)
    .values(rows.map((r) => ({ accountId: r.accountId, personaName: r.personaName ?? null, avatarUrl: r.avatarUrl ?? null, profileFetchedAt: r.profileFetched ? now : null })))
    .onConflictDoUpdate({
      target: s.players.accountId,
      set: {
        personaName: sql`coalesce(excluded.persona_name, ${s.players.personaName})`,
        avatarUrl: sql`coalesce(excluded.avatar_url, ${s.players.avatarUrl})`,
        profileFetchedAt: sql`coalesce(excluded.profile_fetched_at, ${s.players.profileFetchedAt})`,
      },
    })
  return rows.length
}

/** Records a rank observation unless the same state (badge + latest match) is already stored. Returns true when a row was added. */
export async function recordRank(db: Db, row: Insert<typeof s.playerRankSnapshots>) {
  await upsertPlayers(db, [{ accountId: row.accountId }])
  const inserted = await db.insert(s.playerRankSnapshots).values(row).onConflictDoNothing().returning({ id: s.playerRankSnapshots.id })
  if (inserted.length) await assignPatch(db, 'rank', eq(s.playerRankSnapshots.id, inserted[0].id))
  return inserted.length > 0
}

export function rankHistory(db: Db, accountId: number, limit = 200) {
  const t = s.playerRankSnapshots
  return db.select().from(t).where(eq(t.accountId, accountId)).orderBy(desc(t.observedAt)).limit(limit)
}

/** Replaces a player's per-hero totals with the latest fetch. */
export async function replacePlayerHeroStats(db: Db, accountId: number, rows: Insert<typeof s.playerHeroStats>[]) {
  await upsertPlayers(db, [{ accountId }])
  await db.transaction(async (tx) => {
    await tx.delete(s.playerHeroStats).where(eq(s.playerHeroStats.accountId, accountId))
    if (rows.length) await tx.insert(s.playerHeroStats).values(rows)
  })
  return rows.length
}

/** Players we've seen with the most matches on a hero (within stored data, not all of Deadlock). */
export function topStoredPlayersOnHero(db: Db, heroId: number, minMatches = 20, limit = 20) {
  const t = s.playerHeroStats
  return db
    .select({ accountId: t.accountId, personaName: s.players.personaName, matches: t.matches, wins: t.wins })
    .from(t)
    .innerJoin(s.players, eq(s.players.accountId, t.accountId))
    .where(and(eq(t.heroId, heroId), gte(t.matches, minMatches)))
    .orderBy(desc(t.matches))
    .limit(limit)
}

// ── Matches ──────────────────────────────────────────────────────────

/** Stores a finished match and its players, heroes and events once. Returns false if it was already stored. */
export async function saveMatch(db: Db, rows: ReturnType<typeof matchRows>) {
  return db.transaction(async (tx) => {
    const inserted = await tx.insert(s.matches).values(rows.match).onConflictDoNothing().returning({ id: s.matches.matchId })
    if (inserted.length === 0) return false
    if (rows.players.length) await tx.insert(s.matchPlayers).values(rows.players)
    if (rows.heroes.length) await tx.insert(s.matchHeroes).values(rows.heroes)
    await inBatches(rows.events, 500, (batch) => tx.insert(s.matchEvents).values(batch))
    await assignPatch(tx, 'matches', eq(s.matches.matchId, rows.match.matchId))
    await assignPatch(tx, 'matchPlayers', eq(s.matchPlayers.matchId, rows.match.matchId))
    await assignPatch(tx, 'matchHeroes', eq(s.matchHeroes.matchId, rows.match.matchId))
    return true
  })
}

export function storedMatchDetail(db: Db, matchId: number) {
  return db.select({ detail: s.matches.detail, fetchedAt: s.matches.fetchedAt }).from(s.matches).where(eq(s.matches.matchId, matchId)).then((r) => r[0] ?? null)
}

/** Most recent stored matches where a hero was picked. */
export function recentStoredMatchesWithHero(db: Db, heroId: number, limit = 20) {
  const t = s.matchHeroes
  return db.select({ matchId: t.matchId, startedAt: t.startedAt, team: t.team, won: t.won }).from(t).where(and(eq(t.heroId, heroId), eq(t.kind, 'picked'))).orderBy(desc(t.startedAt)).limit(limit)
}

export function storedMatchesForAccount(db: Db, accountId: number, limit = 50) {
  const t = s.matchPlayers
  return db.select().from(t).where(eq(t.accountId, accountId)).orderBy(desc(t.startedAt)).limit(limit)
}

export function matchEventsFor(db: Db, matchId: number) {
  return db.select().from(s.matchEvents).where(eq(s.matchEvents.matchId, matchId)).orderBy(s.matchEvents.timeS)
}

// ── Snapshots ────────────────────────────────────────────────────────

export async function putSnapshot(db: Db, row: Insert<typeof s.dataSnapshots>) {
  const fetchedAt = row.fetchedAt ?? new Date()
  await db
    .insert(s.dataSnapshots)
    .values({ ...row, fetchedAt })
    .onConflictDoUpdate({
      target: s.dataSnapshots.key,
      set: excluded(s.dataSnapshots, ['endpoint', 'params', 'windowStart', 'windowEnd', 'minBadge', 'maxBadge', 'sampleSize', 'payload', 'fetchedAt']),
    })
  await assignPatch(db, 'snapshots', eq(s.dataSnapshots.key, row.key))
}

export function getSnapshot(db: Db, key: string) {
  return db.select().from(s.dataSnapshots).where(eq(s.dataSnapshots.key, key)).then((r) => r[0] ?? null)
}

// ── Retention and job runs ───────────────────────────────────────────

/**
 * Retention: snapshots untouched for 30 days, ability-order snapshots and job logs after 90 days,
 * matchup/synergy days after 400 days. Hero stats, players, matches and rank history are kept.
 */
export async function prune(db: Db, now = new Date()) {
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)
  const day = (n: number) => daysAgo(n).toISOString().slice(0, 10)
  const counts = {
    snapshots: (await db.delete(s.dataSnapshots).where(lt(s.dataSnapshots.fetchedAt, daysAgo(30))).returning({ k: s.dataSnapshots.key })).length,
    abilityOrders: (await db.delete(s.abilityOrders).where(lt(s.abilityOrders.snapshotDay, day(90))).returning({ k: s.abilityOrders.heroId })).length,
    matchups: (await db.delete(s.heroMatchups).where(lt(s.heroMatchups.day, day(400))).returning({ k: s.heroMatchups.heroId })).length,
    synergies: (await db.delete(s.heroSynergies).where(lt(s.heroSynergies.day, day(400))).returning({ k: s.heroSynergies.heroId1 })).length,
    runs: (await db.delete(s.syncRuns).where(lt(s.syncRuns.startedAt, daysAgo(90))).returning({ k: s.syncRuns.id })).length,
  }
  return counts
}

export async function startRun(db: Db, job: string) {
  const [row] = await db.insert(s.syncRuns).values({ job, status: 'running' }).returning({ id: s.syncRuns.id })
  return row.id
}

export async function finishRun(db: Db, id: number, result: { status: 'ok' | 'partial' | 'failed'; requests: number; rows?: Record<string, number>; error?: string | null }) {
  await db.update(s.syncRuns).set({ status: result.status, finishedAt: new Date(), requests: result.requests, rows: result.rows ?? null, error: result.error ?? null }).where(eq(s.syncRuns.id, id))
}

export function lastRuns(db: Db, jobs: string[], limit = 10) {
  return db.select().from(s.syncRuns).where(inArray(s.syncRuns.job, jobs)).orderBy(desc(s.syncRuns.startedAt)).limit(limit)
}

export function profileFetchedAt(db: Db, accountId: number) {
  return db.select({ at: s.players.profileFetchedAt }).from(s.players).where(eq(s.players.accountId, accountId)).then((r) => r[0]?.at ?? null)
}

/**
 * Daily hero rows for a window, in the API's row shape, plus when they were last synced.
 * Null unless every day in the window is present: a partial window would bias the rates.
 */
export async function heroStatsHistory(db: Db, p: { from: string; to: string; rankBand: string }) {
  const t = s.heroStatsSnapshots
  const rows = await db
    .select()
    .from(t)
    .where(and(gte(t.day, p.from), lte(t.day, p.to), eq(t.rankBand, p.rankBand), eq(t.gameMode, 'normal'), eq(t.matchMode, 'ranked,unranked')))
  const expected = Math.round((Date.parse(p.to) - Date.parse(p.from)) / 86_400_000) + 1
  if (rows.length === 0 || new Set(rows.map((r) => r.day)).size < expected) return null
  return {
    syncedAt: new Date(Math.max(...rows.map((r) => r.syncedAt.getTime()))),
    rows: rows.map((r) => ({
      hero_id: r.heroId,
      bucket: Date.parse(`${r.day}T00:00:00Z`) / 1000,
      wins: r.wins,
      losses: r.losses,
      matches: r.matches,
      total_kills: r.kills,
      total_deaths: r.deaths,
      total_assists: r.assists,
      total_net_worth: r.netWorth,
      total_player_damage: r.playerDamage,
      total_player_damage_taken: r.damageTaken,
      total_boss_damage: r.objectiveDamage,
    })),
  }
}
