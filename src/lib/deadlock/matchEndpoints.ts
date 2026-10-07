import 'server-only'
import { z } from 'zod'
import { deadlockGet } from './client'

/*
 * Matches page. Verified 2026-10-06:
 * - Bulk metadata with include_player_kda (+ extra_player_columns=net_worth) is ~45 KB / 0.1 s for 30
 *   matches, versus ~1.4 MB with include_player_info. It includes hero_id, team, K/D/A per player.
 * - account_ids filters to matches containing that player.
 * - /v1/matches/active lists the in-game watch tab (top 200 matches). Its mode fields are raw
 *   enum strings (e.g. "KECitadelGameModeNormal"); never shown as-is.
 * - Bulk metadata allows 30 req/min per IP, so lists are cached for 2 minutes.
 */

const RECENT_TTL = 120
const ACTIVE_TTL = 60

const listMatchSchema = z.object({
  match_id: z.number(),
  start_time: z.string(), // "YYYY-MM-DD HH:MM:SS", UTC
  winning_team: z.string(),
  duration_s: z.number(),
  match_mode: z.string(),
  average_badge: z.number().nullish(),
  players: z.array(
    z.object({
      account_id: z.number(),
      hero_id: z.number(),
      team: z.string(),
      kills: z.number(),
      deaths: z.number(),
      assists: z.number(),
      net_worth: z.number().nullish(),
    }),
  ),
})
export type ApiListMatch = z.infer<typeof listMatchSchema>

export type MatchListParams = {
  heroId?: number
  accountId?: number
  minUnix?: number
  maxUnix?: number
  minBadge?: number
  maxBadge?: number
  minDurationS?: number
  maxDurationS?: number
  limit?: number
}

/** Most recent normal-mode matches matching the filters. */
export function getMatchList(p: MatchListParams) {
  return deadlockGet('/v1/matches/metadata', {
    params: {
      game_mode: 'normal',
      hero_ids: p.heroId,
      account_ids: p.accountId,
      min_unix_timestamp: p.minUnix,
      max_unix_timestamp: p.maxUnix,
      min_average_badge: p.minBadge,
      max_average_badge: p.maxBadge,
      min_duration_s: p.minDurationS,
      max_duration_s: p.maxDurationS,
      order_by: 'start_time',
      order_direction: 'desc',
      limit: p.limit ?? 40,
      include_info: true,
      include_player_kda: true,
      extra_player_columns: 'net_worth',
    },
    schema: z.array(listMatchSchema),
    revalidate: RECENT_TTL,
    tags: ['matches'],
  })
}

const activeSchema = z.object({
  match_id: z.number().nullish(),
  start_time: z.number().nullish(),
  duration_s: z.number().nullish(),
  game_mode_parsed: z.string().nullish(),
  match_mode_parsed: z.string().nullish(),
  net_worth_team_0: z.number().nullish(),
  net_worth_team_1: z.number().nullish(),
  spectators: z.number().nullish(),
  players: z.array(z.object({ hero_id: z.number().nullish(), team: z.number().nullish() })).nullish(),
})
export type ApiActiveMatch = z.infer<typeof activeSchema>

/** Matches currently in the game's watch tab (top 200 only, not every live match). */
export function getActiveMatches() {
  return deadlockGet('/v1/matches/active', {
    schema: z.array(activeSchema),
    revalidate: ACTIVE_TTL,
    tags: ['matches:active'],
  })
}

/** Steam profile search by name or account id. */
export function searchPlayers(text: string) {
  return deadlockGet('/v1/players/steam-search', {
    params: { search_query: text, limit: 6 },
    schema: z.array(z.object({ account_id: z.number(), personaname: z.string(), avatarmedium: z.string().nullish(), matches_played_last_30d: z.number().nullish() })),
    revalidate: 300,
    tags: ['players:search'],
  })
}
