import type { RankBandId } from '@/lib/analytics/rankBands'
import { SCOREBOARD_METRICS, type Region, type ScoreboardMetric } from '@/lib/deadlock/constants'
import { ROLES, type HeroRole } from '@/features/meta/query'

export type BoardScope = 'global' | Region

export type LeaderboardQuery = {
  view: 'ranked' | 'performance'
  scope: BoardScope
  hero: string // slug or 'all'
  role: HeroRole | 'all'
  metric: ScoreboardMetric
  min: 20 | 50 | 100
  window: '7d' | '30d'
  rank: RankBandId
  page: number
}

export const DEFAULT_LEADERBOARD_QUERY: LeaderboardQuery = {
  view: 'ranked',
  scope: 'global',
  hero: 'all',
  role: 'all',
  metric: 'winrate',
  min: 50,
  window: '30d',
  rank: 'all',
  page: 1,
}

type Raw = Record<string, string | string[] | undefined>
const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)
const SCOPES: BoardScope[] = ['global', 'Europe', 'NAmerica', 'SAmerica', 'Asia', 'Oceania']

export function parseLeaderboardQuery(raw: Raw): LeaderboardQuery {
  const d = DEFAULT_LEADERBOARD_QUERY
  const scope = str(raw.scope) as BoardScope | undefined
  const hero = str(raw.hero)
  const role = str(raw.role)
  const metric = str(raw.metric)
  const min = Number(str(raw.min))
  const rank = str(raw.rank)
  const page = Number(str(raw.page))
  return {
    view: str(raw.view) === 'performance' ? 'performance' : 'ranked',
    scope: scope && SCOPES.includes(scope) ? scope : d.scope,
    hero: hero && /^[a-z0-9-]{1,40}$/.test(hero) ? hero : 'all',
    role: (ROLES as string[]).includes(role ?? '') ? (role as HeroRole) : 'all',
    metric: metric && metric in SCOREBOARD_METRICS && metric !== 'rank' ? (metric as ScoreboardMetric) : d.metric,
    min: min === 20 || min === 100 ? min : 50,
    window: str(raw.window) === '7d' ? '7d' : '30d',
    rank: rank === 'low' || rank === 'mid' || rank === 'high' || rank === 'top' ? rank : 'all',
    page: Number.isInteger(page) && page >= 1 && page <= 20 ? page : 1,
  }
}

export function leaderboardHref(q: LeaderboardQuery, changes: Partial<LeaderboardQuery> = {}): string {
  const next = { ...q, page: 1, ...changes }
  const params = new URLSearchParams()
  for (const key of Object.keys(DEFAULT_LEADERBOARD_QUERY) as Array<keyof LeaderboardQuery>) {
    if (next[key] !== DEFAULT_LEADERBOARD_QUERY[key]) params.set(key, String(next[key]))
  }
  const search = params.toString()
  return `/leaderboard${search ? `?${search}` : ''}`
}
