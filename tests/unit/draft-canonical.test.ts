import { describe, expect, it } from 'vitest'
import { canonicalDraftHref, draftHref, parseDraftQuery, withHero, withoutHero, type DraftQuery } from '@/features/draft/query'

/*
 * Canonical Draft URLs (canonicalDraftHref): a request whose Draft parameters aren't canonical redirects to the
 * one URL for the board it shows; a canonical one never redirects (no loops).
 */

type Raw = Record<string, string | string[] | undefined>

/** Heroes the (mocked) hero list knows. */
const KNOWN = new Set(['haze', 'abrams', 'seven', 'infernus', 'dynamo', 'bebop', 'vindicta', 'lash', 'mo-krill'])

/** The draft the page shows for a request: parsed, unknown heroes removed (what getDraftData resolves). */
function shown(raw: Raw): DraftQuery {
  const q = parseDraftQuery(raw)
  return { ...q, allies: q.allies.filter((s) => KNOWN.has(s)), enemies: q.enemies.filter((s) => KNOWN.has(s)) }
}

const redirectFor = (raw: Raw) => canonicalDraftHref(raw, shown(raw))

/** A query string as the page receives it: repeated keys become arrays. */
function params(search: string): Raw {
  const out: Raw = {}
  for (const [k, v] of new URLSearchParams(search)) {
    const prev = out[k]
    out[k] = prev === undefined ? v : [...(Array.isArray(prev) ? prev : [prev]), v]
  }
  return out
}

describe('canonical Draft URLs', () => {
  it.each([
    // defaults
    ['window=7d', '/draft'],
    ['side=allies', '/draft'],
    ['rank=all', '/draft'],
    ['allies=haze&window=7d&side=allies&rank=all', '/draft?allies=haze'],
    // duplicates and overlap
    ['allies=haze,haze', '/draft?allies=haze'],
    ['allies=haze&enemies=haze,seven', '/draft?allies=haze&enemies=seven'],
    // invalid and unknown
    ['allies=HAZE', '/draft'],
    ['allies=zzz', '/draft'],
    ['allies=haze,zzz,abrams', '/draft?allies=haze,abrams'],
    ['allies=haze,', '/draft?allies=haze'],
    ['window=forever', '/draft'],
    ['rank=godlike&allies=haze', '/draft?allies=haze'],
    ['side=both', '/draft'],
    // more than a team
    ['allies=haze,abrams,seven,infernus,dynamo,bebop,vindicta', '/draft?allies=haze,abrams,seven,infernus,dynamo,bebop'],
    // repeated keys
    ['allies=haze&allies=abrams', '/draft'],
    ['window=30d&window=patch&allies=haze', '/draft?allies=haze'],
    // empty values
    ['allies=&window=30d', '/draft?window=30d'],
    ['allies=haze&enemies=', '/draft?allies=haze'],
    ['allies=', '/draft'],
    // tracking parameters are dropped when a Draft parameter redirects
    ['allies=haze,haze&utm_source=x', '/draft?allies=haze'],
  ])('%s → %s', (search, target) => {
    expect(redirectFor(params(search))).toBe(target)
  })

  it.each([
    [''],
    ['allies=haze'],
    ['allies=haze,abrams&enemies=seven,infernus'],
    ['enemies=seven&side=enemies'],
    ['allies=haze&window=30d&rank=top'],
    ['window=patch&rank=low'],
    ['allies=mo-krill'],
    // pick order is the user's: kept as it is
    ['allies=abrams,haze'],
    // key order isn't compared
    ['enemies=seven&allies=haze'],
  ])('leaves canonical %s alone', (search) => {
    expect(redirectFor(params(search))).toBeNull()
  })

  it('never redirects for tracking or host parameters alone (no loop if a host adds one)', () => {
    expect(redirectFor(params('allies=haze&utm_source=x&utm_campaign=y'))).toBeNull()
    expect(redirectFor(params('allies=haze&fbclid=1&ref=z'))).toBeNull()
    expect(redirectFor(params('utm_source=x'))).toBeNull()
  })

  it('never redirects a redirect target again', () => {
    const requests = [
      'window=7d', 'allies=haze,haze', 'allies=HAZE,zzz,abrams&enemies=abrams,seven,seven', 'allies=haze&allies=abrams',
      'allies=&enemies=&side=&window=&rank=', 'allies=haze,abrams,seven,infernus,dynamo,bebop,vindicta&enemies=lash',
      'allies=haze,haze&utm_source=x&side=enemies&window=patch&rank=top', 'side=enemies&side=enemies',
    ]
    for (const search of requests) {
      const target = redirectFor(params(search))
      expect(target, search).not.toBeNull()
      const [, query = ''] = target!.split('?')
      expect(redirectFor(params(query)), `${search} → ${target}`).toBeNull()
      expect(shown(params(query)), search).toEqual(shown(params(search)))
    }
  })

  it('every link the board builds is canonical (picking heroes, sides, filters, clear)', () => {
    let q = parseDraftQuery({})
    const hrefs: string[] = []
    for (const [slug, side] of [['haze', 'allies'], ['seven', 'enemies'], ['abrams', 'allies'], ['haze', 'enemies'], ['lash', 'enemies']] as const) {
      q = withHero(q, slug, side)
      hrefs.push(draftHref(q), draftHref(q, { side: 'enemies' }), draftHref(q, { window: '30d' }), draftHref(q, { rank: 'top' }))
    }
    hrefs.push(draftHref(withoutHero(q, 'seven')), draftHref({ ...q, allies: [], enemies: [] }), draftHref(q, { window: '7d', rank: 'all', side: 'allies' }))
    for (const href of hrefs) {
      const [, query = ''] = href.split('?')
      expect(redirectFor(params(query)), href).toBeNull()
    }
  })

  it('keeps the board a redirect lands on identical to the one requested', () => {
    const raw = params('allies=haze,zzz&enemies=seven&side=enemies&window=30d&rank=high')
    const [, query = ''] = redirectFor(raw)!.split('?')
    expect(shown(params(query))).toEqual(shown(raw))
    expect(shown(params(query))).toEqual({ allies: ['haze'], enemies: ['seven'], side: 'enemies', window: '30d', rank: 'high' })
  })
})
