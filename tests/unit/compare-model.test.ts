import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'
import en from '@/i18n/messages/en'
import { clearlyHigher, differenceText, groupDifferences, ratioDifference, rateDifference, type Difference, type Rate } from '@/features/compare/model'
import { wilsonInterval } from '@/lib/analytics/wilson'
import { sampleTier } from '@/lib/analytics/sampleTier'
import { formatCompact, formatInteger, formatPercent } from '@/lib/format'

/* Synthetic inputs only. */
const rate = (wins: number, matches: number): Rate => ({ winRate: wins / matches, interval: wilsonInterval(wins, matches), matches, sample: sampleTier(matches) })

const t = createTranslator({ locale: 'en', messages: en, namespace: 'compare.differences' })
const lengths = createTranslator({ locale: 'en', messages: en, namespace: 'heroes.parts.lengths' })
/** English wording, as the Compare page renders it. */
const words = (d: Difference) =>
  differenceText(d, (key, values) => t(key as 'winRate', values), {
    percent: (v) => formatPercent(v),
    integer: (v) => formatInteger(v),
    compact: (v) => formatCompact(v),
    groupLabel: (group, key, label) => (group === 'length' ? lengths(key as 'short') : label),
  })
const short = { kind: 'length', key: 'short', label: 'Under 25 min' } as const

describe('clearlyHigher', () => {
  it('needs non-overlapping intervals', () => {
    expect(clearlyHigher(rate(5_600, 10_000), rate(5_000, 10_000))).toBe('a')
    expect(clearlyHigher(rate(5_020, 10_000), rate(5_000, 10_000))).toBeNull()
    expect(clearlyHigher(rate(4_500, 10_000), rate(5_000, 10_000))).toBe('b')
  })

  it('never decides from a low sample, however extreme', () => {
    expect(clearlyHigher(rate(150, 150), rate(5_000, 10_000))).toBeNull()
  })
})

describe('statements', () => {
  it('describes what was measured, with numbers', () => {
    const d = rateDifference(short, rate(5_600, 10_000), rate(5_000, 10_000))!
    expect(d.side).toBe('a')
    expect(words(d)).toEqual({ text: 'Higher win rate in matches under 25 min', detail: '56.0% vs 50.0% (intervals don’t overlap; n = 10,000 vs 10,000)' })
  })

  it('states ratio differences only past the threshold', () => {
    expect(ratioDifference('pickRate', 30, 10)?.side).toBe('a')
    expect(ratioDifference('pickRate', 12, 10)).toBeNull()
  })

  it('merges several separated groups into one statement per side', () => {
    const diffs = groupDifferences(
      [
        { key: 'short', label: 'Under 25 min', a: rate(5_600, 10_000), b: rate(5_000, 10_000) },
        { key: 'long', label: 'Over 35 min', a: rate(5_700, 10_000), b: rate(5_000, 10_000) },
      ],
      'length',
    )
    expect(diffs).toHaveLength(1)
    expect(words(diffs[0]).text).toBe('Higher win rate in all 2 match lengths')
  })

  it('keeps only separated groups', () => {
    const diffs = groupDifferences(
      [
        { key: 'short', label: 'Under 25 min', a: rate(5_600, 10_000), b: rate(5_000, 10_000) },
        { key: 'long', label: 'Over 35 min', a: rate(5_000, 10_000), b: rate(5_010, 10_000) },
        { key: 'standard', label: '25–35 min', a: null, b: rate(5_000, 10_000) },
      ],
      'length',
    )
    expect(diffs.map((d) => words(d).text)).toEqual(['Higher win rate in matches under 25 min'])
  })
})
