import 'server-only'
import { unstable_cache } from 'next/cache'
import { stableKey } from '@/lib/cache/stableKey'
import { z } from 'zod'
import { TTL } from '@/lib/cache/ttl'
import { deadlockGet } from './client'
import { ITEM_MIN_MATCHES } from './constants'
import { scopeParams, type HeroStatsQuery } from './endpoints'

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
 */

const winLoss = { wins: z.number(), losses: z.number(), matches: z.number() }

/** Per-item totals for the scope (optionally one hero's players). ~40 KB for all items. */
export function getItemTotals(query: HeroStatsQuery, heroId?: number) {
  return deadlockGet('/v1/analytics/item-stats', {
    params: { hero_id: heroId, ...scopeParams(query), min_matches: ITEM_MIN_MATCHES, corrupted_items: 'exclude' },
    schema: z.array(z.object({ item_id: z.number(), ...winLoss, players: z.number(), avg_buy_time_s: z.number() })),
    revalidate: TTL.analytics,
    tags: ['analytics:items'],
    timeoutMs: 15_000,
  })
}

/** Per-item, per-UTC-day totals (bucket = day start, unix seconds) for every item. Patch before/after windows. */
export function getItemStatsByDay(query: HeroStatsQuery) {
  return deadlockGet('/v1/analytics/item-stats', {
    params: { bucket: 'start_time_day', ...scopeParams(query), min_matches: ITEM_MIN_MATCHES, corrupted_items: 'exclude' },
    schema: z.array(z.object({ item_id: z.number(), bucket: z.number(), wins: z.number(), matches: z.number() })),
    revalidate: TTL.analytics,
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
 * Outcomes by purchase minute for every item (optionally one hero's players). Errors are thrown inside
 * the cache, so they are never cached. Arguments are part of the cache key.
 */
export const getItemStatsByMinute = unstable_cache(
  stableKey('item-stats-by-minute', (query: HeroStatsQuery, heroId: number | null) => bucketed('game_time_min', query, heroId)),
  ['item-stats-by-minute-v1'],
  { revalidate: TTL.analytics, tags: ['analytics:items'] },
)

/** Outcomes per hero for every item (bucket = hero id). */
export const getItemStatsByHero = unstable_cache(
  stableKey('item-stats-by-hero', (query: HeroStatsQuery) => bucketed('hero', query, null)),
  ['item-stats-by-hero-v1'],
  { revalidate: TTL.analytics, tags: ['analytics:items'] },
)

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

export const getItemPhases = unstable_cache(
  stableKey('item-phases', async (query: HeroStatsQuery, heroId: number | null): Promise<ItemPhases> => {
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
  }),
  ['item-phases-v1'],
  { revalidate: TTL.analytics, tags: ['analytics:item-flow'] },
)
