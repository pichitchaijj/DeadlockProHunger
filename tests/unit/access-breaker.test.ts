import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AccessGuard,
  Breaker,
  effectiveStatus,
  ENDPOINT_BREAKER,
  endpointTemplate,
  GLOBAL_BREAKER,
  isPlayerScoped,
  outcomeFor,
  PLAYER_ENDPOINT_BREAKER,
  type AccessRefusal,
  type Outcome,
  type Pass,
  type Ticket,
} from '@/lib/deadlock/accessBreaker'

/*
 * The access breaker as a pure state machine (lib/deadlock/accessBreaker.ts): the clock is passed in.
 * The client-level behaviour (fetch counts) is in api-client-breaker.test.ts.
 */

const MIN = 60_000
const T0 = 1_000_000_000_000

const A = '/v1/analytics/hero-stats'
const B = '/v1/analytics/item-stats'
const C = '/v1/assets/heroes'
const D = '/v2/patches'
const E = '/v1/info'
const RANK = (id: number) => `/v1/players/${id}/rank`
const PLAYER_PATHS = [RANK, (id: number) => `/v1/players/${id}/match-history`, (id: number) => `/v1/players/${id}/mate-stats`, (id: number) => `/v1/players/${id}/enemy-stats`]

const isRefusal = (t: Ticket | AccessRefusal): t is AccessRefusal => 'rejected' in t
function ticket(g: AccessGuard, path: string, now: number): Ticket {
  const t = g.admit(path, now)
  if (isRefusal(t)) throw new Error(`unexpectedly refused (${t.scope}) for ${path}`)
  return t
}
/** One attempt that went out at `now` and came back with `outcome`. */
function call(g: AccessGuard, path: string, outcome: Outcome, now: number): Ticket | AccessRefusal {
  const t = g.admit(path, now)
  if (isRefusal(t)) return t
  t.sentAt = now
  g.settle(t, outcome, now)
  return t
}
/** Opens a fresh breaker: refusals until it trips. */
function openBreaker(b: Breaker, keys: string[], now: number) {
  for (const key of keys) {
    const p = b.admit(now) as Pass
    b.settle(p, 'refused', key, now, now)
  }
  expect(b.status().state).toBe('open')
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('endpoint templates and outcomes', () => {
  it('replaces numeric segments with :id and drops the query', () => {
    expect(endpointTemplate('/v1/players/123/rank')).toBe('/v1/players/:id/rank')
    expect(endpointTemplate('/v1/analytics/hero-build-stats/12')).toBe('/v1/analytics/hero-build-stats/:id')
    expect(endpointTemplate('/v1/matches/77/metadata?disable_steam=true')).toBe('/v1/matches/:id/metadata')
    expect(endpointTemplate('/v1/analytics/hero-stats')).toBe('/v1/analytics/hero-stats')
  })

  it('treats only the four per-account player endpoints as player-scoped', () => {
    for (const p of PLAYER_PATHS) expect(isPlayerScoped(endpointTemplate(p(5))), p(5)).toBe(true)
    for (const p of ['/v1/analytics/hero-build-stats/1', '/v1/assets/items/by-hero-id/1', '/v1/matches/1/metadata', '/v1/players/rank', '/v1/players/steam', '/v1/players/hero-stats']) {
      expect(isPlayerScoped(endpointTemplate(p)), p).toBe(false)
    }
  })

  it('maps statuses to outcomes', () => {
    for (const s of [401, 403]) expect(outcomeFor(s)).toBe('refused')
    for (const s of [200, 204, 400, 404, 422]) expect(outcomeFor(s)).toBe('authorized')
    for (const s of [429, 500, 502, 503, 504]) expect(outcomeFor(s)).toBe('neutral')
  })
})

describe('global level', () => {
  it('opens on the 3rd refusal from 2 templates within 60 s, for 10 min', () => {
    const g = new AccessGuard()
    call(g, A, 'refused', T0)
    call(g, A, 'refused', T0 + 1)
    expect(g.status().global.state).toBe('closed')
    call(g, B, 'refused', T0 + 2)
    expect(g.status().global).toMatchObject({ state: 'open', retryAt: T0 + 2 + 10 * MIN })
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('pausing upstream calls for 10 min'))
  })

  it('does not open while an authorized answer was sent within 60 s', () => {
    const g = new AccessGuard()
    call(g, C, 'authorized', T0)
    for (const [i, p] of [A, B, D, E, A].entries()) call(g, p, 'refused', T0 + 1_000 + i)
    expect(g.status().global.state).toBe('closed')
    // A fresh window, the authorized answer now older than 60 s (A itself is paused at the endpoint level).
    for (const [i, p] of [B, D].entries()) call(g, p, 'refused', T0 + 2 * MIN + i)
    expect(g.status().global.state).toBe('closed')
    call(g, E, 'refused', T0 + 2 * MIN + 2)
    expect(g.status().global.state).toBe('open')
  })

  it('neutral outcomes neither count nor reset', () => {
    const g = new AccessGuard()
    for (let i = 0; i < 10; i++) call(g, A, 'neutral', T0 + i)
    expect(g.status().global).toMatchObject({ state: 'closed', refusals: 0, lastAuthorizedAt: null })
  })

  it('never counts player-scoped refusals, even when all four player endpoints open', () => {
    const g = new AccessGuard()
    let t = T0
    for (const p of PLAYER_PATHS) for (const id of [1, 2, 3]) call(g, p(id), 'refused', t++)
    const s = g.status()
    for (const p of PLAYER_PATHS) expect(s.endpoints[endpointTemplate(p(1))].state).toBe('open')
    expect(s.global).toMatchObject({ state: 'closed', refusals: 0 })
    expect(isRefusal(g.admit(A, t))).toBe(false)
  })
})

describe('endpoint level', () => {
  it('a general endpoint opens after 2 refusals; the global level stays closed', () => {
    const g = new AccessGuard()
    call(g, A, 'refused', T0)
    call(g, A, 'refused', T0 + 1)
    expect(g.status().endpoints[A]).toMatchObject({ state: 'open', retryAt: T0 + 1 + 10 * MIN })
    expect(g.status().global.state).toBe('closed')
    expect(g.admit(A, T0 + 2)).toMatchObject({ rejected: true, scope: 'endpoint' })
    expect(isRefusal(g.admit(B, T0 + 2))).toBe(false)
  })

  it('a player endpoint needs 3 different accounts; one account refused repeatedly opens nothing', () => {
    const g = new AccessGuard()
    for (let i = 0; i < 5; i++) call(g, RANK(1), 'refused', T0 + i)
    expect(g.status().endpoints['/v1/players/:id/rank'].state).toBe('closed')
    const h = new AccessGuard()
    call(h, RANK(1), 'refused', T0)
    call(h, RANK(2), 'refused', T0 + 1)
    expect(h.status().endpoints['/v1/players/:id/rank'].state).toBe('closed')
    call(h, RANK(3), 'refused', T0 + 2)
    expect(h.status().endpoints['/v1/players/:id/rank']).toMatchObject({ state: 'open', retryAt: T0 + 2 + 2 * MIN })
  })

  it('an authorized answer from the same player endpoint within 60 s keeps it closed', () => {
    const g = new AccessGuard()
    call(g, RANK(9), 'authorized', T0)
    for (const id of [1, 2, 3, 4]) call(g, RANK(id), 'refused', T0 + id)
    expect(g.status().endpoints['/v1/players/:id/rank'].state).toBe('closed')
  })
})

describe('half-open, cooldown and generations', () => {
  it('lets one probe through; an authorized probe closes and resets the cooldown', () => {
    const b = new Breaker(GLOBAL_BREAKER)
    openBreaker(b, ['a', 'b', 'c'], T0)
    expect(b.admit(T0 + 10 * MIN - 1)).toMatchObject({ rejected: true })
    const probe = b.admit(T0 + 10 * MIN) as Pass
    expect(probe.probeId).not.toBeNull()
    expect(b.admit(T0 + 10 * MIN + 1)).toMatchObject({ rejected: true }) // slot taken
    b.settle(probe, 'authorized', 'a', T0 + 10 * MIN, T0 + 10 * MIN + 5)
    expect(b.status()).toMatchObject({ state: 'closed', cooldownMs: 10 * MIN, lastAuthorizedAt: T0 + 10 * MIN })
  })

  it('a refused probe re-opens with the cooldown doubled up to the cap', () => {
    for (const [config, expected] of [
      [GLOBAL_BREAKER, [20, 40, 60, 60]],
      [ENDPOINT_BREAKER, [20, 40, 60, 60]],
      [PLAYER_ENDPOINT_BREAKER, [4, 8, 10, 10]],
    ] as const) {
      const b = new Breaker(config)
      openBreaker(b, ['a', 'b', 'c'], T0)
      let now = T0
      for (const minutes of expected) {
        now = b.status().retryAt!
        const probe = b.admit(now) as Pass
        b.settle(probe, 'refused', 'a', now, now)
        expect(b.status()).toMatchObject({ state: 'open', cooldownMs: minutes * MIN, retryAt: now + minutes * MIN })
      }
    }
  })

  it('a neutral or unsent probe frees the slot without changing anything else', () => {
    const b = new Breaker(GLOBAL_BREAKER)
    openBreaker(b, ['a', 'b', 'c'], T0)
    const now = T0 + 10 * MIN
    for (const outcome of ['neutral', 'none'] as const) {
      const probe = b.admit(now) as Pass
      b.settle(probe, outcome, 'a', now, now)
      expect(b.status()).toMatchObject({ state: 'half-open', probing: false, cooldownMs: 10 * MIN })
    }
    expect((b.admit(now) as Pass).probeId).not.toBeNull()
  })

  it('a pass from before an open never updates lastAuthorizedAt', () => {
    const b = new Breaker(GLOBAL_BREAKER)
    const old = b.admit(T0) as Pass
    openBreaker(b, ['a', 'b', 'c'], T0 + 1)
    b.settle(old, 'authorized', 'a', T0, T0 + 2)
    expect(b.status()).toMatchObject({ state: 'open', lastAuthorizedAt: null })
  })

  it('a replaced (stale) probe can neither close nor extend the cooldown', () => {
    const b = new Breaker(GLOBAL_BREAKER)
    openBreaker(b, ['a', 'b', 'c'], T0)
    const t = T0 + 10 * MIN
    const first = b.admit(t) as Pass
    const second = b.admit(t + MIN) as Pass // first is 60 s old: replaced
    expect(second.probeId).not.toBe(first.probeId)
    b.settle(first, 'authorized', 'a', t, t + MIN + 1)
    expect(b.status()).toMatchObject({ state: 'half-open', probing: true })
    b.settle(first, 'refused', 'a', t, t + MIN + 2)
    expect(b.status()).toMatchObject({ state: 'half-open', probing: true, cooldownMs: 10 * MIN, retryAt: T0 + 10 * MIN })
    b.settle(second, 'authorized', 'a', t + MIN, t + MIN + 3)
    expect(b.status().state).toBe('closed')
  })

  it('a refusal from before an open/close cycle never counts in the new generation', () => {
    const b = new Breaker(GLOBAL_BREAKER)
    const old = b.admit(T0) as Pass
    openBreaker(b, ['a', 'b', 'c'], T0)
    const probe = b.admit(T0 + 10 * MIN) as Pass
    b.settle(probe, 'authorized', 'a', T0 + 10 * MIN, T0 + 10 * MIN)
    b.settle(old, 'refused', 'z', T0, T0 + 12 * MIN)
    expect(b.status()).toMatchObject({ state: 'closed', refusals: 0 })
  })
})

describe('effectiveStatus (status as of a time)', () => {
  it('reports open until retryAt and half-open from then on, without changing the breaker', () => {
    const b = new Breaker(GLOBAL_BREAKER)
    openBreaker(b, ['a', 'b', 'c'], T0)
    const retryAt = T0 + 10 * MIN
    expect(effectiveStatus(b.status(), retryAt - 1)).toMatchObject({ state: 'open', probing: false })
    expect(effectiveStatus(b.status(), retryAt)).toMatchObject({ state: 'half-open', probing: false, retryAt })
    expect(b.status().state).toBe('open') // reading moved nothing
    expect((b.admit(retryAt) as Pass).probeId).not.toBeNull() // and the next call is still the one probe
    expect(b.admit(retryAt)).toMatchObject({ rejected: true })
  })

  it('reports a probe in flight, and a stale one as not probing', () => {
    const b = new Breaker(GLOBAL_BREAKER)
    openBreaker(b, ['a', 'b', 'c'], T0)
    const t = T0 + 10 * MIN
    b.admit(t)
    expect(effectiveStatus(b.status(), t + MIN - 1)).toMatchObject({ state: 'half-open', probing: true, probeStartedAt: t })
    expect(effectiveStatus(b.status(), t + MIN)).toMatchObject({ state: 'half-open', probing: false })
  })

  it('leaves a closed breaker as it is', () => {
    const b = new Breaker(GLOBAL_BREAKER)
    expect(effectiveStatus(b.status(), T0)).toEqual(b.status())
  })
})

describe('both levels together', () => {
  it('an endpoint probe refused by the global level is given back', () => {
    const g = new AccessGuard()
    call(g, A, 'refused', T0)
    call(g, A, 'refused', T0 + 1) // endpoint A open until T0+1+10min
    const t1 = T0 + 5 * MIN
    for (const [i, p] of [B, C, D].entries()) call(g, p, 'refused', t1 + i) // global open until t1+2+10min
    expect(g.status().global.state).toBe('open')
    expect(g.admit(A, T0 + 1 + 10 * MIN)).toMatchObject({ rejected: true, scope: 'global' })
    expect(g.status().endpoints[A]).toMatchObject({ state: 'half-open', probing: false })
    const t2 = t1 + 2 + 10 * MIN
    call(g, E, 'authorized', t2) // global probe closes the global level
    expect(g.status().global.state).toBe('closed')
    const probe = ticket(g, A, t2 + 1)
    expect(probe.endpoint.probeId).not.toBeNull()
  })

  it('a paused endpoint never takes the global probe', () => {
    const g = new AccessGuard()
    call(g, A, 'refused', T0)
    call(g, A, 'refused', T0 + 1) // endpoint A open; 2 global signals
    const t1 = T0 + 1 + 10 * MIN
    call(g, A, 'refused', t1) // A's probe refused: A open for 20 min; 1 global signal
    call(g, B, 'refused', t1 + 1)
    call(g, C, 'refused', t1 + 2) // global open until t1+2+10min
    expect(g.status().global.state).toBe('open')
    const t2 = t1 + 2 + 10 * MIN
    expect(g.admit(A, t2)).toMatchObject({ rejected: true, scope: 'endpoint' })
    expect(g.status().global.probing).toBe(false)
    expect(ticket(g, D, t2 + 1).global.probeId).not.toBeNull()
  })

  it('a probe held when the other level changes is released by a no-send settle', () => {
    const g = new AccessGuard()
    call(g, A, 'refused', T0)
    call(g, A, 'refused', T0 + 1)
    const t1 = T0 + 1 + 10 * MIN
    const held = ticket(g, A, t1) // endpoint A probe, normal global pass
    expect(held.endpoint.probeId).not.toBeNull()
    for (const [i, p] of [B, C, D].entries()) call(g, p, 'refused', t1 + 1 + i) // global opens meanwhile
    expect(g.isCurrent(held)).toBe(false)
    g.settle(held, 'none', t1 + 5)
    expect(g.status().endpoints[A]).toMatchObject({ state: 'half-open', probing: false })
  })

  it('settles a ticket only once', () => {
    const g = new AccessGuard()
    const t = ticket(g, A, T0)
    t.sentAt = T0
    g.settle(t, 'refused', T0)
    g.settle(t, 'refused', T0)
    expect(g.status().endpoints[A].refusals).toBe(1)
    expect(g.status().global.refusals).toBe(1)
  })

  it('a global probe answered 403 by a player endpoint is neutral for the global level', () => {
    const g = new AccessGuard()
    for (const [i, p] of [A, B, C].entries()) call(g, p, 'refused', T0 + i)
    const t = T0 + 2 + 10 * MIN
    const probe = ticket(g, RANK(1), t)
    expect(probe.global.probeId).not.toBeNull()
    probe.sentAt = t
    g.settle(probe, 'refused', t)
    expect(g.status().global).toMatchObject({ state: 'half-open', probing: false, cooldownMs: 10 * MIN })
  })

  it('a global probe answered 200 by a player endpoint closes the global level', () => {
    const g = new AccessGuard()
    for (const [i, p] of [A, B, C].entries()) call(g, p, 'refused', T0 + i)
    call(g, RANK(1), 'authorized', T0 + 2 + 10 * MIN)
    expect(g.status().global.state).toBe('closed')
  })
})
