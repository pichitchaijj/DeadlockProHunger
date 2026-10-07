import 'server-only'
import { unstable_cache } from 'next/cache'
import { stableKey } from '@/lib/cache/stableKey'
import { z } from 'zod'
import { TTL } from '@/lib/cache/ttl'
import { deadlockGet } from './client'
import { scopeParams, type HeroStatsQuery } from './endpoints'

/*
 * Endpoints used by the Hero Detail page. Shapes verified against live responses on
 * 2026-10-06 (docs/API.md § 4). Matrix endpoints (counters, synergies, duration, badge)
 * return every hero in one call, so their cache entries are shared by all hero pages.
 */

const winLoss = { wins: z.number(), losses: z.number(), matches: z.number() }

/** Hero totals for one match-length range. One call per range, shared by every hero. */
export function getHeroStatsForDuration(query: HeroStatsQuery, durationS: { min?: number; max?: number }) {
  return deadlockGet('/v1/analytics/hero-stats', {
    params: { bucket: 'no_bucket', ...scopeParams(query), min_duration_s: durationS.min, max_duration_s: durationS.max },
    schema: z.array(z.object({ hero_id: z.number(), ...winLoss })),
    revalidate: TTL.analytics,
    tags: ['analytics:hero-stats'],
    timeoutMs: 15_000,
  })
}

/** Per-hero totals bucketed by match average badge (bucket 0 = no badge). The rank filter is dropped on purpose. */
export function getHeroStatsByBadge(query: HeroStatsQuery) {
  return deadlockGet('/v1/analytics/hero-stats', {
    params: { bucket: 'avg_badge', ...scopeParams({ ...query, minBadge: undefined, maxBadge: undefined }) },
    schema: z.array(z.object({ hero_id: z.number(), bucket: z.number(), ...winLoss })),
    revalidate: TTL.analytics,
    tags: ['analytics:hero-stats'],
    timeoutMs: 15_000,
  })
}

/**
 * Ban counts per hero (all heroes, one call). Only matches whose bans were extracted from the demo are
 * counted, and the endpoint reports no match total, so a ban *rate* can't be derived: show counts or
 * shares of recorded bans. There is no game_mode filter upstream.
 */
export function getHeroBans(query: Pick<HeroStatsQuery, 'minUnix' | 'maxUnix'>) {
  return deadlockGet('/v1/analytics/hero-ban-stats', {
    params: { min_unix_timestamp: query.minUnix, max_unix_timestamp: query.maxUnix },
    schema: z.array(z.object({ hero_id: z.number(), bans: z.number() })),
    revalidate: TTL.analytics,
    tags: ['analytics:bans'],
    timeoutMs: 15_000,
  })
}

/**
 * Hero-vs-enemy matrix for all heroes. Upstream defaults to same_lane_filter=true;
 * we always pass it explicitly so the label matches the data.
 */
export function getHeroCounters(query: HeroStatsQuery, sameLane: boolean) {
  return deadlockGet('/v1/analytics/hero-counter-stats', {
    params: { ...scopeParams(query), same_lane_filter: sameLane, min_matches: 100 },
    schema: z.array(z.object({ hero_id: z.number(), enemy_hero_id: z.number(), wins: z.number(), matches_played: z.number() })),
    revalidate: TTL.analytics,
    tags: ['analytics:counters'],
    timeoutMs: 15_000,
  })
}

/** Same-team pairs for all heroes, any lane. */
export function getHeroSynergies(query: HeroStatsQuery) {
  return deadlockGet('/v1/analytics/hero-synergy-stats', {
    params: { ...scopeParams(query), same_lane_filter: false, min_matches: 100 },
    schema: z.array(z.object({ hero_id1: z.number(), hero_id2: z.number(), wins: z.number(), matches_played: z.number() })),
    revalidate: TTL.analytics,
    tags: ['analytics:synergies'],
    timeoutMs: 15_000,
  })
}

/** Outcomes per build selected at game start (demo analysis; samples are often small). No game_mode filter upstream. */
export function getHeroBuildStats(heroId: number, query: HeroStatsQuery) {
  const { game_mode: _gameMode, ...params } = scopeParams(query)
  return deadlockGet(`/v1/analytics/hero-build-stats/${heroId}`, {
    params: { ...params, min_matches: 20 },
    schema: z.array(z.object({ hero_build_id: z.number(), ...winLoss })),
    revalidate: TTL.analytics,
    tags: ['analytics:builds'],
  })
}

/** Full ability upgrade sequences with outcomes. */
export function getAbilityOrderStats(heroId: number, query: HeroStatsQuery) {
  return deadlockGet('/v1/analytics/ability-order-stats', {
    params: { hero_id: heroId, ...scopeParams(query), min_matches: 100 },
    schema: z.array(z.object({ abilities: z.array(z.number()), ...winLoss })),
    revalidate: TTL.analytics,
    tags: ['analytics:ability-order'],
    timeoutMs: 15_000,
  })
}

/** Items bought by players of one hero, with average buy time. */
export function getHeroItemStats(heroId: number, query: HeroStatsQuery) {
  return deadlockGet('/v1/analytics/item-stats', {
    params: { hero_id: heroId, ...scopeParams(query), min_matches: 200, corrupted_items: 'exclude' },
    schema: z.array(z.object({ item_id: z.number(), ...winLoss, players: z.number(), avg_buy_time_s: z.number() })),
    revalidate: TTL.analytics,
    tags: ['analytics:items'],
    timeoutMs: 15_000,
  })
}

const buildSchema = z.object({
  hero_build: z.object({
    hero_build_id: z.number(),
    hero_id: z.number(),
    name: z.string(),
    last_updated_timestamp: z.number().nullish(),
    details: z.object({
      mod_categories: z
        .array(z.object({ name: z.string(), mods: z.array(z.object({ ability_id: z.number() })).nullish() }))
        .nullish(),
    }),
  }),
  num_weekly_favorites: z.number().nullish(),
})
export type ApiBuild = z.infer<typeof buildSchema>

/** Latest version of the hero's most-favorited builds this week. */
export function getTopBuilds(heroId: number, limit = 12) {
  return deadlockGet('/v1/builds', {
    params: { hero_id: heroId, only_latest: true, sort_by: 'weekly_favorites', sort_direction: 'desc', limit },
    schema: z.array(buildSchema),
    revalidate: TTL.builds,
    tags: ['builds'],
  })
}

/** The hero's abilities, weapon and melee, with type and icon. */
export function getHeroAbilities(heroId: number) {
  return deadlockGet(`/v1/assets/items/by-hero-id/${heroId}`, {
    schema: z.array(
      z.object({ id: z.number(), type: z.string(), name: z.string().nullish(), ability_type: z.string().nullish(), image: z.string().nullish() }),
    ),
    revalidate: TTL.assets,
    tags: ['assets'],
  })
}

const upgradeSchema = z.object({
  id: z.number(),
  class_name: z.string().nullish(),
  shopable: z.boolean().nullish(),
  name: z.string().nullish(),
  item_slot_type: z.string().nullish(),
  item_tier: z.number().nullish(),
  cost: z.number().nullish(),
  shop_image_small: z.string().nullish(),
  image: z.string().nullish(),
})

export type ShopItem = { id: number; className: string | null; shopable: boolean; name: string | null; slot: string | null; tier: number | null; cost: number | null; icon: string | null }

/**
 * Shop upgrades as a small projection. The upstream list is ~2 MB, over the fetch cache's
 * 2 MB entry limit, so the raw response is not cached; the projection is cached for 24h.
 */
export const getShopItems = unstable_cache(
  stableKey('shop-items', async (): Promise<ShopItem[]> => {
    const items = await deadlockGet('/v1/assets/items/by-type/upgrade', { schema: z.array(upgradeSchema), revalidate: false })
    return items.map((i) => ({
      id: i.id,
      className: i.class_name ?? null,
      shopable: i.shopable ?? false,
      name: i.name ?? null,
      slot: i.item_slot_type ?? null,
      tier: i.item_tier ?? null,
      cost: i.cost ?? null,
      icon: i.shop_image_small ?? i.image ?? null,
    }))
  }),
  ['shop-items-v2'],
  { revalidate: TTL.assets, tags: ['assets'] },
)

const matchSummarySchema = z.object({
  match_id: z.number(),
  start_time: z.string(), // "YYYY-MM-DD HH:MM:SS", UTC
  winning_team: z.string(),
  duration_s: z.number(),
  average_badge: z.number().nullish(),
  players: z.array(
    z.object({
      account_id: z.number(),
      hero_id: z.number(),
      team: z.string(),
      kills: z.number(),
      deaths: z.number(),
      assists: z.number(),
      net_worth: z.number(),
    }),
  ),
})
export type ApiMatchSummary = z.infer<typeof matchSummarySchema>

/** Most recent matches featuring the hero. Bulk metadata allows 30 req/min per IP, so this is cached 10 min. */
export function getRecentHeroMatches(heroId: number, minBadge: number | undefined, limit = 8) {
  return deadlockGet('/v1/matches/metadata', {
    params: {
      hero_ids: heroId,
      game_mode: 'normal',
      min_average_badge: minBadge,
      order_by: 'start_time',
      order_direction: 'desc',
      limit,
      include_info: true,
      include_player_info: true,
      include_player_kda: true,
    },
    schema: z.array(matchSummarySchema),
    revalidate: TTL.matches,
    tags: ['matches'],
  })
}
