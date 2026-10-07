import { describe, expect, it } from 'vitest'
import { budgetClasses, classFor, TokenBucket } from '@/lib/deadlock/budget'

describe('TokenBucket', () => {
  it('sends a burst up to capacity, then books later slots at the sustained rate', () => {
    const b = new TokenBucket(2, 60, 0) // 1 token per second
    expect(b.reserve(0, 5_000)).toBe(0)
    expect(b.reserve(0, 5_000)).toBe(0)
    expect(b.reserve(0, 5_000)).toBe(1_000) // next token in 1 s
    expect(b.reserve(0, 5_000)).toBe(2_000) // queued behind it
  })

  it('refuses a booking that would wait too long, without spending a token', () => {
    const b = new TokenBucket(1, 60, 0)
    expect(b.reserve(0, 500)).toBe(0)
    expect(b.reserve(0, 500)).toBeNull()
    expect(b.reserve(1_000, 500)).toBe(0) // refilled; the refused call cost nothing
  })

  it('refills over time but never above capacity', () => {
    const b = new TokenBucket(3, 60, 0)
    for (let i = 0; i < 3; i++) b.reserve(0, 0)
    expect(b.reserve(60_000, 0)).toBe(0)
    expect(b.reserve(60_000, 0)).toBe(0)
    expect(b.reserve(60_000, 0)).toBe(0)
    expect(b.reserve(60_000, 0)).toBeNull()
  })
})

describe('budget classes', () => {
  const classes = budgetClasses(false)
  it('maps paths to the spec limit classes (first match wins)', () => {
    expect(classFor('/v1/analytics/hero-stats', classes).id).toBe('analytics')
    expect(classFor('/v1/analytics/hero-build-stats/13', classes).id).toBe('analytics')
    expect(classFor('/v1/players/rank', classes).id).toBe('rank-batch')
    expect(classFor('/v1/players/123/rank', classes).id).toBe('default')
    expect(classFor('/v1/matches/metadata', classes).id).toBe('match-bulk')
    expect(classFor('/v1/matches/123/metadata', classes).id).toBe('default')
    expect(classFor('/v1/assets/heroes', classes).id).toBe('default')
  })

  it('stays at 80% of the per-IP limits, with more analytics room when a key is set', () => {
    expect(classFor('/v1/analytics/x', classes).perMinute).toBe(160) // 200/min IP
    expect(classFor('/v1/analytics/x', budgetClasses(true)).perMinute).toBe(320) // 400/min key
    expect(classFor('/v1/players/rank', classes).perMinute).toBe(16) // 20/min
    expect(classFor('/v1/matches/metadata', classes).perMinute).toBe(24) // 30/min
  })
})
