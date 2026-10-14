import 'server-only'
import { unstable_cache } from 'next/cache'
import { stableKey } from '@/lib/cache/stableKey'
import { z } from 'zod'
import { TTL } from '@/lib/cache/ttl'
import { deadlockGet, notWarmed } from './client'
import { ITEM_MIN_MATCHES } from './constants'
import { scopeParams, type HeroStatsQuery } from './endpoints'
import { expensiveQuery, type ExpensiveRead } from './expensive'

/*
 * Item analytics (/v1/analytics/item-stats). Shapes verified against the live spec and responses on
 * 2026-10-07 (docs/API.md § 4):
 * - Every call returns ALL items: there is no output filter for one item (`include_item_ids` filters the
 *   *population* to players who bought those items). So one cached call per scope serves every item page.
 * - `matches` = player-matches in which the item was bought (wins + losses = matches); `players` = distinct accounts.
 * - bucket=game_time_min groups by the minute the item was BOUGHT (avg_buy_time_s ≈ bucket·60 + 50).
 *   ~2.3 MB / ~8 s for all items over 7 days: over the 2 MB fetch-cache limit, so it is fetched
 *   uncached and a compact projection is cached instead (same for bucket=hero, ~1.5 MB).
 * - Corrupted purchases (build 6712+) are excluded, as on Hero Detail.
 * - Expensive analytics (lib/deadlock/expensive.ts): window ends round to UTC days, entries live TTL.expensiveAnalytics.
 */

const winLoss = { wins: z.number(), losses: z.number(), matches: z.number() }

/** Per-item totals for the scope (optionally one hero's players). ~40 KB for all items. */
export async function getItemTotals(query: HeroStatsQuery, heroId?: number) {
  return deadlockGet('/v1/analytics/item-stats', {
    params: { hero_id: heroId, ...scopeParams(expensiveQuery(query, false)), min_matches: ITEM_MIN_MATCHES, corrupted_items: 'exclude' },
    schema: z.array(z.object({ item_id: z.number(), ...winLoss, players: z.number(), avg_buy_time_s: z.number() })),
    revalidate: TTL.expensiveAnalytics,
    tags: ['analytics:items'],
    timeoutMs: 15_000,
  })
}

/**
 * Per-item, per-UTC-day totals (bucket = day start, unix seconds) for every item. Patch before/after windows.
 * Complete UTC days only, daily key (expensiveQuery): today's bucket is never included. `nowSec` fixes "today" for
 * callers that already cut their own windows with it (Patch impact passes its scope's day), so both agree at midnight.
 */
export async function getItemStatsByDay(query: HeroStatsQuery, nowSec?: number) {
  return deadlockGet('/v1/analytics/item-stats', {
    params: { bucket: 'start_time_day', ...scopeParams(expensiveQuery(query, false, nowSec)), min_matches: ITEM_MIN_MATCHES, corrupted_items: 'exclude' },
    schema: z.array(z.object({ item_id: z.number(), bucket: z.number(), wins: z.number(), matches: z.number() })),
    revalidate: TTL.expensiveAnalytics,
    tags: ['analytics:items'],
    timeoutMs: 20_000,
  })
}

/** [item id, bucket, wins, matches]: the compact projection cached for the bucketed calls. */
export type ItemBucketRow = [itemId: number, bucket: number, wins: number, matches: number]

const bucketSchema = z.array(z.object({ item_id: z.number(), bucket: z.number(), wins: z.number(), matches: z.number() }))

async function bucketed(bucket: 'game_time_min' | 'hero', query: HeroStatsQuery, heroId: number | null): Promise<ItemBucketRow[]> {
  const rows = await deadlockGet('/v1/analytics/item-stats', {
    params: { bucket, hero_id: heroId ?? undefined, ...scopeParams(query), corrupted_items: 'exclude' },
    schema: bucketSchema,
    revalidate: false,
    timeoutMs: 25_000,
  })
  return rows.map((r) => [r.item_id, r.bucket, r.wins, r.matches])
}

/**
 * A projection cached with unstable_cache, plus a cache-only reader of the same entry (same key parts and fixed
 * callback text): a miss there sends nothing and fails as `pending` (lib/deadlock/client.ts `notWarmed`).
 * Errors are thrown inside the cache, so they are never cached. Arguments are part of the cache key.
 */
function cachedProjection<A extends unknown[], T>(name: string, keyParts: string[], tags: string[], path: string, load: (...args: A) => Promise<T>) {
  const options = { revalidate: TTL.expensiveAnalytics, tags }
  const fetching = unstable_cache(stableKey(name, load), keyParts, options)
  const reading = unstable_cache(
    stableKey(name, async (..._args: A): Promise<T> => {
      throw notWarmed(path)
    }),
    keyParts,
    options,
  )
  return (read: ExpensiveRead, ...args: A): Promise<T> => (read.cacheOnly ? reading : fetching)(...args)
}

const byMinute = cachedProjection('item-stats-by-minute', ['item-stats-by-minute-v1'], ['analytics:items'], '/v1/analytics/item-stats', (query: HeroStatsQuery, heroId: number | null) =>
  bucketed('game_time_min', query, heroId),
)

/** Outcomes by purchase minute for every item (optionally one hero's players). */
export async function getItemStatsByMinute(query: HeroStatsQuery, heroId: number | null, read: ExpensiveRead = {}) {
  return byMinute(read, expensiveQuery(query, false), heroId)
}

const byHero = cachedProjection('item-stats-by-hero', ['item-stats-by-hero-v1'], ['analytics:items'], '/v1/analytics/item-stats', (query: HeroStatsQuery) => bucketed('hero', query, null))

/** Outcomes per hero for every item (bucket = hero id). */
export async function getItemStatsByHero(query: HeroStatsQuery, read: ExpensiveRead = {}) {
  return byHero(read, expensiveQuery(query, false))
}

/*
 * Purchase phases from /v1/analytics/item-flow-stats. In `normal` mode the API uses fixed phases
 * (0–9, 9–20, 20–30, 30+ min) and gives each item/phase node an `adjusted_win_rate`: the win rate
 * re-weighted to that phase's net-worth distribution (the spec: "still observational, not a
 * controlled/causal estimate"). The all-heroes response is ~4.7 MB / ~9 s, almost all of it
 * transition edges, so only the nodes (~600) are kept.
 */

/** [item id, phase column, wins, matches, wealth-adjusted win rate]. */
export type ItemPhaseRow = [itemId: number, column: number, wins: number, matches: number, adjustedWinRate: number]
export type ItemPhases = { nodes: ItemPhaseRow[]; /** Players still in the match in each phase (survivorship). */ reached: number[] }

const phases = cachedProjection('item-phases', ['item-phases-v1'], ['analytics:item-flow'], '/v1/analytics/item-flow-stats', async (query: HeroStatsQuery, heroId: number | null): Promise<ItemPhases> => {
    const flow = await deadlockGet('/v1/analytics/item-flow-stats', {
      params: { hero_ids: heroId ?? undefined, ...scopeParams(query), min_matches: ITEM_MIN_MATCHES },
      schema: z.object({
        nodes: z.array(z.object({ column: z.number(), item_id: z.number(), wins: z.number(), matches: z.number(), adjusted_win_rate: z.number() })),
        reached_per_column: z.array(z.number()),
      }),
      revalidate: false,
      timeoutMs: 25_000,
    })
    return { nodes: flow.nodes.map((n) => [n.item_id, n.column, n.wins, n.matches, n.adjusted_win_rate]), reached: flow.reached_per_column }
})

export async function getItemPhases(query: HeroStatsQuery, heroId: number | null, read: ExpensiveRead = {}) {
  return phases(read, expensiveQuery(query, true), heroId)
}
