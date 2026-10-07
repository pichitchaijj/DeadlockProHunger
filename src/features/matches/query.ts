import type { RankBandId } from '@/lib/analytics/rankBands'

export type DateScope = '24h' | '7d' | 'patch'
export type DurationScope = 'any' | 'short' | 'standard' | 'long'
export type ResultScope = 'any' | 'win' | 'loss'

export type MatchesQuery = {
  hero: string // slug or 'all'
  /** SteamID3 as digits, a name to search, or '' */
  player: string
  result: ResultScope
  duration: DurationScope
  date: DateScope
  rank: RankBandId
}

export const DEFAULT_MATCHES_QUERY: MatchesQuery = { hero: 'all', player: '', result: 'any', duration: 'any', date: '24h', rank: 'all' }

export const DURATIONS: Record<Exclude<DurationScope, 'any'>, { label: string; min?: number; max?: number }> = {
  short: { label: 'Under 25 min', max: 1_500 },
  standard: { label: '25–35 min', min: 1_500, max: 2_100 },
  long: { label: 'Over 35 min', min: 2_100 },
}

export const DATES: Record<DateScope, string> = { '24h': 'Last 24 hours', '7d': 'Last 7 days', patch: 'Current patch' }

type Raw = Record<string, string | string[] | undefined>
const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)

export function parseMatchesQuery(raw: Raw): MatchesQuery {
  const hero = str(raw.hero)
  const result = str(raw.result)
  const duration = str(raw.duration)
  const date = str(raw.date)
  const rank = str(raw.rank)
  return {
    hero: hero && /^[a-z0-9-]{1,40}$/.test(hero) ? hero : 'all',
    player: (str(raw.player) ?? '').trim().slice(0, 40),
    result: result === 'win' || result === 'loss' ? result : 'any',
    duration: duration === 'short' || duration === 'standard' || duration === 'long' ? duration : 'any',
    date: date === '7d' || date === 'patch' ? date : '24h',
    rank: rank === 'low' || rank === 'mid' || rank === 'high' || rank === 'top' ? rank : 'all',
  }
}

/** A result filter needs a perspective: a hero or a specific player. */
export function hasPerspective(q: MatchesQuery): boolean {
  return q.hero !== 'all' || /^\d+$/.test(q.player)
}

export function matchesHref(q: MatchesQuery, changes: Partial<MatchesQuery> = {}): string {
  const next = { ...q, ...changes }
  if (!hasPerspective(next)) next.result = 'any'
  const params = new URLSearchParams()
  for (const key of Object.keys(DEFAULT_MATCHES_QUERY) as Array<keyof MatchesQuery>) {
    if (next[key] !== DEFAULT_MATCHES_QUERY[key]) params.set(key, String(next[key]))
  }
  const search = params.toString()
  return `/matches${search ? `?${search}` : ''}`
}
