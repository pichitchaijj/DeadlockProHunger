import type { RankBandId } from '@/lib/analytics/rankBands'
import { ROLES, type HeroRole, type MetaWindow } from '@/features/meta/query'

/**
 * Analyze workspace state, all in the URL so every view is shareable.
 *  - `hero`: the hero under analysis (slug); none = pick one.
 *  - `window`, `rank`: the same presets as every stats page (features/meta/scope.ts).
 *  - `role`: narrows the hero picker.
 *  - `peers`: who the hero is compared with: same role (default) or every hero.
 */
export type AnalyzeQuery = {
  hero: string | null
  window: MetaWindow
  rank: RankBandId
  role: 'all' | HeroRole
  peers: 'role' | 'all'
}

export const DEFAULT_ANALYZE_QUERY: AnalyzeQuery = { hero: null, window: '7d', rank: 'all', role: 'all', peers: 'role' }

type Raw = Record<string, string | string[] | undefined>
const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)

export function parseAnalyzeQuery(raw: Raw): AnalyzeQuery {
  const hero = str(raw.hero)
  const window = str(raw.window)
  const rank = str(raw.rank)
  const role = str(raw.role)
  return {
    hero: hero && /^[a-z0-9-]{1,40}$/.test(hero) ? hero : null,
    window: window === 'patch' || window === '30d' ? window : DEFAULT_ANALYZE_QUERY.window,
    rank: rank === 'low' || rank === 'mid' || rank === 'high' || rank === 'top' ? rank : DEFAULT_ANALYZE_QUERY.rank,
    role: (ROLES as string[]).includes(role ?? '') ? (role as HeroRole) : 'all',
    peers: str(raw.peers) === 'all' ? 'all' : 'role',
  }
}

/** URL for the workspace with some state changed; defaults are omitted to keep URLs short. */
export function analyzeHref(query: AnalyzeQuery, changes: Partial<AnalyzeQuery> = {}): string {
  const next = { ...query, ...changes }
  const params = new URLSearchParams()
  if (next.hero) params.set('hero', next.hero)
  if (next.window !== DEFAULT_ANALYZE_QUERY.window) params.set('window', next.window)
  if (next.rank !== DEFAULT_ANALYZE_QUERY.rank) params.set('rank', next.rank)
  if (next.role !== DEFAULT_ANALYZE_QUERY.role) params.set('role', next.role)
  if (next.peers !== DEFAULT_ANALYZE_QUERY.peers) params.set('peers', next.peers)
  const search = params.toString()
  return `/analyze${search ? `?${search}` : ''}`
}
