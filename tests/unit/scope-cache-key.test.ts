import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TTL } from '@/lib/cache/ttl'

/*
 * Analytics cache keys (features/meta/scope.ts): the window end (`statsQuery.maxUnix`, part of every
 * analytics URL and so of every cache key) is rounded down to ANALYTICS_KEY_STEP (6h, UTC-aligned).
 * Fake clock: only Date is faked, so the client's timers and promises behave normally.
 *
 * The fake unstable_cache models what matters here: entries keyed on keyParts, a `revalidate` lifetime,
 * and Next's stale-while-revalidate (an expired entry would still be served once). It records the age of
 * every entry it serves, so the tests can check that no entry older than the step is ever served.
 */
vi.mock('server-only', () => ({}))

let clock = 0 // unix ms, mirrored into the fake system time
const store = new Map<string, { value: unknown; at: number }>()
const served: Array<{ key: string; ageS: number; expired: boolean }> = []
vi.mock('next/cache', () => ({
  unstable_cache:
    (fn: (...args: unknown[]) => Promise<unknown>, keyParts: string[], opts: { revalidate?: number | false }) =>
    async (...args: unknown[]) => {
      const key = JSON.stringify([keyParts, args])
      const hit = store.get(key)
      if (hit) {
        const ageS = (clock - hit.at) / 1000
        const expired = typeof opts.revalidate === 'number' && ageS > opts.revalidate
        served.push({ key, ageS, expired })
        if (!expired) return hit.value
      }
      const value = await fn(...args)
      store.set(key, { value, at: clock })
      return value
    },
}))

const fetchMock = vi.fn(async (input: string | URL | Request) => {
  const url = new URL(String(input))
  const body = url.pathname === '/v1/analytics/hero-stats' ? [{ hero_id: 1, wins: 5, matches: 10, total_player_damage: 1, total_player_damage_taken: 1, total_boss_damage: 1 }] : []
  return new Response(JSON.stringify(body), { status: 200 })
})

const HOUR = 3_600
const DAY = 86_400
/** 2026-10-13 00:00:00 UTC */
const DAY0 = Date.UTC(2026, 9, 13) / 1000

function at(unixS: number) {
  clock = unixS * 1000
  vi.setSystemTime(clock)
}

async function load() {
  vi.resetModules() // fresh in-flight map, budget buckets and React cache
  const scope = await import('@/features/meta/scope')
  const endpoints = await import('@/lib/deadlock/endpoints')
  return { ...scope, ...endpoints }
}

const scopeAt = async (unixS: number, input: Parameters<Awaited<ReturnType<typeof load>>['resolveScope']>[0] = { window: '7d', rank: 'all', mode: 'all' }) => {
  at(unixS)
  const { resolveScope } = await load()
  return resolveScope(input)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  store.clear()
  served.length = 0
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('ANALYTICS_KEY_STEP', () => {
  it('is 6h, never longer than the analytics TTL, and divides a UTC day', async () => {
    const { ANALYTICS_KEY_STEP } = await load()
    expect(ANALYTICS_KEY_STEP).toBe(6 * HOUR)
    expect(ANALYTICS_KEY_STEP).toBeLessThanOrEqual(TTL.analytics)
    expect(DAY % ANALYTICS_KEY_STEP).toBe(0)
  })
})

describe('resolveScope: analytics window end', () => {
  it('is stable within a step: same statsQuery from 06:00:00 to 11:59:59 UTC', async () => {
    const first = await scopeAt(DAY0 + 6 * HOUR)
    for (const t of [DAY0 + 6 * HOUR + 1, DAY0 + 8.5 * HOUR, DAY0 + 12 * HOUR - 1]) {
      const s = await scopeAt(t)
      expect(s.statsQuery).toEqual(first.statsQuery)
      expect(s.asOf).toBe(DAY0 + 6 * HOUR)
    }
    expect(first.statsQuery.maxUnix).toBe(DAY0 + 6 * HOUR)
  })

  it('rolls over exactly at each step boundary', async () => {
    expect((await scopeAt(DAY0 + 12 * HOUR - 1)).statsQuery.maxUnix).toBe(DAY0 + 6 * HOUR)
    expect((await scopeAt(DAY0 + 12 * HOUR)).statsQuery.maxUnix).toBe(DAY0 + 12 * HOUR)
    expect((await scopeAt(DAY0 + DAY - 60)).statsQuery.maxUnix).toBe(DAY0 + 18 * HOUR)
  })

  it('rolls over at UTC midnight together with the window start', async () => {
    const before = await scopeAt(DAY0 + DAY - 1)
    const after = await scopeAt(DAY0 + DAY)
    expect(after.statsQuery.maxUnix).toBe(DAY0 + DAY)
    expect(after.statsQuery.minUnix - before.statsQuery.minUnix).toBe(DAY) // 7d window moves one day
    expect(after.statsQuery.minUnix).toBe(DAY0 + DAY - 6 * DAY)
  })

  it('is never in the future and never 6h or more behind the request (3 days, every 7 min)', async () => {
    at(DAY0)
    const { resolveScope } = await load()
    for (let t = DAY0; t < DAY0 + 3 * DAY; t += 7 * 60 + 13) {
      at(t)
      const s = await resolveScope({ window: '7d', rank: 'all', mode: 'all' })
      expect(s.statsQuery.maxUnix).toBeLessThanOrEqual(t)
      expect(t - s.statsQuery.maxUnix).toBeLessThan(6 * HOUR)
      expect(s.statsQuery.maxUnix % (6 * HOUR)).toBe(0) // UTC 00 / 06 / 12 / 18
    }
  })

  it('does not depend on window, rank or match mode', async () => {
    const t = DAY0 + 15 * HOUR
    const ends = await Promise.all(
      (
        [
          { window: '7d', rank: 'all', mode: 'all' },
          { window: '30d', rank: 'high', mode: 'ranked' },
          { window: 'patch', rank: 'low', mode: 'all' },
        ] as const
      ).map(async (input) => (await scopeAt(t, input)).statsQuery.maxUnix),
    )
    expect(new Set(ends)).toEqual(new Set([DAY0 + 12 * HOUR]))
  })
})

describe('analytics cache through the client', () => {
  /** One page view at `t`: resolve the default scope and read hero totals with it. */
  async function view(t: number) {
    at(t)
    const { resolveScope, getHeroTotals } = await load()
    await getHeroTotals((await resolveScope({ window: '7d', rank: 'all', mode: 'all' })).statsQuery)
  }
  const heroStatsFetches = () => fetchMock.mock.calls.filter(([u]) => new URL(String(u)).pathname === '/v1/analytics/hero-stats').length

  it('one upstream request per step: 06:05 and 11:55 share it, 12:01 fetches again', async () => {
    await view(DAY0 + 6 * HOUR + 5 * 60)
    await view(DAY0 + 12 * HOUR - 5 * 60)
    expect(heroStatsFetches()).toBe(1)
    await view(DAY0 + 12 * HOUR + 60)
    expect(heroStatsFetches()).toBe(2)
  })

  it('24 hourly views in a day fetch 4 times (was 24 with hour keys)', async () => {
    for (let h = 0; h < 24; h++) await view(DAY0 + h * HOUR + 7 * 60)
    expect(heroStatsFetches()).toBe(4)
  })

  it('never serves a cached entry 6h old or older, so never an expired (stale) one', async () => {
    for (let t = DAY0; t < DAY0 + 2 * DAY; t += 23 * 60 + 11) await view(t)
    // Analytics entries only (the rank and patch feeds have their own TTLs and keys without a time).
    const analytics = served.filter((s) => s.key.includes('/v1/analytics/'))
    expect(analytics.length).toBeGreaterThan(0)
    expect(analytics.every((s) => !s.expired)).toBe(true)
    expect(Math.max(...analytics.map((s) => s.ageS))).toBeLessThan(6 * HOUR)
  })
})
