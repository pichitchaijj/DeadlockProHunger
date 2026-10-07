import type { RankBandId } from '@/lib/analytics/rankBands'

/** Patch filter state, in the URL. Rank and match type mean the same as on Meta; hero / item narrow the lists. */
export type PatchQuery = {
  hero: string
  item: string
  rank: RankBandId
  mode: 'all' | 'ranked'
}

export type CompareQuery = PatchQuery & { a: string | null; b: string | null }

export const DEFAULT_PATCH_QUERY: PatchQuery = { hero: 'all', item: 'all', rank: 'all', mode: 'all' }

type Raw = Record<string, string | string[] | undefined>
const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)
const slug = (v: string | undefined) => (v && /^[a-z0-9-]{1,60}$/.test(v) ? v : 'all')
const patchId = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)

export function parsePatchQuery(raw: Raw): PatchQuery {
  const rank = str(raw.rank)
  return {
    hero: slug(str(raw.hero)),
    item: slug(str(raw.item)),
    rank: rank === 'low' || rank === 'mid' || rank === 'high' || rank === 'top' ? rank : 'all',
    mode: str(raw.mode) === 'ranked' ? 'ranked' : 'all',
  }
}

export function parseCompareQuery(raw: Raw): CompareQuery {
  return { ...parsePatchQuery(raw), a: patchId(str(raw.a)), b: patchId(str(raw.b)) }
}

function params(q: PatchQuery): URLSearchParams {
  const p = new URLSearchParams()
  if (q.hero !== 'all') p.set('hero', q.hero)
  if (q.item !== 'all') p.set('item', q.item)
  if (q.rank !== 'all') p.set('rank', q.rank)
  if (q.mode !== 'all') p.set('mode', q.mode)
  return p
}

const withSearch = (path: string, p: URLSearchParams) => `${path}${p.size ? `?${p}` : ''}`

export const patchListHref = (q: PatchQuery = DEFAULT_PATCH_QUERY, changes: Partial<PatchQuery> = {}) => withSearch('/patch', params({ ...q, ...changes }))

export const patchHref = (id: string, q: PatchQuery = DEFAULT_PATCH_QUERY, changes: Partial<PatchQuery> = {}) => withSearch(`/patch/${id}`, params({ ...q, ...changes }))

export function compareHref(q: CompareQuery, changes: Partial<CompareQuery> = {}): string {
  const next = { ...q, ...changes }
  const p = params(next)
  if (next.a) p.set('a', next.a)
  if (next.b) p.set('b', next.b)
  return withSearch('/patch/compare', p)
}
