import type { RankBandId } from '@/lib/analytics/rankBands'
import type { MetaWindow } from '@/features/meta/query'

export type CompareType = 'heroes' | 'builds' | 'players'

export type CompareQuery = {
  type: CompareType
  /** heroes: slug · builds: "heroSlug:buildId" · players: SteamID3 */
  a: string
  b: string
  window: MetaWindow
  rank: RankBandId
}

type Raw = Record<string, string | string[] | undefined>
const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v.trim() : '')

const VALID: Record<CompareType, RegExp> = {
  heroes: /^[a-z0-9-]{1,40}$/,
  builds: /^[a-z0-9-]{1,40}:\d{1,10}$/,
  players: /^\d{1,10}$/,
}

export function parseCompareQuery(raw: Raw): CompareQuery {
  const type: CompareType = raw.type === 'builds' ? 'builds' : raw.type === 'players' ? 'players' : 'heroes'
  const window = str(raw.window)
  const rank = str(raw.rank)
  const pick = (v: string) => (VALID[type].test(v) ? v : '')
  return {
    type,
    a: pick(str(raw.a)),
    b: pick(str(raw.b)),
    // Builds collect tracked matches slowly, so they default to 30 days (as on the Builds page).
    window: window === 'patch' || window === '30d' || window === '7d' ? window : type === 'builds' ? '30d' : '7d',
    rank: rank === 'low' || rank === 'mid' || rank === 'high' || rank === 'top' ? rank : 'all',
  }
}

export function compareHref(q: CompareQuery, changes: Partial<CompareQuery> = {}): string {
  const next = { ...q, ...changes }
  const params = new URLSearchParams({ type: next.type })
  if (next.a) params.set('a', next.a)
  if (next.b) params.set('b', next.b)
  if (next.window !== (next.type === 'builds' ? '30d' : '7d')) params.set('window', next.window)
  if (next.rank !== 'all') params.set('rank', next.rank)
  return `/compare?${params.toString()}`
}
