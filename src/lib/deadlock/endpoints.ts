import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { TTL } from '@/lib/cache/ttl'
import { deadlockGet } from './client'

/*
 * Typed endpoint functions. Schemas list only the fields we use, as verified
 * against the OpenAPI spec and live responses (docs/API.md § 4).
 * Ranks use the current rank data (/v1/assets/ranks, badge-distribution), never MMR.
 */

// ── Assets ───────────────────────────────────────────────────────────

const heroSchema = z.object({
  id: z.number(),
  name: z.string(),
  class_name: z.string(),
  hero_type: z.string().nullish(),
  /** The game's own complexity rating (observed 1–4). */
  complexity: z.number().nullish(),
  images: z
    .object({
      icon_image_small: z.string().nullish(),
      icon_image_small_webp: z.string().nullish(),
      icon_hero_card: z.string().nullish(),
      icon_hero_card_webp: z.string().nullish(),
    })
    .partial()
    .nullish(),
})
export type ApiHero = z.infer<typeof heroSchema>

/**
 * Player-selectable, enabled heroes. The three reference fetchers here are memoized per request (React
 * `cache`): one page resolves scope and hero lists from several loaders, and each call would otherwise
 * re-parse the same response. Outside a render (cron jobs) `cache` is a plain pass-through.
 */
export const getActiveHeroes = cache(() => {
  return deadlockGet('/v1/assets/heroes', {
    params: { only_active: true },
    schema: z.array(heroSchema),
    revalidate: TTL.assets,
    tags: ['assets'],
  })
})

const rankSchema = z.object({
  tier: z.number(),
  name: z.string(),
  color: z.string().nullish(),
  /** Tier badge art (data identifier; rendered only by components/game-assets/RankBadge). */
  images: z.object({ large: z.string().nullish(), large_webp: z.string().nullish() }).nullish(),
})

/** The 12 rank tiers (0 Obscurus … 11 Eternus). */
export const getRanks = cache(() => {
  return deadlockGet('/v1/assets/ranks', {
    schema: z.array(rankSchema),
    revalidate: TTL.assets,
    tags: ['assets'],
  })
})

/**
 * Data-source facts for the Home strip: matches added per day, and table row counts (we read only
 * `steam_profiles`, the player profiles the source knows). Facts about the source, not about players.
 */
export function getApiInfo() {
  return deadlockGet('/v1/info', {
    schema: z.object({ fetched_matches_per_day: z.number(), table_sizes: z.record(z.string(), z.object({ rows: z.number() })) }),
    revalidate: TTL.patches,
    tags: ['info'],
  })
}

// ── Patches ──────────────────────────────────────────────────────────

const feedItemSchema = z.object({
  /** Stable feed id (e.g. "urn:xenforo:thread:166726"). */
  guid: z.object({ text: z.string() }).nullish(),
  source: z.enum(['forum', 'steam']),
  title: z.string(),
  pub_date: z.string(),
  link: z.string().nullish(),
  /** Link-preview HTML of the post (a short, source-truncated excerpt, not the full notes). */
  content: z.string().nullish(),
})

export const getPatchFeed = cache(() => {
  return deadlockGet('/v2/patches', {
    schema: z.array(feedItemSchema),
    revalidate: TTL.patches,
    tags: ['patches'],
  })
})

// ── Analytics (shared bucket: 200 req/min per IP) ─────────────────────

const heroStatsRowSchema = z.object({
  hero_id: z.number(),
  /** With bucket=start_time_day: unix seconds of the UTC day start. */
  bucket: z.number(),
  wins: z.number(),
  losses: z.number(),
  matches: z.number(),
  total_kills: z.number(),
  total_deaths: z.number(),
  total_assists: z.number(),
  total_net_worth: z.number(),
  total_player_damage: z.number().nullish(),
  total_player_damage_taken: z.number().nullish(),
  total_boss_damage: z.number().nullish(),
})
export type HeroStatsDayRow = z.infer<typeof heroStatsRowSchema>

export type HeroStatsQuery = {
  /** Unix seconds, hour-rounded by the caller so presets share cache keys. */
  minUnix: number
  maxUnix: number
  minBadge?: number
  maxBadge?: number
  /** Upstream default is "ranked,unranked". */
  matchMode?: 'ranked' | 'ranked,unranked'
}

/** Common analytics filters, applied identically by every analytics call. */
/**
 * `maxUnix` for a window of whole UTC days whose last day starts at `lastDay`. hero-stats and
 * item-stats round bounds to whole days, and an end at the next day's 00:00 pulls that entire
 * day in (docs/API.md § Common analytics filters, verified 2026-10-07), so the end sits mid-day.
 */
export const throughDay = (lastDay: number) => lastDay + 12 * 3_600

export function scopeParams(query: HeroStatsQuery) {
  return {
    game_mode: 'normal',
    match_mode: query.matchMode ?? 'ranked,unranked',
    min_unix_timestamp: query.minUnix,
    max_unix_timestamp: query.maxUnix,
    min_average_badge: query.minBadge,
    max_average_badge: query.maxBadge,
  }
}

/** Per-hero, per-UTC-day totals. One call returns every hero (the endpoint has no hero filter). */
export function getHeroStatsByDay(query: HeroStatsQuery) {
  return deadlockGet('/v1/analytics/hero-stats', {
    params: { bucket: 'start_time_day', ...scopeParams(query) },
    schema: z.array(heroStatsRowSchema),
    revalidate: TTL.analytics,
    tags: ['analytics:hero-stats'],
    timeoutMs: 15_000,
  })
}

const badgeDistributionSchema = z.object({
  badge_level: z.number(),
  total_matches: z.number(),
  unique_players: z.number(),
})

/**
 * Players by the rank at the end of their latest ranked match (`unique_players`),
 * plus matches by average badge. Ranked matches only; clamped to the first ranked season.
 */
export function getBadgeDistribution(minUnix: number) {
  return deadlockGet('/v1/analytics/badge-distribution', {
    params: { game_mode: 'normal', min_unix_timestamp: minUnix },
    schema: z.array(badgeDistributionSchema),
    revalidate: TTL.distribution,
    tags: ['analytics:badge-distribution'],
  })
}

const heroTotalsSchema = z.object({
  hero_id: z.number(),
  wins: z.number(),
  matches: z.number(),
  total_player_damage: z.number(),
  total_player_damage_taken: z.number(),
  total_boss_damage: z.number(),
})

/** Per-hero totals for the whole window (no bucket), including damage dealt/taken and objective damage. */
export function getHeroTotals(query: HeroStatsQuery) {
  return deadlockGet('/v1/analytics/hero-stats', {
    params: scopeParams(query),
    schema: z.array(heroTotalsSchema),
    revalidate: TTL.analytics,
    tags: ['analytics:hero-stats'],
    timeoutMs: 15_000,
  })
}
