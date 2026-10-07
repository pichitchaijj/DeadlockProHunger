import { describe, expect, it } from 'vitest'
import { formatCompact, formatDuration, formatPercent, formatPointDelta, formatRelativeTime } from '@/lib/format'

describe('format', () => {
  it('formats percentages', () => {
    expect(formatPercent(0.5213)).toBe('52.1%')
  })

  it('formats point deltas with a real minus sign', () => {
    expect(formatPointDelta(0.031)).toBe('+3.1pp')
    expect(formatPointDelta(-0.004)).toBe('−0.4pp')
    expect(formatPointDelta(0.0001)).toBe('±0.0pp')
  })

  it('formats compact numbers', () => {
    expect(formatCompact(12400)).toBe('12.4K')
  })

  it('formats match durations', () => {
    expect(formatDuration(1934)).toBe('32:14')
    expect(formatDuration(3725)).toBe('1:02:05')
  })
})

describe('formatRelativeTime', () => {
  const now = Date.UTC(2026, 9, 6, 12)
  it('picks the largest fitting unit', () => {
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe('3 hours ago')
    expect(formatRelativeTime(now - 86_400_000, now)).toBe('yesterday')
    expect(formatRelativeTime(now - 10_000, now)).toBe('just now')
  })
})

describe('winRateDomain', () => {
  it('keeps at least 40–60% and stays centered on 50%', async () => {
    const { winRateDomain, toPercent } = await import('@/lib/scale')
    expect(winRateDomain([0.48, 0.53])).toEqual({ min: 0.4, max: 0.6 })
    const wide = winRateDomain([0.663, 0.709])
    expect(wide.min).toBeCloseTo(0.25)
    expect(wide.max).toBeCloseTo(0.75)
    expect(toPercent(0.709, wide)).toBeLessThan(100)
    expect(toPercent(0.5, wide)).toBeCloseTo(50)
  })
})
