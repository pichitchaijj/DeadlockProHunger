import { describe, expect, it } from 'vitest'
import { sampleTier } from '@/lib/analytics/sampleTier'
import { wilsonInterval } from '@/lib/analytics/wilson'

describe('sampleTier', () => {
  it('uses the documented thresholds', () => {
    expect(sampleTier(0)).toBe('low')
    expect(sampleTier(199)).toBe('low')
    expect(sampleTier(200)).toBe('moderate')
    expect(sampleTier(1000)).toBe('moderate')
    expect(sampleTier(1001)).toBe('high')
  })
})

describe('wilsonInterval', () => {
  it('matches the reference value for 50/100', () => {
    const { low, high } = wilsonInterval(50, 100)
    expect(low).toBeCloseTo(0.4038, 4)
    expect(high).toBeCloseTo(0.5962, 4)
  })

  it('stays within [0, 1] at the extremes', () => {
    expect(wilsonInterval(0, 10).low).toBe(0)
    expect(wilsonInterval(10, 10).high).toBe(1)
  })

  it('narrows as the sample grows', () => {
    const small = wilsonInterval(52, 100)
    const large = wilsonInterval(5200, 10000)
    expect(large.high - large.low).toBeLessThan(small.high - small.low)
  })

  it('returns the full range with no matches', () => {
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 1 })
  })
})

describe('sampleTier (player scale)', () => {
  it('uses smaller thresholds for individual players', () => {
    expect(sampleTier(19, 'player')).toBe('low')
    expect(sampleTier(20, 'player')).toBe('moderate')
    expect(sampleTier(101, 'player')).toBe('high')
    expect(sampleTier(101)).toBe('low') // population scale unchanged
  })
})
