import 'server-only'
import { unstable_cache } from 'next/cache'
import { z } from 'zod'
import { deadlockGet, DeadlockApiError } from './client'
import { isMissing } from './errors'
import type { Region, ScoreboardMetric } from './constants'

export { REGIONS, SCOREBOARD_METRICS, type Region, type ScoreboardMetric } from './constants'

/*
 * Players system. Verified 2026-10-06 (account 338104565):
 * - match-history: ~780 KB for 1,272 matches (can exceed the 2 MB cache limit for very active
 *   players), so we cache a projection. player_match_outcome is 0 ("invalid") on most older
 *   matches (1,034 of 1,259 for the test account), so win/loss = match_result === player_team;
 *   only outcomes 3–5 (penalized / not scored) are excluded. Modes are integers
 *   (game_mode 1 normal; match_mode 1 unranked, 4 ranked).
 * - mate-stats / enemy-stats embed every shared match id; unfiltered they are 235 KB+ for one
 *   player. min_matches_played keeps them small (≥10 mates: 23 KB, ≥5 enemies: 7 KB).
 * - steam-search answers 404 when nothing matches; that is an empty result, not an error.
 * - Only public profile fields are kept (persona name, avatar, Steam profile link). Real name,
 *   country and friend lists exist upstream and are deliberately never read.
 */


const leaderboardSchema = z.object({
  entries: z.array(
    z.object({
      account_name: z.string().nullish(),
      possible_account_ids: z.array(z.number()).nullish(),
      rank: z.number().nullish(),
      top_hero_ids: z.array(z.number()).nullish(),
    }),
  ),
})

/** Valve's regional leaderboard (updated hourly upstream). Optionally for one hero. */
export function getLeaderboard(region: Region, heroId?: number) {
  return deadlockGet(heroId ? `/v1/leaderboard/${region}/${heroId}` : `/v1/leaderboard/${region}`, {
    schema: leaderboardSchema,
    revalidate: 60 * 60,
    tags: ['leaderboard'],
  })
}

/** Rank at the end of the player's latest ranked match. badge 0 = no rank reported. */
export async function getPlayerRank(accountId: number) {
  try {
    return await deadlockGet(`/v1/players/${accountId}/rank`, {
      schema: z.object({
        badge: z.number(),
        rank: z.number(),
        subrank: z.number(),
        last_match: z
          .object({
            match_id: z.number(),
            start_time: z.number(),
            player_rank_initial_calibration_games: z.number().nullish(),
            player_rank_desired_progress_change: z.number().nullish(),
          })
          .nullish(),
      }),
      revalidate: 10 * 60,
      tags: ['players:rank'],
    })
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}

const historySchema = z.array(
  z.object({
    match_id: z.number(),
    hero_id: z.number(),
    start_time: z.number(),
    game_mode: z.number(),
    match_mode: z.number(),
    match_duration_s: z.number(),
    player_kills: z.number(),
    player_deaths: z.number(),
    player_assists: z.number(),
    net_worth: z.number(),
    last_hits: z.number(),
    match_result: z.number(),
    player_team: z.number(),
    player_match_outcome: z.number(),
    ranked_display_badge: z.number().nullish(),
    ranked_delta: z.number().nullish(),
  }),
)
export type HistoryEntry = z.infer<typeof historySchema>[number]

/** Stored match history (no force_refetch, ever). Cached 10 min as a projection. */
export const getMatchHistory = unstable_cache(
  (accountId: number) => deadlockGet(`/v1/players/${accountId}/match-history`, { schema: historySchema, revalidate: false, timeoutMs: 20_000 }),
  ['player-history-v2'],
  { revalidate: 10 * 60, tags: ['players:history'] },
)

export function getPlayerHeroStats(accountId: number) {
  return deadlockGet('/v1/players/hero-stats', {
    params: { account_ids: accountId, game_mode: 'normal' },
    schema: z.array(
      z.object({
        hero_id: z.number(),
        matches_played: z.number(),
        wins: z.number(),
        kills: z.number(),
        deaths: z.number(),
        assists: z.number(),
        last_played: z.number().nullish(),
        networth_per_min: z.number().nullish(),
      }),
    ),
    revalidate: 10 * 60,
    tags: ['players:heroes'],
  })
}

export function getMateStats(accountId: number) {
  return deadlockGet(`/v1/players/${accountId}/mate-stats`, {
    params: { min_matches_played: 10, game_mode: 'normal' },
    schema: z.array(z.object({ mate_id: z.number(), wins: z.number(), matches_played: z.number() })),
    revalidate: 10 * 60,
    tags: ['players:mates'],
  })
}

export function getEnemyStats(accountId: number) {
  return deadlockGet(`/v1/players/${accountId}/enemy-stats`, {
    params: { min_matches_played: 5, game_mode: 'normal' },
    schema: z.array(z.object({ enemy_id: z.number(), wins: z.number(), matches_played: z.number() })),
    revalidate: 10 * 60,
    tags: ['players:enemies'],
  })
}

/** Public profile fields only. */
export async function getPublicProfiles(accountIds: number[]) {
  if (accountIds.length === 0) return []
  return deadlockGet('/v1/players/steam', {
    params: { account_ids: [...new Set(accountIds)].slice(0, 100).sort((a, b) => a - b) },
    schema: z.array(z.object({ account_id: z.number(), personaname: z.string(), avatarmedium: z.string().nullish(), profileurl: z.string().nullish() })),
    revalidate: 24 * 60 * 60,
    tags: ['players:steam'],
  })
    // Empty persona names exist; drop them so callers fall back to "Player {id}".
    .then((rows) => rows.filter((p) => p.personaname.trim() !== ''))
    .catch((error) => {
      if (error instanceof DeadlockApiError && error.status === 404) return []
      throw error
    })
}

/** Profile search by name or account id. 404 = no matches. */
export async function searchProfiles(text: string, minTeamBadge?: number, opts: { timeoutMs?: number; retry?: boolean } = {}) {
  try {
    return await deadlockGet('/v1/players/steam-search', {
      params: { search_query: text, limit: 20, min_last_team_avg_badge: minTeamBadge },
      schema: z.array(
        z.object({
          account_id: z.number(),
          personaname: z.string(),
          avatarmedium: z.string().nullish(),
          matches_played_last_30d: z.number().nullish(),
          last_team_avg_badge: z.number().nullish(),
        }),
      ),
      revalidate: 5 * 60,
      tags: ['players:search'],
      ...opts,
    })
  } catch (error) {
    if (error instanceof DeadlockApiError && error.status === 404) return []
    throw error
  }
}


/**
 * Global player scoreboard computed from tracked matches (analytics bucket, no region filter).
 * `rank` sorts by rank progress and also returns the current badge.
 */
export function getPlayerScoreboard(p: {
  sortBy: ScoreboardMetric
  heroId?: number
  minMatches: number
  minUnix: number
  maxUnix: number
  minBadge?: number
  maxBadge?: number
  limit?: number
}) {
  return deadlockGet('/v1/analytics/scoreboards/players', {
    params: {
      sort_by: p.sortBy,
      sort_direction: 'desc',
      game_mode: 'normal',
      hero_id: p.heroId,
      min_matches: p.minMatches,
      min_unix_timestamp: p.minUnix,
      max_unix_timestamp: p.maxUnix,
      min_average_badge: p.minBadge,
      max_average_badge: p.maxBadge,
      limit: p.limit ?? 100,
    },
    schema: z.array(z.object({ rank: z.number(), account_id: z.number(), value: z.number(), matches: z.number(), badge: z.number().nullish() })),
    revalidate: p.sortBy === 'rank' ? 60 * 60 : 6 * 60 * 60,
    tags: ['analytics:scoreboard'],
    timeoutMs: 15_000,
  })
}
