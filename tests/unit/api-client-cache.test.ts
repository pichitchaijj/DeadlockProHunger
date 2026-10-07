import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

/*
 * The client's cache → budget → API path, with Next's cache and fetch replaced by in-memory fakes.
 * The fake cache behaves like unstable_cache: keyed on keyParts, errors are not stored.
 */
vi.mock('server-only', () => ({}))
const store = new Map<string, unknown>()
vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => Promise<unknown>, keyParts: string[]) => async () => {
    const key = JSON.stringify(keyParts)
    if (store.has(key)) return store.get(key)
    const value = await fn()
    store.set(key, value)
    return value
  },
}))

const schema = z.array(z.object({ hero_id: z.number(), wins: z.number() }))
const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ hero_id: 1, wins: 5, extra: 'dropped' }]), { status: 200 }))

async function client() {
  vi.resetModules() // fresh budget buckets and counters
  return import('@/lib/deadlock/client')
}

beforeEach(() => {
  store.clear()
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.DEADLOCK_API_KEY
  delete process.env.DEADLOCK_API_TRACE
})

describe('deadlockGet: cache first', () => {
  it('cache miss: one request, parsed projection stored', async () => {
    const { deadlockGet, apiCallStats } = await client()
    const data = await deadlockGet('/v1/analytics/hero-stats', { schema, revalidate: 60, params: { a: 1 } })
    expect(data).toEqual([{ hero_id: 1, wins: 5 }]) // unknown fields stripped
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(apiCallStats()).toMatchObject({ network: 1, hits: 0 })
  })

  it('cache hit: no request and no budget spent', async () => {
    const { deadlockGet, apiCallStats, budgetHeadroom } = await client()
    await deadlockGet('/v1/analytics/hero-stats', { schema, revalidate: 60, params: { a: 1 } })
    const tokensAfterMiss = budgetHeadroom('/v1/analytics/x').available
    await deadlockGet('/v1/analytics/hero-stats', { schema, revalidate: 60, params: { a: 1 } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(apiCallStats()).toMatchObject({ network: 1, hits: 1 })
    expect(budgetHeadroom('/v1/analytics/x').available).toBeGreaterThanOrEqual(tokensAfterMiss)
  })

  it('repeated runs (like a second prewarm) never refetch fresh data', async () => {
    const { deadlockGet } = await client()
    for (let run = 0; run < 3; run++) {
      await Promise.all([1, 2, 3].map((a) => deadlockGet('/v1/analytics/hero-stats', { schema, revalidate: 60, params: { a } })))
    }
    expect(fetchMock).toHaveBeenCalledTimes(3) // one per distinct key, ever
  })

  it('concurrent misses for one key share a single request', async () => {
    const { deadlockGet } = await client()
    await Promise.all(Array.from({ length: 5 }, () => deadlockGet('/v1/analytics/hero-stats', { schema, revalidate: 60, params: { a: 9 } })))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps separate entries for the same URL with different schemas', async () => {
    const { deadlockGet } = await client()
    const other = z.array(z.object({ hero_id: z.number() }))
    await deadlockGet('/v1/analytics/hero-stats', { schema, revalidate: 60 })
    await deadlockGet('/v1/analytics/hero-stats', { schema: other, revalidate: 60 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not cache errors: a failed miss is retried by the next call', async () => {
    const { deadlockGet } = await client()
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }))
    await expect(deadlockGet('/v1/assets/heroes', { schema, revalidate: 60, retry: false })).rejects.toThrow('HTTP 500')
    await expect(deadlockGet('/v1/assets/heroes', { schema, revalidate: 60, retry: false })).resolves.toEqual([{ hero_id: 1, wins: 5 }])
  })
})

describe('deadlockGet: budget', () => {
  it('fails a miss as a 429 without sending it once the budget is spent, and cache hits still work', async () => {
    const { deadlockGet, apiCallStats } = await client()
    // Analytics burst is 40; distinct params make every call a miss. A short timeout = short max wait.
    for (let i = 0; i < 40; i++) await deadlockGet('/v1/analytics/hero-stats', { schema, revalidate: 60, params: { i }, timeoutMs: 100 })
    expect(fetchMock).toHaveBeenCalledTimes(40)
    await expect(deadlockGet('/v1/analytics/hero-stats', { schema, revalidate: 60, params: { i: 41 }, timeoutMs: 100 })).rejects.toMatchObject({ status: 429 })
    expect(fetchMock).toHaveBeenCalledTimes(40) // the refused request never went out
    expect(apiCallStats().budgetExhausted).toBe(1)
    await expect(deadlockGet('/v1/analytics/hero-stats', { schema, revalidate: 60, params: { i: 0 }, timeoutMs: 100 })).resolves.toBeTruthy() // hit: no budget needed
    expect(fetchMock).toHaveBeenCalledTimes(40)
  })

  it('other limit classes keep their own budget', async () => {
    const { deadlockGet } = await client()
    for (let i = 0; i < 40; i++) await deadlockGet('/v1/analytics/hero-stats', { schema, revalidate: 60, params: { i }, timeoutMs: 100 })
    await expect(deadlockGet('/v1/assets/heroes', { schema, revalidate: 60, timeoutMs: 100 })).resolves.toBeTruthy()
  })
})

describe('no secret leakage', () => {
  it('sends the API key only as a header and never logs it, even with tracing on', async () => {
    const key = 'dl-key-not-real-000111'
    process.env.DEADLOCK_API_KEY = key
    process.env.DEADLOCK_API_TRACE = '1'
    const logs: string[] = []
    const spy = vi.spyOn(console, 'info').mockImplementation((...args) => void logs.push(args.join(' ')))
    const { deadlockGet } = await client()
    await deadlockGet('/v1/analytics/hero-stats', { schema, revalidate: 60, params: { a: 1 } })
    await deadlockGet('/v1/analytics/hero-stats', { schema, revalidate: 60, params: { a: 1 } })
    spy.mockRestore()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).not.toContain(key)
    expect((init.headers as Record<string, string>)['X-API-KEY']).toBe(key)
    expect(logs.length).toBeGreaterThan(0)
    expect(logs.join('\n')).not.toContain(key)
  })
})

describe('stableKey', () => {
  it('gives unstable_cache a fixed source text, so every bundle derives the same cache key', async () => {
    const { stableKey } = await import('@/lib/cache/stableKey')
    // Two closures with different source text (as two bundles would minify them) …
    const a = stableKey('deadlock-api', () => 1)
    const b = stableKey('deadlock-api', () => {
      const unused = 0
      return 1 + unused
    })
    expect(a.toString()).toBe(b.toString()) // … produce the same key text
    expect(a()).toBe(1) // and still behave as before
  })
})
