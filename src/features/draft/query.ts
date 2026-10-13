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

/**
 * Every query parameter that changes the Draft board: the only keys parseDraftQuery reads. A Draft URL with
 * none of them is the empty board, served from the cached route (`/[lang]/draft/board`, rewritten in
 * next.config.ts); any one of them keeps the dynamic route. A new Draft parameter must be added here.
 */
export const DRAFT_PARAMS = ['allies', 'enemies', 'side', 'window', 'rank'] as const

/**
 * `rel` for every link that changes the draft (add, remove, side, clear, recommendation, filters, retry): each
 * one is a new query-string URL, so crawlers aren't invited to follow them (robots.txt and the page's
 * noindex, nofollow cover the same URLs: src/features/draft/seo.ts). The URLs themselves are unchanged.
 */
export const DRAFT_STATE_REL = 'nofollow'

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

/**
 * The canonical URL of a Draft request, or null when its Draft parameters already are canonical. `shown` is the
 * draft the page displays: the parsed query with the heroes the hero list doesn't know removed, so it is only
 * known once that list has loaded. Default, duplicate, invalid and empty values and repeated keys differ from the
 * canonical value; pick order is kept. Only DRAFT_PARAMS decide: other parameters (tracking, anything the host
 * adds) never cause a redirect, so the target, whose Draft parameters are canonical, can't redirect again. They
 * are dropped when a redirect happens for a Draft parameter.
 */
export function canonicalDraftHref(raw: Raw, shown: DraftQuery): string | null {
  const href = draftHref(shown)
  const canonical = new URLSearchParams(href.split('?')[1] ?? '')
  const same = DRAFT_PARAMS.every((key) => {
    const value = raw[key]
    return value === undefined ? !canonical.has(key) : typeof value === 'string' && canonical.get(key) === value
  })
  return same ? null : href
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
