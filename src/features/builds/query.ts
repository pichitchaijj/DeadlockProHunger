import type { RankBandId } from '@/lib/analytics/rankBands'
import type { MetaWindow } from '@/features/meta/query'

export type BuildCategory = 'meta' | 'pro' | 'community'

export const CATEGORIES: Array<{ id: BuildCategory; label: string; definition: string }> = [
  {
    id: 'meta',
    label: 'Meta builds',
    definition: 'Builds with 200+ tracked matches, ordered by how far their win-rate interval sits above the hero’s own win rate.',
  },
  {
    id: 'pro',
    label: 'Pro builds',
    definition: 'Builds by authors currently ranked Ascendant or Eternus (rank at their latest ranked match).',
  },
  { id: 'community', label: 'Community builds', definition: 'This week’s most-favorited builds.' },
]

export type BuildsQuery = {
  category: BuildCategory
  /** Hero slug or 'all'. */
  hero: string
  window: MetaWindow
  rank: RankBandId
}

/** Builds accumulate tracked matches slowly, so the default window is 30 days. */
export const DEFAULT_BUILDS_QUERY: BuildsQuery = { category: 'meta', hero: 'all', window: '30d', rank: 'all' }

type Raw = Record<string, string | string[] | undefined>
const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)

export function parseBuildsQuery(raw: Raw): BuildsQuery {
  const category = str(raw.category)
  const window = str(raw.window)
  const rank = str(raw.rank)
  const hero = str(raw.hero)
  return {
    category: CATEGORIES.some((c) => c.id === category) ? (category as BuildCategory) : DEFAULT_BUILDS_QUERY.category,
    hero: hero && /^[a-z0-9-]{1,40}$/.test(hero) ? hero : 'all',
    window: window === 'patch' || window === '7d' ? window : DEFAULT_BUILDS_QUERY.window,
    rank: rank === 'low' || rank === 'mid' || rank === 'high' || rank === 'top' ? rank : DEFAULT_BUILDS_QUERY.rank,
  }
}

/** Scope params only (used by both list and detail URLs). */
export function scopeSearch(query: Pick<BuildsQuery, 'window' | 'rank'>): string {
  const params = new URLSearchParams()
  if (query.window !== DEFAULT_BUILDS_QUERY.window) params.set('window', query.window)
  if (query.rank !== DEFAULT_BUILDS_QUERY.rank) params.set('rank', query.rank)
  return params.toString()
}

export function buildsHref(query: BuildsQuery, changes: Partial<BuildsQuery> = {}): string {
  const next = { ...query, ...changes }
  const params = new URLSearchParams(scopeSearch(next))
  if (next.category !== DEFAULT_BUILDS_QUERY.category) params.set('category', next.category)
  if (next.hero !== 'all') params.set('hero', next.hero)
  const search = params.toString()
  return `/builds${search ? `?${search}` : ''}`
}

export function buildDetailHref(heroSlug: string, buildId: number, query: Pick<BuildsQuery, 'window' | 'rank'>): string {
  const search = scopeSearch(query)
  return `/builds/${heroSlug}/${buildId}${search ? `?${search}` : ''}`
}

/*
 * Scopes the costly analytics are computed for (lib/deadlock/expensive.ts; checked in the loaders, before any
 * request, so a typed URL can't bypass them). Outside them the view is `limited` and shows no numbers.
 * - The all-heroes listing (any category) needs hero-build-stats for every hero: default scope only (30d, all ranks).
 * - A build's detail (build stats, item stats, ability orders per hero): every window, all ranks only.
 * - Its item flow (item-flow-stats): default scope only.
 */
export const listingInScope = (q: Pick<BuildsQuery, 'hero' | 'window' | 'rank'>) => q.hero !== 'all' || (q.window === DEFAULT_BUILDS_QUERY.window && q.rank === DEFAULT_BUILDS_QUERY.rank)
export const detailInScope = (q: Pick<BuildsQuery, 'rank'>) => q.rank === DEFAULT_BUILDS_QUERY.rank
export const flowInScope = (q: Pick<BuildsQuery, 'window' | 'rank'>) => q.window === DEFAULT_BUILDS_QUERY.window && q.rank === DEFAULT_BUILDS_QUERY.rank
