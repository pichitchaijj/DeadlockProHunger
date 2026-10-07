import type { RankBandId } from '@/lib/analytics/rankBands'
import type { MetaWindow } from '@/features/meta/query'

export type DraftSide = 'allies' | 'enemies'

export type DraftQuery = {
  allies: string[]
  enemies: string[]
  /** Which side the hero grid adds to. */
  side: DraftSide
  window: MetaWindow
  rank: RankBandId
}

export const TEAM_SIZE = 6

type Raw = Record<string, string | string[] | undefined>
const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')
const slugs = (v: string) => [...new Set(v.split(',').filter((s) => /^[a-z0-9-]{1,40}$/.test(s)))].slice(0, TEAM_SIZE)

export function parseDraftQuery(raw: Raw): DraftQuery {
  const allies = slugs(str(raw.allies))
  const enemies = slugs(str(raw.enemies)).filter((s) => !allies.includes(s))
  const window = str(raw.window)
  const rank = str(raw.rank)
  return {
    allies,
    enemies,
    side: raw.side === 'enemies' ? 'enemies' : 'allies',
    window: window === 'patch' || window === '30d' ? window : '7d',
    rank: rank === 'low' || rank === 'mid' || rank === 'high' || rank === 'top' ? rank : 'all',
  }
}

export function draftHref(q: DraftQuery, changes: Partial<DraftQuery> = {}): string {
  const next = { ...q, ...changes }
  const params = new URLSearchParams()
  if (next.allies.length) params.set('allies', next.allies.join(','))
  if (next.enemies.length) params.set('enemies', next.enemies.join(','))
  if (next.side !== 'allies') params.set('side', next.side)
  if (next.window !== '7d') params.set('window', next.window)
  if (next.rank !== 'all') params.set('rank', next.rank)
  const s = params.toString()
  return `/draft${s ? `?${s}` : ''}`.replace(/%2C/g, ',')
}

/** Adds a hero to a side (removing it from the other side); no-op when that side is full. */
export function withHero(q: DraftQuery, slug: string, side: DraftSide): DraftQuery {
  const other: DraftSide = side === 'allies' ? 'enemies' : 'allies'
  if (q[side].includes(slug) || q[side].length >= TEAM_SIZE) return q
  return { ...q, [side]: [...q[side], slug], [other]: q[other].filter((s) => s !== slug) }
}

export function withoutHero(q: DraftQuery, slug: string): DraftQuery {
  return { ...q, allies: q.allies.filter((s) => s !== slug), enemies: q.enemies.filter((s) => s !== slug) }
}
