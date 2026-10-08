import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'
import en from '@/i18n/messages/en'
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
  type PurchasePhaseKey,
} from '@/lib/analytics/insights'
import { insightText, type InsightFormat } from '@/lib/analytics/insightText'
import { purchasePhases, purchaseTimingInsight, standoutPhase } from '@/features/items/model'
import { formatInteger, formatPercent, formatPointDelta } from '@/lib/format'
import type { ScopeRef } from '@/lib/analytics/scope'
import { englishScope } from './helpers/scopeEnglish'
import * as v1 from './legacy/insightsV1'

/*
 * The Insight Engine now returns facts and words them from the catalog (insights.*). The regression oracle is
 * the pre-localization engine itself, kept verbatim in ./legacy/insightsV1.ts: every case runs the same inputs
 * through both, and the English formatter must reproduce the old strings exactly while the identity fields
 * (id, kind, tone, sample size and tier) stay the same.
 */

const t = createTranslator({ locale: 'en', messages: en, namespace: 'insights' })
const data = createTranslator({ locale: 'en', messages: en, namespace: 'data' })
const lengths = createTranslator({ locale: 'en', messages: en, namespace: 'heroes.parts.lengths' })
const phases = createTranslator({ locale: 'en', messages: en, namespace: 'items.phases' })
const PHASE_KEYS = { early: 'early', mid: 'mid', late: 'late', 'very-late': 'veryLate' } as const satisfies Record<PurchasePhaseKey, string>

/** The English formatters, as the pages pass them. */
const format: InsightFormat = {
  percent: (v) => formatPercent(v),
  delta: (v) => formatPointDelta(v),
  integer: (v) => formatInteger(v, 'en'),
  sample: (tier) => data(`sample.${tier}`),
  length: (key) => lengths(key as 'short'),
  phase: (key) => ({ label: phases(PHASE_KEYS[key]), range: phases(`${PHASE_KEYS[key]}Range`) }),
  scope: (s) => englishScope.scope(s),
}
const words = (i: Insight) => insightText(i, (key, values) => t(key as 'card.why', values), format)

/** Old and new agree: both absent, or same identity and the same English text in every field. */
function expectSame(old: v1.Insight | null | undefined, next: Insight | null | undefined) {
  if (!old || !next) {
    expect(next ?? null).toBe(old ?? null)
    return
  }
  expect({ id: next.id, kind: next.kind, tone: next.tone, sampleSize: next.sampleSize, sample: next.sample }).toEqual({ id: old.id, kind: old.kind, tone: old.tone, sampleSize: old.sampleSize, sample: old.sample })
  const text = words(next)
  expect({ title: text.title, value: text.value, statement: text.statement, rule: text.rule, caveat: text.caveat, context: text.context }).toEqual({
    title: old.title,
    value: old.value,
    statement: old.statement,
    rule: old.rule,
    caveat: old.caveat,
    context: old.context,
  })
  expect(text.metrics.map(({ label, value }) => ({ label, value }))).toEqual(old.metrics)
  // Metric ids are the React keys: unique within a card whatever the language.
  expect(new Set(text.metrics.map((m) => m.id)).size).toBe(text.metrics.length)
}

const scope = 'Last 30 days, All ranks'
/** The same scope as a value: the new engine words it through the shared scope formatter. */
const ref: ScopeRef = { window: { kind: 'days', days: 30 }, rank: { kind: 'all' } }
const weeks = { currentLabel: 'The last 7 days', previousLabel: 'The 7 days before' }
const seen = new Set<string>()
const check = (old: v1.Insight | null, next: Insight | null) => {
  expectSame(old, next)
  if (next) seen.add(next.kind)
}

describe('Insight Engine English wording matches the original engine', () => {
  it('winRateShift: rising, falling, and the cases that say nothing', () => {
    for (const [current, previous] of [
      [{ wins: 5_520, matches: 10_000 }, { wins: 5_280, matches: 10_000 }], // rising, Moderate/High
      [{ wins: 5_000, matches: 10_000 }, { wins: 5_400, matches: 10_000 }], // falling
      [{ wins: 690_123, matches: 1_234_567 }, { wins: 640_000, matches: 1_200_001 }], // large numbers
      [{ wins: 160, matches: 300 }, { wins: 120, matches: 300 }], // Moderate sample
      [{ wins: 5_020, matches: 10_000 }, { wins: 5_000, matches: 10_000 }], // overlap → null
      [{ wins: 100, matches: 150 }, { wins: 50, matches: 150 }], // Low sample → null
    ] as const) {
      check(v1.winRateShift({ subject: 'Haze', current, previous, ...weeks, scope }), winRateShift({ subject: 'Haze', current, previous, scope: ref }))
    }
  })

  it('patchShift: higher and lower after the patch', () => {
    for (const [before, after] of [
      [{ wins: 5_000, matches: 10_000 }, { wins: 5_400, matches: 10_000 }],
      [{ wins: 5_400, matches: 10_000 }, { wins: 5_000, matches: 10_000 }],
      [{ wins: 5_000, matches: 10_000 }, { wins: 5_010, matches: 10_000 }], // no change → null
    ] as const) {
      check(v1.patchShift({ subject: 'Lady Geist', patch: 'Oct 3', before, after, scope }), patchShift({ subject: 'Lady Geist', patch: 'Oct 3', before, after, scope: ref }))
    }
  })

  it('pairing: lane / any / ally, positive and negative, and the ones that return null', () => {
    for (const relation of ['lane', 'any', 'ally'] as const) {
      for (const [wins, matches] of [[600, 1_000], [400, 1_000], [56_789, 100_000], [505, 1_000], [130, 199]]) {
        const input = { subject: 'Abrams', other: 'Mo & Krill', wins, matches, relation, scope }
        check(v1.pairing(input), pairing({ ...input, scope: ref }))
      }
    }
    // Ally with a negative result is never reported.
    expect(pairing({ subject: 'A', other: 'B', wins: 400, matches: 1_000, relation: 'ally', scope: ref })).toBeNull()
  })

  it('builds: most-selected (one build and several) and high-performing', () => {
    for (const builds of [
      [{ name: 'Spirit “Best” Haze', wins: 1_650, matches: 3_000 }],
      [{ name: 'Spirit', wins: 1_650, matches: 3_000 }, { name: 'Gun', wins: 620, matches: 1_000 }, { name: 'Tiny', wins: 50, matches: 100 }],
      [{ name: 'Few', wins: 60, matches: 120 }], // Low sample → null
    ]) {
      check(v1.popularBuild({ subject: 'Haze', builds, scope }), popularBuild({ subject: 'Haze', builds, scope: ref }))
      for (const heroWinRate of [0.5, 0.52, 0.6]) {
        check(v1.highPerformingBuild({ subject: 'Haze', heroWinRate, builds, scope }), highPerformingBuild({ subject: 'Haze', heroWinRate, builds, scope: ref }))
      }
    }
  })

  it('itemTrend: bought more, bought less, and nothing to report', () => {
    for (const items of [
      [{ name: 'Big', current: { buyers: 2_300, heroMatches: 10_000 }, previous: { buyers: 1_500, heroMatches: 10_000 } }],
      [{ name: 'Fading', current: { buyers: 1_000, heroMatches: 10_000 }, previous: { buyers: 1_600, heroMatches: 10_000 } }],
      [{ name: 'Huge', current: { buyers: 412_345, heroMatches: 1_000_000 }, previous: { buyers: 300_000, heroMatches: 1_100_000 } }],
      [{ name: 'Flat', current: { buyers: 1_500, heroMatches: 10_000 }, previous: { buyers: 1_480, heroMatches: 10_000 } }],
    ]) {
      check(v1.itemTrend({ subject: 'Haze', items, ...weeks, scope }), itemTrend({ subject: 'Haze', items, scope: ref }))
    }
  })

  it('splitPerformance: rank (with caveat) and length (without), including Low-sample and empty groups', () => {
    const rank = compareGroups([
      { key: 'low', label: 'Initiate – Seeker', wins: 4_800, matches: 10_000 },
      { key: 'mid', label: 'Alchemist – Arcanist', wins: 5_000, matches: 10_000 },
      { key: 'top', label: 'Ascendant+', wins: 90, matches: 150 }, // Low sample, not compared
      { key: 'high', label: 'Ritualist – Emissary', wins: 5_400, matches: 10_000 },
    ])
    const length = compareGroups([
      { key: 'short', label: 'Under 25 min', wins: 5_400, matches: 10_000 },
      { key: 'standard', label: '25–35 min', wins: 0, matches: 0 }, // no matches at all
      { key: 'long', label: 'Over 35 min', wins: 4_800, matches: 10_000 },
    ])
    const lengthReversed = compareGroups([
      { key: 'short', label: 'Under 25 min', wins: 4_700, matches: 20_000 },
      { key: 'standard', label: '25–35 min', wins: 25_100, matches: 50_000 },
      { key: 'long', label: 'Over 35 min', wins: 5_600, matches: 10_000 },
    ])
    for (const [by, comparison] of [['rank', rank], ['length', length], ['length', lengthReversed], ['rank', compareGroups([])]] as const) {
      check(v1.splitPerformance({ subject: 'Haze', by, comparison, scope }), splitPerformance({ subject: 'Haze', by, comparison, scope: ref }))
    }
  })

  it('rankPopularity: frequently picked in one band, and not', () => {
    for (const bands of [
      [{ label: 'A', heroMatches: 1_000, allHeroMatches: 120_000 }, { label: 'Oracle – Phantom', heroMatches: 4_000, allHeroMatches: 120_000 }],
      [{ label: 'A', heroMatches: 1_000, allHeroMatches: 120_000 }, { label: 'B', heroMatches: 1_100, allHeroMatches: 120_000 }],
    ]) {
      check(v1.rankPopularity({ subject: 'Haze', bands, scope }), rankPopularity({ subject: 'Haze', bands, scope: ref }))
    }
  })

  it('purchase timing: every phase as the standout, with and without missing phases', () => {
    const node = (column: number, wins: number, matches: number, adjustedWinRate: number) => ({ column, wins, matches, adjustedWinRate })
    const cases = [
      [node(0, 5_800, 10_000, 0.57), node(1, 50_000, 100_000, 0.5), node(2, 20_000, 40_000, 0.5), node(3, 4_800, 10_000, 0.49)], // early
      [node(0, 25_000, 50_000, 0.5), node(1, 61_000, 100_000, 0.6)], // mid; late and very late missing
      [node(1, 50_000, 100_000, 0.5), node(2, 23_400, 40_000, 0.57)], // late; early missing
      [node(0, 50_000, 100_000, 0.5), node(1, 26_000, 50_000, 0.505), node(3, 5_600, 10_000, 0.54)], // very late
      [node(0, 50_000, 100_000, 0.5), node(3, 5_600, 10_000, 0.505)], // lead gone after adjustment → no standout
    ]
    const standouts: string[] = []
    for (const nodes of cases) {
      const rows = purchasePhases(nodes)
      const standout = standoutPhase(rows)
      if (!standout) continue
      standouts.push(standout.phase.key)
      const scopes: Array<[string, ScopeRef]> = [
        ['Last 7 days, All ranks', { window: { kind: 'days', days: 7 }, rank: { kind: 'all' } }],
        [
          'Current patch (since Sep 29), Oracle – Phantom',
          { window: { kind: 'patch', since: Date.UTC(2026, 8, 29) / 1000 }, rank: { kind: 'band', from: { tier: 8, name: 'Oracle' }, to: { tier: 9, name: 'Phantom' } } },
        ],
        ['Last 7 days, All ranks · Ranked only · Haze players', { window: { kind: 'days', days: 7 }, rank: { kind: 'all' }, ranked: true, hero: 'Haze' }],
      ]
      for (const [text, value] of scopes) {
        check(v1.purchaseTimingInsight('Rapid Rounds', standout, rows, text), purchaseTimingInsight('Rapid Rounds', standout, rows, value))
      }
    }
    expect(standouts).toEqual(['early', 'mid', 'late', 'very-late'])
  })

  it('ranks the same insights in the same order', () => {
    const inputs = () => ({
      weekly: { current: { wins: 5_520, matches: 10_000 }, previous: { wins: 5_280, matches: 10_000 } },
      build: [{ name: 'B', wins: 600, matches: 1_000 }],
    })
    const { weekly, build } = inputs()
    const olds = v1.rankInsights([
      v1.pairing({ subject: 'H', other: 'X', wins: 600, matches: 1_000, relation: 'ally', scope }),
      v1.popularBuild({ subject: 'H', builds: build, scope }),
      v1.winRateShift({ subject: 'H', ...weekly, ...weeks, scope }),
      v1.pairing({ subject: 'H', other: 'X', wins: 400, matches: 1_000, relation: 'lane', scope }),
      v1.highPerformingBuild({ subject: 'H', heroWinRate: 0.5, builds: build, scope }),
      null,
    ])
    const news = rankInsights([
      pairing({ subject: 'H', other: 'X', wins: 600, matches: 1_000, relation: 'ally', scope: ref }),
      popularBuild({ subject: 'H', builds: build, scope: ref }),
      winRateShift({ subject: 'H', ...weekly, scope: ref }),
      pairing({ subject: 'H', other: 'X', wins: 400, matches: 1_000, relation: 'lane', scope: ref }),
      highPerformingBuild({ subject: 'H', heroWinRate: 0.5, builds: build, scope: ref }),
      null,
    ])
    expect(news.map((i) => i.id)).toEqual(olds.map((i) => i.id))
    news.forEach((n, k) => expectSame(olds[k], n))
  })

  it('covered every kind', () => {
    expect([...seen].sort()).toEqual(
      ['falling', 'high-performing-build', 'item-trend', 'length-performance', 'popular-build', 'purchase-timing', 'rank-performance', 'rank-popularity', 'recent-shift', 'rising', 'strong-matchup', 'strong-synergy', 'weak-matchup'],
    )
  })
})

describe('Insight UI text', () => {
  it('keeps the card and grid wording', () => {
    expect([t('card.why'), t('card.hide'), t('card.rule')]).toEqual(['Why?', 'Hide explanation', 'Rule:'])
    expect(t('grid.titleStrong', { hero: 'Haze' })).toBe('Why is Haze strong?')
    expect(t('grid.title', { hero: 'Haze' })).toBe('What the data says about Haze')
    const intro = 'Measured results from public match data. Each shows only when it passes its rule; open “Why?” for the numbers behind it.'
    expect(t('grid.intro', { strong: 'no' })).toBe(intro)
    expect(t('grid.intro', { strong: 'yes' })).toBe(`${intro} They show where the wins come from, not why the hero is designed that way.`)
    expect(t('grid.empty')).toBe('No result clears its sample and confidence rules in this scope yet. Try a longer window or a broader rank band.')
  })

  it('English insight wording stays descriptive (no cause, judgment or instruction)', () => {
    const all = rankInsights([
      winRateShift({ subject: 'H', current: { wins: 5_520, matches: 10_000 }, previous: { wins: 5_280, matches: 10_000 }, scope: ref }),
      patchShift({ subject: 'H', patch: 'P', before: { wins: 5_000, matches: 10_000 }, after: { wins: 5_400, matches: 10_000 }, scope: ref }),
      pairing({ subject: 'H', other: 'X', wins: 400, matches: 1_000, relation: 'any', scope: ref }),
      popularBuild({ subject: 'H', builds: [{ name: 'Best build ever', wins: 600, matches: 1_000 }], scope: ref }),
    ])
    expect(all).toHaveLength(4)
    for (const i of all) expect(nonDescriptiveTerms(words(i))).toEqual([])
  })
})
