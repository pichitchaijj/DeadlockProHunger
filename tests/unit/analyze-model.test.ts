import { describe, expect, it } from 'vitest'
import { ordinal, peerComparison, pickerHeroes, trendRange, type PeerHero } from '@/features/analyze/model'
import { analyzeHref, DEFAULT_ANALYZE_QUERY, parseAnalyzeQuery } from '@/features/analyze/query'
import { sampleTier } from '@/lib/analytics/sampleTier'
import { wilsonInterval } from '@/lib/analytics/wilson'

/* Synthetic inputs only (not real statistics). */
function hero(id: number, role: string, wins: number, matches: number, pickRate = 0.1): PeerHero {
  return {
    id,
    slug: `hero-${id}`,
    name: `Hero ${id}`,
    iconUrl: null,
    role,
    wins,
    matches,
    winRate: wins / matches,
    interval: wilsonInterval(wins, matches),
    sample: sampleTier(matches),
    pickRate,
  }
}

const heroes = [
  hero(1, 'marksman', 5_600, 10_000, 0.3), // 56%
  hero(2, 'marksman', 4_900, 10_000, 0.4), // 49%
  hero(3, 'marksman', 5_000, 10_000, 0.2), // 50%
  hero(4, 'marksman', 90, 150, 0.01), // Low sample
  hero(5, 'mystic', 6_000, 10_000, 0.5), // 60%, other role
]

describe('peerComparison', () => {
  it('ranks within the role, with Low-sample heroes listed last and unranked', () => {
    const c = peerComparison(heroes, 1, 'role')!
    expect(c.role).toBe('marksman')
    expect(c.rows.map((r) => r.id)).toEqual([1, 3, 2, 4])
    expect(c.rows.find((r) => r.selected)?.id).toBe(1)
    expect(c.rows.map((r) => r.position)).toEqual([1, 2, 3, null])
    expect(c).toMatchObject({ group: 'role', roleAvailable: true })
    expect(c.ranked).toBe(3)
    expect(c.winRatePosition).toBe(1)
    expect(c.pickRatePosition).toBe(2)
  })

  it('compares with every hero when asked', () => {
    const c = peerComparison(heroes, 1, 'all')!
    expect(c.role).toBeNull()
    expect(c.ranked).toBe(4)
    expect(c.winRatePosition).toBe(2)
  })

  it('states a clear difference only when intervals separate and the gap is at least 1pp', () => {
    expect(peerComparison(heroes, 1, 'role')!.versusRest).toBe('higher')
    expect(peerComparison(heroes, 2, 'role')!.versusRest).toBe('lower')
    // 50% vs a rest pooled from 56%, 49% and a small sample: intervals overlap or the gap is small.
    const close = [hero(10, 'brawler', 5_050, 10_000), hero(11, 'brawler', 5_000, 10_000)]
    expect(peerComparison(close, 10, 'role')!.versusRest).toBe('within')
  })

  it('never ranks or compares a Low-sample hero', () => {
    const c = peerComparison(heroes, 4, 'role')!
    expect(c.winRatePosition).toBeNull()
    expect(c.pickRatePosition).toBeNull()
    expect(c.versusRest).toBeNull()
    expect(c.rows.at(-1)).toMatchObject({ id: 4, selected: true })
  })

  it('falls back to every hero, and says so, when the hero has no role', () => {
    const noRole = { ...hero(6, 'marksman', 5_200, 10_000), role: null }
    const c = peerComparison([...heroes, noRole], 6, 'role')!
    expect(c).toMatchObject({ group: 'all', roleAvailable: false, role: null, ranked: 5 })
  })

  it('has no comparison when the hero is alone or unknown', () => {
    expect(peerComparison([hero(1, 'marksman', 50, 100)], 1, 'role')!.rest).toBeNull()
    expect(peerComparison(heroes, 99, 'role')).toBeNull()
  })
})

describe('helpers', () => {
  it('formats ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 111].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '111th'])
  })

  it('filters the picker by role and sorts by name', () => {
    const list = [
      { name: 'Vindicta', role: 'marksman' },
      { name: 'Abrams', role: 'brawler' },
      { name: 'Grey Talon', role: 'marksman' },
    ]
    expect(pickerHeroes(list, 'marksman').map((h) => h.name)).toEqual(['Grey Talon', 'Vindicta'])
    expect(pickerHeroes(list, 'all').map((h) => h.name)).toEqual(['Abrams', 'Grey Talon', 'Vindicta'])
  })
})

describe('analyze query', () => {
  it('parses valid values and falls back to defaults otherwise', () => {
    expect(parseAnalyzeQuery({})).toEqual(DEFAULT_ANALYZE_QUERY)
    expect(parseAnalyzeQuery({ hero: 'grey-talon', window: '30d', rank: 'top', role: 'mystic', peers: 'all' })).toEqual({
      hero: 'grey-talon',
      window: '30d',
      rank: 'top',
      role: 'mystic',
      peers: 'all',
    })
    expect(parseAnalyzeQuery({ hero: '<script>', window: '1y', rank: 'pro', role: 'tank', peers: 'x' })).toEqual(DEFAULT_ANALYZE_QUERY)
  })

  it('builds short URLs that round-trip', () => {
    expect(analyzeHref(DEFAULT_ANALYZE_QUERY)).toBe('/analyze')
    const q = { ...DEFAULT_ANALYZE_QUERY, hero: 'haze', rank: 'high' as const }
    const href = analyzeHref(q, { peers: 'all' })
    expect(href).toBe('/analyze?hero=haze&rank=high&peers=all')
    expect(parseAnalyzeQuery(Object.fromEntries(new URLSearchParams(href.split('?')[1])))).toEqual({ ...q, peers: 'all' })
  })
})

describe('trendRange', () => {
  const DAY = 86_400
  const today = 20_000 * DAY
  // Synthetic daily series for the last 60 days, with day 3-days-ago missing.
  const series = Array.from({ length: 60 }, (_, i) => today - (59 - i) * DAY)
    .filter((day) => day !== today - 3 * DAY)
    .map((day) => ({ day, winRate: 0.5, pickRate: 0.1, matches: 1_000 }))

  it('follows the selected window: 7 days shows 7 days, 30 shows 30', () => {
    const week = trendRange(series, today - 6 * DAY, today)
    expect(week).toMatchObject({ from: today - 6 * DAY, to: today, requestedDays: 7, missingDays: 1 })
    expect(week.points).toHaveLength(6)
    expect(week.points[0].day).toBe(today - 6 * DAY)
    const month = trendRange(series, today - 29 * DAY, today)
    expect(month).toMatchObject({ requestedDays: 30, missingDays: 1 })
    expect(month.points).toHaveLength(29)
  })

  it('never fills in days the source has no data for', () => {
    const r = trendRange([], today - 6 * DAY, today)
    expect(r).toMatchObject({ requestedDays: 7, missingDays: 7, points: [] })
  })
})
