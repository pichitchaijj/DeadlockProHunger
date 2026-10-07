import { describe, expect, it } from 'vitest'
import { clearlyHigher, groupDifferences, ratioDifference, rateDifference, type Rate } from '@/features/compare/model'
import { wilsonInterval } from '@/lib/analytics/wilson'
import { sampleTier } from '@/lib/analytics/sampleTier'

/* Synthetic inputs only. */
const rate = (wins: number, matches: number): Rate => ({ winRate: wins / matches, interval: wilsonInterval(wins, matches), matches, sample: sampleTier(matches) })

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
    const d = rateDifference('in matches under 25 min', rate(5_600, 10_000), rate(5_000, 10_000))
    expect(d).toEqual({ side: 'a', text: 'Higher win rate in matches under 25 min', detail: '56.0% vs 50.0% (intervals don’t overlap; n = 10,000 vs 10,000)' })
  })

  it('states ratio differences only past the threshold', () => {
    const pct = (v: number) => `${v}`
    expect(ratioDifference('Picked more often', 30, 10, pct)?.side).toBe('a')
    expect(ratioDifference('Picked more often', 12, 10, pct)).toBeNull()
  })

  it('merges several separated groups into one statement per side', () => {
    const diffs = groupDifferences(
      [
        { key: 's', label: 'Under 25 min', a: rate(5_600, 10_000), b: rate(5_000, 10_000) },
        { key: 'l', label: 'Over 35 min', a: rate(5_700, 10_000), b: rate(5_000, 10_000) },
      ],
      (l) => `in matches ${l.toLowerCase()}`,
      'match lengths',
    )
    expect(diffs).toHaveLength(1)
    expect(diffs[0].text).toBe('Higher win rate in all 2 match lengths')
  })

  it('keeps only separated groups', () => {
    const diffs = groupDifferences(
      [
        { key: 's', label: 'Under 25 min', a: rate(5_600, 10_000), b: rate(5_000, 10_000) },
        { key: 'l', label: 'Over 35 min', a: rate(5_000, 10_000), b: rate(5_010, 10_000) },
        { key: 'x', label: 'Top', a: null, b: rate(5_000, 10_000) },
      ],
      (l) => `in matches ${l.toLowerCase()}`,
      'match lengths',
    )
    expect(diffs.map((d) => d.text)).toEqual(['Higher win rate in matches under 25 min'])
  })
})
