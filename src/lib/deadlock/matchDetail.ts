import 'server-only'
import { unstable_cache } from 'next/cache'
import { stableKey } from '@/lib/cache/stableKey'
import { z } from 'zod'
import { deadlockGet } from './client'
import { isMissing } from './errors'

/*
 * Single-match metadata (/v1/matches/{id}/metadata?disable_steam=true). Verified 2026-10-06:
 * - ~0.85 MB for a 25-minute match; per-second movement paths and the damage matrix grow with
 *   length, so the raw response can exceed the 2 MB fetch-cache limit. We fetch uncached and cache
 *   a projection of the fields we use (matches are immutable once finished).
 * - stats[] ticks are cumulative, sampled at 180 s intervals to 15 min, then 300 s, plus the end.
 * - objectives[].team is the objective's OWNER; destroyed_time_s 0 = still standing.
 * - death_details[].killer_player_slot refers to players[].player_slot.
 * - disable_steam=true: never trigger the Steam fallback (3 req/h per IP).
 */

const tickSchema = z.object({
  time_stamp_s: z.number(),
  net_worth: z.number(),
  kills: z.number(),
  deaths: z.number(),
  assists: z.number(),
  player_damage: z.number(),
  player_healing: z.number(),
  boss_damage: z.number(),
  creep_kills: z.number(),
  denies: z.number(),
  level: z.number(),
  player_damage_taken: z.number(),
})

const playerSchema = z.object({
  account_id: z.number(),
  player_slot: z.number(),
  team: z.number(),
  hero_id: z.number(),
  kills: z.number(),
  deaths: z.number(),
  assists: z.number(),
  net_worth: z.number(),
  last_hits: z.number(),
  denies: z.number(),
  level: z.number(),
  assigned_lane: z.number().nullish(),
  items: z.array(z.object({ game_time_s: z.number(), item_id: z.number(), sold_time_s: z.number() })),
  death_details: z.array(z.object({ game_time_s: z.number(), killer_player_slot: z.number() })),
  stats: z.array(tickSchema),
})

const detailSchema = z.object({
  match_info: z.object({
    match_id: z.number(),
    start_time: z.number(),
    duration_s: z.number(),
    match_outcome: z.number(),
    winning_team: z.number(),
    game_mode: z.number(),
    match_mode: z.number(),
    average_badge_team0: z.number().nullish(),
    average_badge_team1: z.number().nullish(),
    is_high_skill_range_parties: z.boolean().nullish(),
    low_pri_pool: z.boolean().nullish(),
    new_player_pool: z.boolean().nullish(),
    not_scored: z.boolean().nullish(),
    game_mode_version: z.number().nullish(),
    objectives: z.array(z.object({ team_objective_id: z.number(), team: z.number(), destroyed_time_s: z.number() })),
    mid_boss: z.array(z.object({ team_killed: z.number(), team_claimed: z.number(), destroyed_time_s: z.number() })).nullish(),
    players: z.array(playerSchema),
  }),
  hero_build_ids: z.record(z.string(), z.number()).nullish(),
  pregame_hero_ids: z.record(z.string(), z.number()).nullish(),
  banned_hero_ids: z.array(z.number()).nullish(),
})

export type MatchDetailRaw = z.infer<typeof detailSchema>

/** Re-validates a stored projection; null when its shape is out of date (then the API is used). */
export function parseStoredMatchDetail(json: unknown): MatchDetailRaw | null {
  const parsed = detailSchema.safeParse(json)
  return parsed.success ? parsed.data : null
}

/**
 * The parsed projection (zod drops every field not listed above), cached 24h per match.
 * Errors (including "not found") are thrown inside the cache, so they are never cached:
 * a recent match that isn't processed yet will load once it is.
 */
const cachedMatchDetail = unstable_cache(
  stableKey('match-detail', (matchId: number): Promise<MatchDetailRaw> =>
    deadlockGet(`/v1/matches/${matchId}/metadata`, {
      params: { disable_steam: true },
      schema: detailSchema,
      revalidate: false,
      timeoutMs: 20_000,
    })),
  ['match-detail-v1'],
  { revalidate: 24 * 60 * 60, tags: ['matches:detail'] },
)

/** Null when the match isn't available (unknown id or not processed yet). */
export async function getMatchDetail(matchId: number): Promise<MatchDetailRaw | null> {
  try {
    return await cachedMatchDetail(matchId)
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}
