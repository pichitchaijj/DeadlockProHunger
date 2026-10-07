import type { RankBandId } from '@/lib/analytics/rankBands'

/** Player search state. The leaderboard lives at /leaderboard (features/leaderboard). */
export type PlayersQuery = {
  q: string
  /** Minimum recent-team average rank band. */
  rank: RankBandId
}

export const DEFAULT_PLAYERS_QUERY: PlayersQuery = { q: '', rank: 'all' }

type Raw = Record<string, string | string[] | undefined>
const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)

export function parsePlayersQuery(raw: Raw): PlayersQuery {
  const rank = str(raw.rank)
  return {
    q: (str(raw.q) ?? '').trim().slice(0, 40),
    rank: rank === 'low' || rank === 'mid' || rank === 'high' || rank === 'top' ? rank : 'all',
  }
}

export function playersHref(q: PlayersQuery, changes: Partial<PlayersQuery> = {}): string {
  const next = { ...q, ...changes }
  const params = new URLSearchParams()
  if (next.q) params.set('q', next.q)
  if (next.rank !== 'all') params.set('rank', next.rank)
  const search = params.toString()
  return `/players${search ? `?${search}` : ''}`
}
