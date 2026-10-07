import type { RankBandId } from '@/lib/analytics/rankBands'
import type { MetaWindow } from '@/features/meta/query'

/** Item filter state. Lives in the URL so every view is shareable; scope fields mean the same as on Meta. */
export type ItemSlot = 'weapon' | 'vitality' | 'spirit'
export type ItemSort = 'buyRate' | 'winRate' | 'matches' | 'buyTime'

export type ItemScopeQuery = {
  window: MetaWindow
  rank: RankBandId
  /** `all` = ranked + unranked (upstream default); `ranked` = ranked only. */
  mode: 'all' | 'ranked'
  /** Hero slug, or 'all' for every hero's players. */
  hero: string
}

export type ItemsQuery = ItemScopeQuery & {
  slot: ItemSlot | 'all'
  sort: ItemSort
  dir: 'asc' | 'desc'
}

export const DEFAULT_ITEMS_QUERY: ItemsQuery = { window: '7d', rank: 'all', mode: 'all', hero: 'all', slot: 'all', sort: 'buyRate', dir: 'desc' }

export const SLOTS: ItemSlot[] = ['weapon', 'vitality', 'spirit']

type Raw = Record<string, string | string[] | undefined>

function pick<T extends string>(value: string | string[] | undefined, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

export function parseItemScope(raw: Raw): ItemScopeQuery {
  const hero = typeof raw.hero === 'string' && /^[a-z0-9-]{1,40}$/.test(raw.hero) ? raw.hero : 'all'
  return {
    window: pick(raw.window, ['patch', '7d', '30d'] as const, DEFAULT_ITEMS_QUERY.window),
    rank: pick(raw.rank, ['all', 'low', 'mid', 'high', 'top'] as const, DEFAULT_ITEMS_QUERY.rank),
    mode: pick(raw.mode, ['all', 'ranked'] as const, DEFAULT_ITEMS_QUERY.mode),
    hero,
  }
}

export function parseItemsQuery(raw: Raw): ItemsQuery {
  return {
    ...parseItemScope(raw),
    slot: pick(raw.slot, ['all', ...SLOTS] as const, DEFAULT_ITEMS_QUERY.slot),
    sort: pick(raw.sort, ['buyRate', 'winRate', 'matches', 'buyTime'] as const, DEFAULT_ITEMS_QUERY.sort),
    dir: pick(raw.dir, ['asc', 'desc'] as const, DEFAULT_ITEMS_QUERY.dir),
  }
}

function scopeParams(query: ItemScopeQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.window !== DEFAULT_ITEMS_QUERY.window) params.set('window', query.window)
  if (query.rank !== DEFAULT_ITEMS_QUERY.rank) params.set('rank', query.rank)
  if (query.mode !== DEFAULT_ITEMS_QUERY.mode) params.set('mode', query.mode)
  if (query.hero !== DEFAULT_ITEMS_QUERY.hero) params.set('hero', query.hero)
  return params
}

/** Item directory URL with some filters changed; defaults are omitted to keep URLs short. */
export function itemsHref(query: ItemsQuery, changes: Partial<ItemsQuery> = {}, hash?: string): string {
  const next = { ...query, ...changes }
  const params = scopeParams(next)
  if (next.slot !== DEFAULT_ITEMS_QUERY.slot) params.set('slot', next.slot)
  if (next.sort !== DEFAULT_ITEMS_QUERY.sort) params.set('sort', next.sort)
  if (next.dir !== DEFAULT_ITEMS_QUERY.dir) params.set('dir', next.dir)
  const search = params.toString()
  return `/items${search ? `?${search}` : ''}${hash ? `#${hash}` : ''}`
}

/** Item detail URL; carries the scope (window, rank, mode, hero) so both pages show the same population. */
export function itemHref(slug: string, query: ItemScopeQuery, changes: Partial<ItemScopeQuery> = {}): string {
  const search = scopeParams({ ...query, ...changes }).toString()
  return `/items/${slug}${search ? `?${search}` : ''}`
}
