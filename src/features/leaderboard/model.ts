import { sampleTier, type SampleTier } from '@/lib/analytics/sampleTier'
import { wilsonInterval, type Interval } from '@/lib/analytics/wilson'
import type { HeroLite } from '@/features/players/model'

/*
 * Leaderboard rows. "Rank change" is measured, not inferred: the batch rank endpoint reports the
 * rank progress the player's latest ranked match changed (1,000 points per subrank) and the badge
 * they entered it with. A different badge after the match means a promotion or demotion.
 */

export type RankChange = { delta: number; badgeMove: 'up' | 'down' | null; at: number }

export function rankChange(r: {
  badge: number
  last_match?: { start_time: number; player_rank_initial_display_rank?: number | null; player_rank_desired_progress_change?: number | null } | null
}): RankChange | null {
  const m = r.last_match
  if (!m || m.player_rank_desired_progress_change == null || !r.badge) return null
  const before = m.player_rank_initial_display_rank ?? null
  return {
    delta: m.player_rank_desired_progress_change,
    badgeMove: before && before !== r.badge ? (r.badge > before ? 'up' : 'down') : null,
    at: m.start_time * 1000,
  }
}

export type BoardRow = {
  position: number
  name: string
  accountId: number | null
  possibleAccounts: number
  topHeroes: HeroLite[]
  badge: number | null
  rankLabel: string | null
  tierName: string | null
  /** Tier badge image (set by the loader; absent in pure model output). */
  tierImage?: string | null
  change: RankChange | null
  /** Performance view / global view: tracked matches and the sorted value. */
  matches: number | null
  value: number | null
  /** Win-rate boards: interval and player-scale sample tier. */
  interval: Interval | null
  sample: SampleTier | null
}

/** Rows from the analytics scoreboard (global, account-based). */
export function scoreboardRows(
  rows: Array<{ rank: number; account_id: number; value: number; matches: number; badge?: number | null }>,
  ctx: { names: Map<number, string>; changes: Map<number, RankChange>; badges: Map<number, number>; label: (badge: number | null) => string | null; tier: (badge: number | null) => string | null; winRate: boolean },
): BoardRow[] {
  return rows.map((r) => {
    const badge = r.badge || ctx.badges.get(r.account_id) || null
    return {
      position: r.rank + 1,
      name: ctx.names.get(r.account_id)?.trim() || `Player ${r.account_id}`, // empty Steam names exist
      accountId: r.account_id,
      possibleAccounts: 1,
      topHeroes: [],
      badge,
      rankLabel: ctx.label(badge),
      tierName: ctx.tier(badge),
      change: ctx.changes.get(r.account_id) ?? null,
      matches: r.matches,
      value: r.value,
      interval: ctx.winRate ? wilsonInterval(Math.round(r.value * r.matches), r.matches) : null,
      sample: sampleTier(r.matches, 'player'),
    }
  })
}
