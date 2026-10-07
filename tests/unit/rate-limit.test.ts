import { describe, expect, it } from 'vitest'
import { clientKey, createRateLimiter } from '@/lib/rateLimit'

describe('createRateLimiter', () => {
  it('allows up to the limit per window, then reports when to retry', () => {
    const check = createRateLimiter({ limit: 2, windowMs: 60_000 })
    expect(check('a', 0)).toEqual({ ok: true })
    expect(check('a', 1_000)).toEqual({ ok: true })
    expect(check('a', 15_000)).toEqual({ ok: false, retryAfterS: 45 })
    // Other clients have their own window.
    expect(check('b', 15_000)).toEqual({ ok: true })
    // A new window starts once the old one has passed.
    expect(check('a', 60_000)).toEqual({ ok: true })
  })

  it('never says retry in under a second', () => {
    const check = createRateLimiter({ limit: 1, windowMs: 1_000 })
    check('a', 0)
    expect(check('a', 999)).toEqual({ ok: false, retryAfterS: 1 })
  })

  it('keeps memory bounded', () => {
    const check = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 2 })
    check('a', 0)
    check('b', 0)
    check('c', 0) // evicts the oldest (a)
    expect(check('a', 1)).toEqual({ ok: true })
  })
})

describe('clientKey', () => {
  it('uses the first forwarded address', () => {
    expect(clientKey(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7')
    expect(clientKey(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2')
    expect(clientKey(new Headers())).toBe('unknown')
  })
})
