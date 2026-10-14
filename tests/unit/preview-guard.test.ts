import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

/*
 * Vercel Preview guard (lib/deadlock/client.ts `previewBlocked`): with VERCEL_ENV=preview and no explicit
 * DEADLOCK_API_IN_PREVIEW=1, a call fails as `unavailable` before the access breaker and the budget, so nothing is
 * sent and no token is spent. Production, local and test runs are unchanged. The real client runs against a fetch
 * stub that records every request; no network.
 * Build guard (`buildBlocked`): during `next build` (NEXT_PHASE=phase-production-build) calls are blocked the same way
 * unless VERCEL_ENV=production or DEADLOCK_API_AT_BUILD=1, whether or not VERCEL_ENV exists. Every env change is a
 * vi.stubEnv, restored after each test (vi.unstubAllEnvs).
 */
vi.mock('server-only', () => ({}))

const store = new Map<string, unknown>()
vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => Promise<unknown>, keyParts: string[]) => async () => {
    const key = JSON.stringify(keyParts)
    if (store.has(key)) return store.get(key)
    const value = await fn() // a throw is not stored (as in Next: errors are never cached)
    store.set(key, value)
    return value
  },
}))

let status = 200
const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => (status === 200 ? Response.json([{ n: 1 }]) : new Response('{}', { status })))

const PATH = '/v1/analytics/hero-stats'
const schema = z.array(z.object({ n: z.number() }))
const FALLBACK: Array<{ n: number }> = []
async function load() {
  vi.resetModules() // fresh budget buckets, breaker, counters and in-flight map
  const client = await import('@/lib/deadlock/client')
  const errors = await import('@/lib/deadlock/errors')
  const { softFail } = await import('@/lib/deadlock/softFail')
  const get = (o: { revalidate?: number | false; cacheOnly?: boolean } = {}) => client.deadlockGet(PATH, { params: { a: 1 }, schema, revalidate: o.revalidate ?? 60, cacheOnly: o.cacheOnly })
  const kindOf = (p: Promise<unknown>) => p.then(() => 'ok', (e: unknown) => errors.classifyError(e))
  return { client, errors, softFail, get, kindOf, headroom: () => client.budgetHeadroom(PATH).available }
}

beforeEach(() => {
  store.clear()
  status = 200
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VERCEL_ENV', '')
  vi.stubEnv('DEADLOCK_API_IN_PREVIEW', '')
  vi.stubEnv('DEADLOCK_API_KEY', '')
  vi.stubEnv('NEXT_PHASE', '')
  vi.stubEnv('DEADLOCK_API_AT_BUILD', '')
  vi.useFakeTimers({ toFake: ['Date'] }) // the token bucket refills with Date.now: frozen, headroom is exact
  vi.setSystemTime(Date.UTC(2026, 9, 14, 12))
  for (const level of ['info', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Vercel Preview without opt-in', () => {
  beforeEach(() => vi.stubEnv('VERCEL_ENV', 'preview'))

  it('fails as unavailable with no request, no budget, no breaker ticket', async () => {
    const m = await load()
    const before = m.headroom()
    for (const revalidate of [60, false] as const) {
      const error = await m.get({ revalidate }).catch((e: unknown) => e)
      expect(m.errors.classifyError(error)).toBe('unavailable')
      expect(m.errors.isAccessDenied(error)).toBe(false) // not a refusal: nothing was refused upstream
      expect(m.errors.isMissing(error)).toBe(false) // never "doesn't exist"
    }
    expect(fetchMock).not.toHaveBeenCalled()
    expect(m.headroom()).toBe(before)
    expect(m.client.apiCallStats()).toMatchObject({ network: 0, budgetWaits: 0, budgetExhausted: 0, accessRefused: 0, circuitRejected: 0 })
    expect(m.client.accessBreakerStatus().global.state).toBe('closed')
  })

  it('only the exact opt-in "1" allows calls', async () => {
    for (const value of ['true', 'yes', '0', ' 1']) {
      vi.stubEnv('DEADLOCK_API_IN_PREVIEW', value)
      const m = await load()
      expect(await m.kindOf(m.get())).toBe('unavailable')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('caches nothing: once allowed, the same key fetches normally', async () => {
    const m = await load()
    expect(await m.kindOf(m.get())).toBe('unavailable')
    vi.stubEnv('DEADLOCK_API_IN_PREVIEW', '1')
    expect(await m.get()).toEqual([{ n: 1 }])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('leaves the other states as they were: a cache-only miss is pending, softFail keeps its fallback', async () => {
    const m = await load()
    expect(await m.kindOf(m.get({ cacheOnly: true }))).toBe('pending')
    expect(await m.softFail(m.get(), FALLBACK)).toBe(FALLBACK) // an ordinary failure, not a refusal
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('calls that are allowed', () => {
  for (const [label, env] of [
    ['Preview with DEADLOCK_API_IN_PREVIEW=1', { VERCEL_ENV: 'preview', DEADLOCK_API_IN_PREVIEW: '1' }],
    ['Production', { VERCEL_ENV: 'production' }],
    ['Production, even with the opt-in set', { VERCEL_ENV: 'production', DEADLOCK_API_IN_PREVIEW: '1' }],
    ['local / test (no VERCEL_ENV)', {}],
  ] as const) {
    it(`${label}: one request, one budget token, the same User-Agent`, async () => {
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
      const m = await load()
      const before = m.headroom()
      expect(await m.get()).toEqual([{ n: 1 }])
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(m.headroom()).toBe(before - 1)
      const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>
      expect(headers['User-Agent']).toBe('deadlockprohunger')
    })
  }

  it('Production: 401/403 are still refusals (forbidden), not swallowed or turned into unavailable', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    for (const code of [401, 403]) {
      status = code
      const m = await load()
      const error = await m.get().catch((e: unknown) => e)
      expect(m.errors.classifyError(error)).toBe('forbidden')
      expect(m.errors.isAccessDenied(error)).toBe(true)
      await expect(m.softFail(m.get(), FALLBACK)).rejects.toMatchObject({ status: code }) // rethrown, never the fallback
    }
  })
})

describe('next build guard', () => {
  beforeEach(() => vi.stubEnv('NEXT_PHASE', 'phase-production-build'))

  for (const [label, vercelEnv] of [
    ['VERCEL_ENV missing (a local build, or a Preview whose env is not exposed)', ''],
    ['VERCEL_ENV=preview', 'preview'],
    ['VERCEL_ENV=development', 'development'],
  ] as const) {
    it(`${label}: blocked as unavailable with no request, no budget, no breaker ticket`, async () => {
      vi.stubEnv('VERCEL_ENV', vercelEnv)
      const m = await load()
      const before = m.headroom()
      for (const revalidate of [60, false] as const) {
        const error = await m.get({ revalidate }).catch((e: unknown) => e)
        expect(m.errors.classifyError(error)).toBe('unavailable')
        expect(m.errors.isAccessDenied(error)).toBe(false)
        expect(m.errors.isMissing(error)).toBe(false)
      }
      expect(fetchMock).not.toHaveBeenCalled()
      expect(m.headroom()).toBe(before)
      expect(m.client.apiCallStats()).toMatchObject({ network: 0, budgetWaits: 0, budgetExhausted: 0, accessRefused: 0, circuitRejected: 0 })
      expect(m.client.accessBreakerStatus().global.state).toBe('closed')
    })
  }

  it('Preview with DEADLOCK_API_IN_PREVIEW=1 is still blocked during the build (the build needs its own opt-in)', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('DEADLOCK_API_IN_PREVIEW', '1')
    const m = await load()
    expect(await m.kindOf(m.get())).toBe('unavailable')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Preview with only DEADLOCK_API_AT_BUILD=1 is still blocked (the build opt-in does not lift the Preview guard)', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('DEADLOCK_API_IN_PREVIEW', undefined) // unset, not just empty
    vi.stubEnv('DEADLOCK_API_AT_BUILD', '1')
    const m = await load()
    expect(await m.kindOf(m.get())).toBe('unavailable')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('only the exact opt-in "1" allows calls', async () => {
    for (const value of ['true', 'yes', '0', ' 1']) {
      vi.stubEnv('DEADLOCK_API_AT_BUILD', value)
      const m = await load()
      expect(await m.kindOf(m.get())).toBe('unavailable')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('caches nothing: once allowed, the same key fetches normally', async () => {
    const m = await load()
    expect(await m.kindOf(m.get())).toBe('unavailable')
    vi.stubEnv('DEADLOCK_API_AT_BUILD', '1')
    expect(await m.get()).toEqual([{ n: 1 }])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  for (const [label, env] of [
    ['Vercel Production build', { VERCEL_ENV: 'production' }],
    ['DEADLOCK_API_AT_BUILD=1 (local build)', { DEADLOCK_API_AT_BUILD: '1' }],
    ['DEADLOCK_API_AT_BUILD=1 with VERCEL_ENV=preview and DEADLOCK_API_IN_PREVIEW=1', { DEADLOCK_API_AT_BUILD: '1', VERCEL_ENV: 'preview', DEADLOCK_API_IN_PREVIEW: '1' }],
  ] as const) {
    it(`${label}: one request, one budget token, the same User-Agent`, async () => {
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
      const m = await load()
      const before = m.headroom()
      expect(await m.get()).toEqual([{ n: 1 }])
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(m.headroom()).toBe(before - 1)
      const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>
      expect(headers['User-Agent']).toBe('deadlockprohunger')
    })
  }

  it('DEADLOCK_API_AT_BUILD=1 does not lift the Preview guard outside the build', async () => {
    vi.stubEnv('NEXT_PHASE', 'phase-production-server')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('DEADLOCK_API_AT_BUILD', '1')
    const m = await load()
    expect(await m.kindOf(m.get())).toBe('unavailable')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('outside the build phase', () => {
  for (const phase of ['', 'phase-production-server', 'phase-development-server']) {
    it(`NEXT_PHASE="${phase}" (runtime, dev, tests): unchanged, one request`, async () => {
      vi.stubEnv('NEXT_PHASE', phase)
      const m = await load()
      expect(await m.get()).toEqual([{ n: 1 }])
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  }
})
