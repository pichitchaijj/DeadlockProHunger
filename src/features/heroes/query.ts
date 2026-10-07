import type { RankBandId } from '@/lib/analytics/rankBands'
import { ROLES, type HeroRole, type MetaWindow } from '@/features/meta/query'

/**
 * Heroes directory URL state.
 * Scope (window, rank) is applied on the server: it changes the data.
 * Search, role, complexity and sort filter the already-loaded list in the browser, so they are instant;
 * they are mirrored into the URL with history.replaceState so views stay shareable.
 */
export type DirectorySort = 'name' | 'winRate' | 'pickRate' | 'matches'

export type DirectoryScope = { window: MetaWindow; rank: RankBandId }
export type DirectoryView = {
  q: string
  role: HeroRole | 'all'
  complexity: number | null
  sort: DirectorySort
}

export const DEFAULT_SCOPE: DirectoryScope = { window: '7d', rank: 'all' }
export const DEFAULT_VIEW: DirectoryView = { q: '', role: 'all', complexity: null, sort: 'name' }
export const SORTS: Array<[DirectorySort, string]> = [
  ['name', 'Name (A–Z)'],
  ['winRate', 'Win rate'],
  ['pickRate', 'Pick rate'],
  ['matches', 'Matches'],
]

type Raw = Record<string, string | string[] | undefined>
const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)

export function parseScope(raw: Raw): DirectoryScope {
  const window = str(raw.window)
  const rank = str(raw.rank)
  return {
    window: window === 'patch' || window === '30d' ? window : DEFAULT_SCOPE.window,
    rank: rank === 'low' || rank === 'mid' || rank === 'high' || rank === 'top' ? rank : DEFAULT_SCOPE.rank,
  }
}

export function parseView(raw: Raw): DirectoryView {
  const role = str(raw.role)
  const complexity = Number(str(raw.complexity))
  const sort = str(raw.sort)
  return {
    q: (str(raw.q) ?? '').slice(0, 40),
    role: (ROLES as string[]).includes(role ?? '') ? (role as HeroRole) : 'all',
    complexity: Number.isInteger(complexity) && complexity >= 1 && complexity <= 4 ? complexity : null,
    sort: SORTS.some(([s]) => s === sort) ? (sort as DirectorySort) : DEFAULT_VIEW.sort,
  }
}

/** Builds /heroes URLs; defaults are omitted. */
export function heroesHref(scope: DirectoryScope, view: DirectoryView): string {
  const params = new URLSearchParams()
  if (scope.window !== DEFAULT_SCOPE.window) params.set('window', scope.window)
  if (scope.rank !== DEFAULT_SCOPE.rank) params.set('rank', scope.rank)
  if (view.q) params.set('q', view.q)
  if (view.role !== 'all') params.set('role', view.role)
  if (view.complexity !== null) params.set('complexity', String(view.complexity))
  if (view.sort !== DEFAULT_VIEW.sort) params.set('sort', view.sort)
  const search = params.toString()
  return `/heroes${search ? `?${search}` : ''}`
}
