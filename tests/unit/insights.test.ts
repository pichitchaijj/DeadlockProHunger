import { describe, expect, it } from 'vitest'
import { compareGroups } from '@/lib/analytics/compare'
import {
  highPerformingBuild,
  itemTrend,
  nonDescriptiveTerms,
  pairing,
  patchShift,
  popularBuild,
  rankInsights,
  rankPopularity,
  splitPerformance,
  winRateShift,
  type Insight,
} from '@/lib/analytics/insights'
import type { ScopeRef } from '@/lib/analytics/scope'
import { english } from './helpers/insightEnglish'

/* Synthetic inputs only. Generators return facts; `english()` words them as the English pages do. */
const scope: ScopeRef = { window: { kind: 'days', days: 30 }, rank: { kind: 'all' } } // "Last 30 days, All ranks"

describe('winRateShift', () => {
  it('reports a rise with its change in percentage points', () => {
    const i = winRateShift({ subject: 'Haze', current: { wins: 5_520, matches: 10_000 }, previous: { wins: 5_280, matches: 10_000 }, scope })
    expect(i?.kind).toBe('rising')
    expect(english(i!).statement).toBe('Haze’s win rate increased 2.4 percentage points, from 52.8% in the 7 days before to 55.2% in the last 7 days.')
    expect(english(i!).value).toBe('+2.4pp')
  })

  it('says nothing when intervals overlap, a window is Low sample, or the gap is under 1pp', () => {
    expect(winRateShift({ subject: 'H', current: { wins: 520, matches: 1_000 }, previous: { wins: 500, matches: 1_000 }, scope })).toBeNull()
    expect(winRateShift({ subject: 'H', current: { wins: 150, matches: 150 }, previous: { wins: 50, matches: 150 }, scope })).toBeNull()
    // Six-figure samples make a 0.5pp gap statistically separate; it still isn't reported.
    expect(winRateShift({ subject: 'H', current: { wins: 2_525_000, matches: 5_000_000 }, previous: { wins: 2_500_000, matches: 5_000_000 }, scope })).toBeNull()
  })
})

describe('patchShift', () => {
  it('describes timing only, with a caveat', () => {
    const i = patchShift({ subject: 'H', patch: 'Oct 3', before: { wins: 5_000, matches: 10_000 }, after: { wins: 4_700, matches: 10_000 }, scope })
    expect(english(i!).statement).toContain('lower in the days after the “Oct 3” update')
    expect(english(i!).caveat).toMatch(/timing only/)
  })
})

describe('pairing', () => {
  it('states positive and negative matchups in the selected dataset', () => {
    expect(english(pairing({ subject: 'H', other: 'Haze', wins: 600, matches: 1_000, relation: 'lane', scope })!).statement).toBe(
      'Shows a positive matchup against Haze in lane in the selected dataset: 60.0% won over 1,000 lane matchups.',
    )
    expect(pairing({ subject: 'H', other: 'Haze', wins: 400, matches: 1_000, relation: 'any', scope })?.kind).toBe('weak-matchup')
    expect(pairing({ subject: 'H', other: 'Haze', wins: 510, matches: 1_000, relation: 'lane', scope })).toBeNull()
    expect(pairing({ subject: 'H', other: 'Haze', wins: 150, matches: 199, relation: 'lane', scope })).toBeNull()
    expect(pairing({ subject: 'H', other: 'Haze', wins: 400, matches: 1_000, relation: 'ally', scope })).toBeNull()
  })
})

describe('builds', () => {
  const builds = [
    { name: 'Gun', wins: 600, matches: 1_000 },
    { name: 'Spirit', wins: 1_550, matches: 3_000 },
    { name: 'Tiny', wins: 90, matches: 100 },
  ]
  it('names the most-selected tracked build with its share', () => {
    const i = popularBuild({ subject: 'H', builds, scope })
    expect(english(i!).value).toBe('Spirit')
    expect(english(i!).statement).toBe('“Spirit” was selected at game start in 3,000 H matches, 73.2% of matches using a tracked build.')
  })
  it('calls a build high-performing only when its interval clears the hero win rate, ignoring Low samples', () => {
    expect(english(highPerformingBuild({ subject: 'H', heroWinRate: 0.52, builds, scope })!).value).toBe('Gun')
    expect(highPerformingBuild({ subject: 'H', heroWinRate: 0.6, builds, scope })).toBeNull()
  })
})

describe('itemTrend', () => {
  const week = (buyers: number) => ({ buyers, heroMatches: 10_000 })
  it('reports the largest separate buy-rate change of 3pp or more', () => {
    const i = itemTrend({
      subject: 'H',
      items: [
        { name: 'Small', current: week(2_100), previous: week(2_000) },
        { name: 'Big', current: week(2_300), previous: week(1_500) },
      ],
      scope,
    })
    expect(english(i!).value).toBe('Big')
    expect(english(i!).statement).toBe('Big was bought in 23.0% of H matches in the last 7 days, up from 15.0% in the 7 days before.')
  })
  it('needs 200 buyers in both weeks', () => {
    expect(itemTrend({ subject: 'H', items: [{ name: 'Rare', current: week(900), previous: week(150) }], scope })).toBeNull()
  })
})

describe('rank splits', () => {
  it('reports rank-specific performance only when the groups separate', () => {
    const clear = compareGroups([{ key: 'low', label: 'Initiate–Seeker', wins: 4_800, matches: 10_000 }, { key: 'top', label: 'Ascendant+', wins: 5_400, matches: 10_000 }])
    expect(english(splitPerformance({ subject: 'H', by: 'rank', comparison: clear, scope })!).value).toBe('Ascendant+')
    const close = compareGroups([{ key: 'low', label: 'A', wins: 500, matches: 1_000 }, { key: 'top', label: 'B', wins: 510, matches: 1_000 }])
    expect(splitPerformance({ subject: 'H', by: 'rank', comparison: close, scope })).toBeNull()
  })

  it('says "frequently picked" when a band picks the hero 1.5× more often', () => {
    const i = rankPopularity({
      subject: 'H',
      bands: [
        { label: 'Initiate–Seeker', heroMatches: 1_000, allHeroMatches: 120_000 }, // 10% of 10,000 matches
        { label: 'Ascendant+', heroMatches: 4_000, allHeroMatches: 120_000 }, // 40% vs 25% overall
      ],
      scope,
    })
    expect(english(i!).statement).toBe('Frequently picked by Ascendant+ players: in 40.0% of Ascendant+ matches, vs 25.0% across all ranks.')
    expect(rankPopularity({ subject: 'H', bands: [{ label: 'A', heroMatches: 1_000, allHeroMatches: 120_000 }, { label: 'B', heroMatches: 1_100, allHeroMatches: 120_000 }], scope })).toBeNull()
  })
})

describe('every insight', () => {
  const all: Insight[] = rankInsights([
    winRateShift({ subject: 'H', current: { wins: 5_520, matches: 10_000 }, previous: { wins: 5_280, matches: 10_000 }, scope }),
    winRateShift({ subject: 'H', current: { wins: 5_000, matches: 10_000 }, previous: { wins: 5_400, matches: 10_000 }, scope }),
    patchShift({ subject: 'H', patch: 'P', before: { wins: 5_000, matches: 10_000 }, after: { wins: 5_400, matches: 10_000 }, scope }),
    pairing({ subject: 'H', other: 'X', wins: 600, matches: 1_000, relation: 'lane', scope }),
    pairing({ subject: 'H', other: 'X', wins: 400, matches: 1_000, relation: 'lane', scope }),
    pairing({ subject: 'H', other: 'X', wins: 600, matches: 1_000, relation: 'ally', scope }),
    popularBuild({ subject: 'H', builds: [{ name: 'Best build ever', wins: 600, matches: 1_000 }], scope }),
    highPerformingBuild({ subject: 'H', heroWinRate: 0.5, builds: [{ name: 'B', wins: 600, matches: 1_000 }], scope }),
    itemTrend({ subject: 'H', items: [{ name: 'I', current: { buyers: 2_300, heroMatches: 10_000 }, previous: { buyers: 1_500, heroMatches: 10_000 } }], scope }),
    splitPerformance({ subject: 'H', by: 'length', comparison: compareGroups([{ key: 'short', label: 'Under 25 min', wins: 4_800, matches: 10_000 }, { key: 'long', label: 'Over 35 min', wins: 5_400, matches: 10_000 }]), scope }),
    rankPopularity({ subject: 'H', bands: [{ label: 'A', heroMatches: 1_000, allHeroMatches: 120_000 }, { label: 'B', heroMatches: 4_000, allHeroMatches: 120_000 }], scope }),
  ])

  it('covers every generator', () => {
    expect(all).toHaveLength(11)
    expect(all[0].kind).toBe('rising')
  })

  it.each(all.map((i) => [i.kind, i] as const))('%s is traceable, scoped and descriptive', (_, insight) => {
    const text = english(insight)
    expect(text.metrics.length).toBeGreaterThan(0)
    expect(text.rule.length).toBeGreaterThan(0)
    expect(text.context).toMatch(/^Last 30 days, All ranks · [\d,]+ matches \((Moderate|High) sample\)$/)
    expect(insight.sample).not.toBe('low')
    expect(nonDescriptiveTerms(text)).toEqual([])
  })

  it('keeps the facts: order, ids, kinds, tones and samples (no wording involved)', () => {
    expect(all.map((i) => [i.id, i.kind, i.tone, i.sampleSize, i.sample])).toEqual([
      ['rising', 'rising', 'positive', 10_000, 'high'],
      ['falling', 'falling', 'negative', 10_000, 'high'],
      ['recent-shift', 'recent-shift', 'neutral', 10_000, 'high'],
      ['rank-popularity', 'rank-popularity', 'neutral', 4_000, 'high'],
      ['length-performance', 'length-performance', 'neutral', 10_000, 'high'],
      ['high-performing-build', 'high-performing-build', 'positive', 1_000, 'moderate'],
      ['strong-matchup', 'strong-matchup', 'positive', 1_000, 'moderate'],
      ['weak-matchup', 'weak-matchup', 'negative', 1_000, 'moderate'],
      ['item-trend', 'item-trend', 'neutral', 10_000, 'high'],
      ['strong-synergy', 'strong-synergy', 'positive', 1_000, 'moderate'],
      ['popular-build', 'popular-build', 'neutral', 1_000, 'moderate'],
    ])
  })

  it('keeps the numbers behind each insight', () => {
    const byKind = Object.fromEntries(all.map((i) => [i.kind, i]))
    expect(byKind.rising).toMatchObject({ subject: 'H', current: { wins: 5_520, matches: 10_000, winRate: 0.552 }, previous: { wins: 5_280, matches: 10_000, winRate: 0.528 } })
    expect((byKind.rising as Extract<Insight, { kind: 'rising' | 'falling' }>).delta).toBeCloseTo(0.024)
    expect(byKind['recent-shift']).toMatchObject({ patch: 'P', direction: 'rising', before: { winRate: 0.5 }, after: { winRate: 0.54 } })
    expect(byKind['strong-matchup']).toMatchObject({ other: 'X', relation: 'lane', winRate: 0.6, matches: 1_000 })
    expect(byKind['strong-synergy']).toMatchObject({ other: 'X', relation: 'ally', winRate: 0.6, matches: 1_000 })
    expect(byKind['popular-build']).toMatchObject({ build: 'Best build ever', buildMatches: 1_000, buildWinRate: 0.6, share: 1, total: 1_000, builds: 1 })
    expect(byKind['high-performing-build']).toMatchObject({ build: 'B', buildRecord: { wins: 600, matches: 1_000, winRate: 0.6 }, heroWinRate: 0.5 })
    expect(byKind['item-trend']).toMatchObject({ item: 'I', current: { buyers: 2_300, share: 0.23 }, previous: { buyers: 1_500, share: 0.15 } })
    expect(byKind['length-performance']).toMatchObject({ best: { key: 'long', winRate: 0.54 }, worst: { key: 'short', winRate: 0.48 } })
    expect(byKind['rank-popularity']).toMatchObject({ band: 'B', pick: 0.4, overall: 0.25, bandHeroMatches: 4_000, bandMatches: 10_000, heroAll: 5_000, matchesAll: 20_000 })
    expect((byKind['rank-popularity'] as Extract<Insight, { kind: 'rank-popularity' }>).ratio).toBeCloseTo(1.6)
  })

  it('flags causal, judging and prescriptive wording', () => {
    const terms = (statement: string) => nonDescriptiveTerms({ title: '', statement })
    expect(terms('This hero is broken.')).toEqual(['broken'])
    expect(terms('Everyone should play this.')).toEqual(['should', 'Everyone'])
    expect(terms('This item causes wins.')).toEqual(['causes'])
    expect(terms('“Best build ever” was selected in 1,000 matches.')).toEqual([])
  })
})
