import type { RankBandId } from '@/lib/analytics/rankBands'
import type { MetaWindow } from '@/features/meta/query'

export const HERO_TABS = [
  ['overview', 'Overview'],
  ['builds', 'Builds'],
  ['matchups', 'Matchups'],
  ['abilities', 'Abilities'],
  ['trends', 'Trends'],
  ['matches', 'Matches'],
] as const
export type HeroTab = (typeof HERO_TABS)[number][0]

export type HeroQuery = {
  tab: HeroTab
  window: MetaWindow
  rank: RankBandId
  /** Matchups: lane opponents only (upstream default) or any opponent. */
  lane: 'lane' | 'any'
}

export const DEFAULT_HERO_QUERY: HeroQuery = { tab: 'overview', window: '7d', rank: 'all', lane: 'lane' }

type Raw = Record<string, string | string[] | undefined>
const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)

export function parseHeroQuery(raw: Raw): HeroQuery {
  const tab = str(raw.tab)
  const window = str(raw.window)
  const rank = str(raw.rank)
  return {
    tab: HERO_TABS.some(([t]) => t === tab) ? (tab as HeroTab) : DEFAULT_HERO_QUERY.tab,
    window: window === 'patch' || window === '30d' ? window : DEFAULT_HERO_QUERY.window,
    rank: rank === 'low' || rank === 'mid' || rank === 'high' || rank === 'top' ? rank : DEFAULT_HERO_QUERY.rank,
    lane: str(raw.lane) === 'any' ? 'any' : 'lane',
  }
}

export function heroHref(slug: string, query: HeroQuery, changes: Partial<HeroQuery> = {}): string {
  const next = { ...query, ...changes }
  const params = new URLSearchParams()
  if (next.tab !== DEFAULT_HERO_QUERY.tab) params.set('tab', next.tab)
  if (next.window !== DEFAULT_HERO_QUERY.window) params.set('window', next.window)
  if (next.rank !== DEFAULT_HERO_QUERY.rank) params.set('rank', next.rank)
  if (next.lane !== DEFAULT_HERO_QUERY.lane) params.set('lane', next.lane)
  const search = params.toString()
  return `/heroes/${slug}${search ? `?${search}` : ''}`
}
