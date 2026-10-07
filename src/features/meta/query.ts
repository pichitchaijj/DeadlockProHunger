import type { RankBandId } from '@/lib/analytics/rankBands'

/** Meta filter state. Lives in the URL so every view is shareable. */
export type MetaWindow = 'patch' | '7d' | '30d'
export type MetaSort = 'tier' | 'winRate' | 'pickRate' | 'matches'
export type HeroRole = 'marksman' | 'mystic' | 'brawler' | 'assassin'

export type MetaQuery = {
  window: MetaWindow
  rank: RankBandId
  /** `all` or a hero_type from /v1/assets/heroes. */
  role: HeroRole | 'all'
  /** `all` = ranked + unranked (upstream default); `ranked` = ranked only. */
  mode: 'all' | 'ranked'
  /** Low-sample heroes are hidden unless explicitly requested. */
  showLow: boolean
  sort: MetaSort
  dir: 'asc' | 'desc'
}

export const DEFAULT_QUERY: MetaQuery = {
  window: '7d',
  rank: 'all',
  role: 'all',
  mode: 'all',
  showLow: false,
  sort: 'tier',
  dir: 'desc',
}

export const ROLES: HeroRole[] = ['marksman', 'mystic', 'brawler', 'assassin']

type Raw = Record<string, string | string[] | undefined>

function pick<T extends string>(value: string | string[] | undefined, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

export function parseMetaQuery(raw: Raw): MetaQuery {
  return {
    window: pick(raw.window, ['patch', '7d', '30d'] as const, DEFAULT_QUERY.window),
    rank: pick(raw.rank, ['all', 'low', 'mid', 'high', 'top'] as const, DEFAULT_QUERY.rank),
    role: pick(raw.role, ['all', ...ROLES] as const, DEFAULT_QUERY.role),
    mode: pick(raw.mode, ['all', 'ranked'] as const, DEFAULT_QUERY.mode),
    showLow: raw.low === '1',
    sort: pick(raw.sort, ['tier', 'winRate', 'pickRate', 'matches'] as const, DEFAULT_QUERY.sort),
    dir: pick(raw.dir, ['asc', 'desc'] as const, DEFAULT_QUERY.dir),
  }
}

/** URL for the Meta page with some filters changed; defaults are omitted to keep URLs short. */
export function metaHref(query: MetaQuery, changes: Partial<MetaQuery> = {}, hash?: string): string {
  const next = { ...query, ...changes }
  const params = new URLSearchParams()
  if (next.window !== DEFAULT_QUERY.window) params.set('window', next.window)
  if (next.rank !== DEFAULT_QUERY.rank) params.set('rank', next.rank)
  if (next.role !== DEFAULT_QUERY.role) params.set('role', next.role)
  if (next.mode !== DEFAULT_QUERY.mode) params.set('mode', next.mode)
  if (next.showLow) params.set('low', '1')
  if (next.sort !== DEFAULT_QUERY.sort) params.set('sort', next.sort)
  if (next.dir !== DEFAULT_QUERY.dir) params.set('dir', next.dir)
  const search = params.toString()
  return `/meta${search ? `?${search}` : ''}${hash ? `#${hash}` : ''}`
}
