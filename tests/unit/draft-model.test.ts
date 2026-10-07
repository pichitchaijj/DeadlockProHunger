import { describe, expect, it } from 'vitest'
import { draftHref, parseDraftQuery, withHero } from '@/features/draft/query'
import { balanceProfile, draftRelations, recommendations, relationIndex, teamBalance, weakPoints, type DraftHero, type HeroTotals } from '@/features/draft/model'

/* Synthetic inputs only. Every hero has a 50% baseline, so expected pair rates are 50%. */
const totals: HeroTotals[] = [1, 2, 3, 4, 5].map((id) => ({ heroId: id, wins: 50_000, matches: 100_000, damage: id * 1000, damageTaken: (6 - id) * 1000, objectiveDamage: 100 }))
const heroes: DraftHero[] = [
  { id: 1, slug: 'a', name: 'A', role: 'brawler', iconUrl: null },
  { id: 2, slug: 'b', name: 'B', role: 'mystic', iconUrl: null },
  { id: 3, slug: 'c', name: 'C', role: 'marksman', iconUrl: null },
  { id: 4, slug: 'd', name: 'D', role: 'brawler', iconUrl: null },
  { id: 5, slug: 'e', name: 'E', role: 'assassin', iconUrl: null },
]
const syn = [
  { a: 1, b: 3, wins: 5_600, matches: 10_000 }, // clearly positive
  { a: 1, b: 4, wins: 5_020, matches: 10_000 }, // noise
  { a: 2, b: 1, wins: 4_400, matches: 10_000 }, // clearly negative
]
const vs = [
  { a: 3, b: 5, wins: 5_700, matches: 10_000 }, // C beats E
  { a: 1, b: 5, wins: 4_300, matches: 10_000 }, // E beats A
  { a: 4, b: 5, wins: 150, matches: 150 }, // extreme but Low sample
]
const idx = relationIndex(totals, syn, vs)

describe('relationIndex', () => {
  it('compares pairs with the expectation from individual win rates', () => {
    const r = idx.synergy(3, 1)!
    expect(r.expected).toBeCloseTo(0.5)
    expect(r.clear).toBe('positive')
    expect(idx.synergy(1, 4)!.clear).toBeNull()
  })

  it('never calls a Low-sample pair clear', () => {
    expect(idx.matchup(4, 5)!.clear).toBeNull()
  })

  it('ignores statistically detectable but tiny gaps', () => {
    const big = relationIndex(totals, [{ a: 1, b: 2, wins: 504_000, matches: 1_000_000 }], [])
    expect(big.synergy(1, 2)!.interval.low).toBeGreaterThan(0.5)
    expect(big.synergy(1, 2)!.clear).toBeNull()
  })
})

describe('draft', () => {
  it('draws only clear relationships among picks', () => {
    const r = draftRelations(idx, [1, 2], [5])
    expect(r.clear.map((x) => `${x.kind}:${x.from}-${x.to}:${x.clear}`)).toEqual(['synergy:1-2:negative', 'matchup:1-5:negative'])
    expect(r.checked).toBe(3)
  })

  it('recommends only heroes with clear positive evidence, with confidence', () => {
    const recs = recommendations(idx, heroes, [1], [5])
    expect(recs.map((r) => [r.hero.name, r.confidence, r.newRole])).toEqual([['C', 'high', 'marksman']])
  })

  it('lists measured weak points', () => {
    const wp = weakPoints(idx, heroes, [1, 2], [5], null)
    expect(wp.map((w) => w.kind)).toEqual(['threat', 'clash'])
  })

  it('ranks balance against all heroes', () => {
    const profile = balanceProfile(totals)
    expect(profile.get(5)!.damage).toBe(1)
    expect(teamBalance(profile, [1, 5])!.damage).toBeCloseTo(0.5)
  })
})

describe('draft query', () => {
  it('dedupes, caps teams and never puts a hero on both sides', () => {
    const q = parseDraftQuery({ allies: 'haze,haze,seven', enemies: 'seven,abrams,BAD!' })
    expect(q.allies).toEqual(['haze', 'seven'])
    expect(q.enemies).toEqual(['abrams'])
    expect(draftHref(q)).toBe('/draft?allies=haze,seven&enemies=abrams')
  })

  it('moves a hero between sides and respects the team size', () => {
    const q = parseDraftQuery({ allies: 'a,b,c,d,e,f', enemies: 'g' })
    expect(withHero(q, 'h', 'allies')).toBe(q)
    expect(withHero(q, 'a', 'enemies').allies).not.toContain('a')
  })
})
