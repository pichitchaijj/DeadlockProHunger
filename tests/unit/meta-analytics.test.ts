import { describe, expect, it } from 'vitest'
import { pickRates, estimatedMatchCount } from '@/lib/analytics/pickRate'
import { badgeRange, rankBand, rankBandLabel } from '@/lib/analytics/rankBands'
import { tierFor } from '@/lib/analytics/tiers'
import { trendBetween } from '@/lib/analytics/trend'
import { patchDateFromTitle } from '@/lib/deadlock/patchDate'

describe('rank bands', () => {
  it('maps tiers to badge ranges covering all subranks', () => {
    expect(badgeRange(rankBand('high'))).toEqual({ min: 81, max: 96 })
    expect(badgeRange(rankBand('top'))).toEqual({ min: 101, max: 116 })
    expect(badgeRange(rankBand('all'))).toBeNull()
  })

  it('falls back to all ranks for unknown ids', () => {
    expect(rankBand('nonsense').id).toBe('all')
  })

  it('labels bands with tier names', () => {
    const names = new Map([
      [8, 'Oracle'],
      [9, 'Phantom'],
    ])
    expect(rankBandLabel(rankBand('high'), names)).toBe('Oracle – Phantom')
    expect(rankBandLabel(rankBand('all'), names)).toBe('All ranks')
  })
})

describe('tierFor', () => {
  it('gives no tier to low samples, however extreme', () => {
    expect(tierFor(150, 150)).toBeNull()
  })

  it('places heroes by interval position', () => {
    expect(tierFor(5_600, 10_000)).toBe('S') // 56%, interval ≈ 55.0–57.0
    expect(tierFor(5_150, 10_000)).toBe('A') // 51.5%, interval ≈ 50.5–52.5
    expect(tierFor(5_000, 10_000)).toBe('B')
    expect(tierFor(4_800, 10_000)).toBe('C') // 48%, interval ≈ 47.0–49.0
  })

  it('keeps a moderate-sample 55% at B when the interval still includes 50%', () => {
    expect(tierFor(165, 300)).toBe('B') // 55%, interval ≈ 49.3–60.5
  })
})

describe('trendBetween', () => {
  it('reports rising only when intervals do not overlap', () => {
    expect(trendBetween({ wins: 5_400, matches: 10_000 }, { wins: 5_000, matches: 10_000 })?.direction).toBe('rising')
    expect(trendBetween({ wins: 5_050, matches: 10_000 }, { wins: 5_000, matches: 10_000 })?.direction).toBe('stable')
    expect(trendBetween({ wins: 4_600, matches: 10_000 }, { wins: 5_000, matches: 10_000 })?.direction).toBe('falling')
  })

  it('refuses to compute a trend from a low-sample window', () => {
    expect(trendBetween({ wins: 100, matches: 150 }, { wins: 5_000, matches: 10_000 })).toBeNull()
  })

  it('reports the delta as current minus previous', () => {
    expect(trendBetween({ wins: 5_400, matches: 10_000 }, { wins: 5_000, matches: 10_000 })?.delta).toBeCloseTo(0.04)
  })
})

describe('pickRates', () => {
  it('uses Σ matches ÷ 12 as the match count', () => {
    const matches = new Map([
      [1, 600],
      [2, 300],
      [3, 300],
    ]) // 1,200 hero-slots → 100 matches
    expect(estimatedMatchCount(matches)).toBe(100)
    expect(pickRates(matches).get(1)).toBeCloseTo(6)
    expect(pickRates(matches).get(2)).toBeCloseTo(3)
  })
})

describe('patchDateFromTitle', () => {
  it('parses MM-DD-YYYY from forum titles', () => {
    expect(patchDateFromTitle('09-29-2026')).toBe(Date.UTC(2026, 8, 29))
    expect(patchDateFromTitle('09-16-2026 Update')).toBe(Date.UTC(2026, 8, 16))
  })

  it('finds the date anywhere in the title', () => {
    expect(patchDateFromTitle(' Minor Update - 10-05-2026')).toBe(Date.UTC(2026, 9, 5))
  })

  it('rejects titles without a valid date', () => {
    expect(patchDateFromTitle('Hero Labs')).toBeNull()
    expect(patchDateFromTitle('13-40-2026')).toBeNull()
  })
})
