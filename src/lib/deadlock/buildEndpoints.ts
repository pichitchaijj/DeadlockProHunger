import 'server-only'
import { z } from 'zod'
import { TTL } from '@/lib/cache/ttl'
import { deadlockGet } from './client'
import { scopeParams, type HeroStatsQuery } from './endpoints'

/*
 * Builds pages. Shapes verified 2026-10-06:
 * - /v1/builds supports `build_id` lookup and returns `details.ability_order.currency_changes`
 *   (type 2 = one unlock per ability; type 1 = upgrade spends of 1/2/5 points).
 * - item-flow for one hero is ~2.5 MB at the default min_matches, over the 2 MB fetch-cache
 *   limit; min_matches=500 brings it to ~0.7 MB.
 * - /v1/players/rank (batch) is limited to 20 req/min per IP, so author ranks are cached 1h.
 */

const abilityStepSchema = z.object({ ability_id: z.number(), currency_type: z.number(), delta: z.number() })

export const fullBuildSchema = z.object({
  hero_build: z.object({
    hero_build_id: z.number(),
    hero_id: z.number(),
    author_account_id: z.number(),
    name: z.string(),
    description: z.string().nullish(),
    version: z.number().nullish(),
    language: z.number().nullish(),
    last_updated_timestamp: z.number().nullish(),
    publish_timestamp: z.number().nullish(),
    details: z.object({
      mod_categories: z
        .array(z.object({ name: z.string(), mods: z.array(z.object({ ability_id: z.number() })).nullish() }))
        .nullish(),
      ability_order: z.object({ currency_changes: z.array(abilityStepSchema).nullish() }).nullish(),
    }),
  }),
  num_weekly_favorites: z.number().nullish(),
})
export type FullBuild = z.infer<typeof fullBuildSchema>

/** Most-favorited latest builds this week, optionally for one hero. */
export function searchBuilds({ heroId, limit = 100, start = 0 }: { heroId?: number; limit?: number; start?: number }) {
  return deadlockGet('/v1/builds', {
    params: { hero_id: heroId, only_latest: true, sort_by: 'weekly_favorites', sort_direction: 'desc', limit, start },
    schema: z.array(fullBuildSchema),
    revalidate: TTL.builds,
    tags: ['builds'],
  })
}

/** One build (latest version) from the API's build database. Never triggers a Game Coordinator fetch. */
export async function getBuildById(buildId: number) {
  const rows = await deadlockGet('/v1/builds', {
    params: { build_id: buildId, only_latest: true },
    schema: z.array(fullBuildSchema),
    revalidate: TTL.builds,
    tags: ['builds'],
  })
  return rows[0] ?? null
}

/** Item purchase flow for one hero: per-phase nodes with wealth-adjusted win rate, and transitions. */
export function getItemFlow(heroId: number, query: HeroStatsQuery) {
  return deadlockGet('/v1/analytics/item-flow-stats', {
    params: { hero_ids: heroId, ...scopeParams(query), min_matches: 500 },
    schema: z.object({
      nodes: z.array(
        z.object({
          column: z.number(),
          item_id: z.number(),
          wins: z.number(),
          matches: z.number(),
          adjusted_win_rate: z.number(),
          avg_net_worth_at_buy: z.number(),
        }),
      ),
      edges: z.array(z.object({ from_column: z.number(), from_item_id: z.number(), to_item_id: z.number(), matches: z.number() })),
      reached_per_column: z.array(z.number()),
      baseline: z.object({ wins: z.number(), matches: z.number() }),
    }),
    revalidate: TTL.analytics,
    tags: ['analytics:item-flow'],
    timeoutMs: 20_000,
  })
}

/** Current rank (latest ranked match) for up to 100 accounts. badge 0 = no rank. */
export function getAccountRanks(accountIds: number[]) {
  return deadlockGet('/v1/players/rank', {
    params: { account_ids: [...new Set(accountIds)].slice(0, 100).sort((a, b) => a - b) },
    schema: z.array(
      z.object({
        account_id: z.number(),
        badge: z.number(),
        rank: z.number(),
        subrank: z.number(),
        /** The latest ranked match: rank going in, and the rank progress it changed (1,000 points per subrank). */
        last_match: z
          .object({
            start_time: z.number(),
            player_rank_initial_display_rank: z.number().nullish(),
            player_rank_desired_progress_change: z.number().nullish(),
          })
          .nullish(),
      }),
    ),
    revalidate: 60 * 60,
    tags: ['players:rank'],
  })
}

/** Public Steam persona names for up to 100 accounts (read path, no refresh). */
export async function getSteamNames(accountIds: number[]) {
  const rows = await deadlockGet('/v1/players/steam', {
    params: { account_ids: [...new Set(accountIds)].slice(0, 100).sort((a, b) => a - b) },
    schema: z.array(z.object({ account_id: z.number(), personaname: z.string() })),
    revalidate: TTL.assets,
    tags: ['players:steam'],
  })
  // Empty persona names exist; drop them so callers fall back to "Player {id}".
  return rows.filter((p) => p.personaname.trim() !== '')
}

/** Builds whose name matches, most favorited first (global search). */
export function searchBuildsByName(text: string, limit = 5) {
  return deadlockGet('/v1/builds', {
    params: { search_name: text, only_latest: true, sort_by: 'weekly_favorites', sort_direction: 'desc', limit },
    schema: z.array(fullBuildSchema),
    revalidate: 10 * 60,
    tags: ['builds'],
    // Upstream name search can take ~8s on an uncached query; the palette won't wait that long.
    timeoutMs: 2_500,
    retry: false,
  })
}
