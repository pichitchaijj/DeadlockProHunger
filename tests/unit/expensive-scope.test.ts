import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

/*
 * Phase 2A: the costly analytics (hero-build-stats, ability-order-stats, item-flow-stats, item-stats).
 * - Daily cache keys (lib/deadlock/expensive.ts) with a matching TTL.
 * - Cache-only reads (lib/deadlock/client.ts): a miss sends nothing, caches nothing and is `pending`.
 * - Scope limits checked in the loaders before any request (`limited`).
 * Upstream is a fetch fake that records every request; cheap sources are mocked. No network, no database.
 */
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ getDb: () => null }))

const store = new Map<string, unknown>()
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>, keyParts: string[], options: { revalidate?: number | false }) => async (...args: unknown[]) => {
    const key = JSON.stringify([keyParts, args])
    if (store.has(key)) return store.get(key)
    const value = await fn(...args) // a throw is not stored (as in Next: errors are never cached)
    store.set(key, value)
    revalidates.set(key, options?.revalidate)
    return value
  },
}))
const revalidates = new Map<string, number | false | undefined>()

const HEROES = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, name: `Hero ${i + 1}`, class_name: `hero_${i + 1}`, images: {} }))
const build = (id: number, heroId: number) => ({
  hero_build: { hero_build_id: id, origin_build_id: id, hero_id: heroId, author_account_id: 7, name: `Build ${id}`, version: 1, details: {}, language: 0, last_updated_timestamp: 1, publish_timestamp: 1 },
  num_weekly_favorites: 3,
})

vi.mock('@/lib/deadlock/endpoints', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getRanks: async () => [],
  getPatchFeed: async () => [{ source: 'forum', title: 'Gameplay Update', pub_date: '2026-10-01T12:00:00Z', link: null }],
  getActiveHeroes: async () => HEROES,
  getHeroStatsByDay: async () => [],
  getHeroTotals: async () => [],
  getBadgeDistribution: async () => [],
}))
vi.mock('@/lib/deadlock/buildEndpoints', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  searchBuilds: async () => [build(51, 5)],
  getBuildById: async (id: number) => build(id, 5),
  getSteamNames: async () => [],
  getAccountRanks: async () => [],
}))
// Cheap (matrix / asset) hero sources; the costly ones stay real and go through the fetch fake.
vi.mock('@/lib/deadlock/heroEndpoints', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getHeroCounters: async () => [],
  getHeroSynergies: async () => [],
  getHeroStatsForDuration: async () => [],
  getHeroStatsByBadge: async () => [],
  getHeroAbilities: async () => [],
  getShopItems: async () => [],
  getTopBuilds: async () => [],
}))

const EXPENSIVE = /^\/v1\/analytics\/(hero-build-stats\/\d+|ability-order-stats|item-flow-stats|item-stats|hero-stats)$/
async function upstream(input: string | URL | Request) {
  const url = new URL(String(input))
  if (!EXPENSIVE.test(url.pathname) && url.pathname !== '/v1/test') throw new Error(`unexpected upstream request: ${url.pathname}`)
  await new Promise((r) => setTimeout(r, 2))
  if (refuse) return new Response('{}', { status: 403 })
  if (url.pathname === '/v1/analytics/item-flow-stats') return Response.json({ nodes: [], edges: [], reached_per_column: [], baseline: { wins: 0, matches: 0 } })
  return Response.json(url.pathname === '/v1/test' ? { n: 1 } : [])
}
let refuse = false
const fetchMock = vi.fn(upstream)
const calls = () => fetchMock.mock.calls.map(([u]) => new URL(String(u)))
const paths = () => calls().map((u) => u.pathname)

async function load() {
  vi.resetModules() // fresh client state: budget buckets, in-flight map, access breaker, counters
  return {
    client: await import('@/lib/deadlock/client'),
    errors: await import('@/lib/deadlock/errors'),
    expensive: await import('@/lib/deadlock/expensive'),
    items: await import('@/lib/deadlock/itemEndpoints'),
    heroApi: await import('@/lib/deadlock/heroEndpoints'),
    itemLoaders: await import('@/features/items/loaders'),
    itemQuery: await import('@/features/items/query'),
    heroLoaders: await import('@/features/hero/loaders'),
    heroQuery: await import('@/features/hero/query'),
    buildLoaders: await import('@/features/builds/loaders'),
    scope: await import('@/features/meta/scope'),
    ttl: (await import('@/lib/cache/ttl')).TTL,
  }
}
const kindOf = async (p: Promise<unknown>) => {
  const { classifyError } = await import('@/lib/deadlock/errors')
  return p.then(() => 'ok', (e: unknown) => classifyError(e))
}

const DAY = 86_400
const T0 = Date.UTC(2026, 9, 14, 0, 30)
const today = Date.UTC(2026, 9, 14) / 1000
beforeEach(() => {
  store.clear()
  revalidates.clear()
  fetchMock.mockClear()
  fetchMock.mockImplementation(upstream)
  refuse = false
  vi.stubGlobal('fetch', fetchMock)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  for (const level of ['warn', 'info', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('daily keys for the costly endpoints', () => {
  it('the key step is a UTC day, equal to the TTL, and a multiple of the general analytics step', async () => {
    const { expensive, ttl, scope } = await load()
    expect(expensive.EXPENSIVE_KEY_STEP).toBe(DAY)
    expect(ttl.expensiveAnalytics).toBe(expensive.EXPENSIVE_KEY_STEP) // an entry lives exactly as long as its key is requested
    expect(expensive.EXPENSIVE_KEY_STEP % scope.ANALYTICS_KEY_STEP).toBe(0)
    expect(ttl.analytics).toBe(6 * 3600) // the other analytics are unchanged
  })

  it('cuts every window to complete UTC days: exact ends at midnight, whole-day ends at the last complete day’s noon', async () => {
    const { expensive } = await load()
    const throughYesterday = today - DAY + 12 * 3600 // throughDay(yesterday): upstream includes yesterday, not today
    const q = { minUnix: today - 6 * DAY, maxUnix: today + 18 * 3600 }
    expect(expensive.expensiveQuery(q, true)).toEqual({ ...q, maxUnix: today })
    expect(expensive.expensiveQuery(q, false)).toEqual({ ...q, maxUnix: throughYesterday })
    expect(expensive.completeDaysQuery(q)).toEqual(expensive.expensiveQuery(q, false)) // hero-stats denominators: same days
    // An explicit past last day (throughDay(d)) is kept as is.
    const past = { minUnix: today - 13 * DAY, maxUnix: today - 7 * DAY + 12 * 3600 }
    expect(expensive.expensiveQuery(past, false)).toEqual(past)
    // Exactly at 00:00 UTC and at 23:59 the same day: the same query, so the same key.
    const at = (t: number) => expensive.expensiveQuery({ minUnix: today - 6 * DAY, maxUnix: t }, false, t)
    expect(at(today)).toEqual(at(today + DAY - 60))
    expect(at(today + DAY).maxUnix).toBe(today + 12 * 3600) // the next day: through today, now complete
  })

  it('a window with no complete day yet (a patch released today) is pending for exact and whole-day endpoints alike', async () => {
    const { expensive, errors } = await load()
    const sameDay = { minUnix: today, maxUnix: today + 6 * 3600 }
    for (const exact of [true, false]) {
      let thrown: unknown
      try {
        expensive.expensiveQuery(sameDay, exact)
      } catch (error) {
        thrown = error
      }
      expect(errors.classifyError(thrown)).toBe('pending')
    }
  })

  it('every costly wrapper sends a midnight end, cached for TTL.expensiveAnalytics; one request per key per day', async () => {
    const { heroApi, items, ttl } = await load()
    const q = { minUnix: today - 6 * DAY, maxUnix: today + 12 * 3600 }
    const run = () =>
      Promise.all([
        heroApi.getHeroBuildStats(5, q),
        heroApi.getAbilityOrderStats(5, q),
        heroApi.getHeroItemStats(5, q),
        items.getItemTotals(q),
        items.getItemStatsByMinute(q, null),
        items.getItemStatsByHero(q),
        items.getItemPhases(q, null),
      ])
    await run()
    // Exact endpoints end at today's midnight; item-stats at yesterday's noon (yesterday included, today not).
    const ends = calls().map((u) => [u.pathname.replace(/\/\d+$/, ''), u.searchParams.get('max_unix_timestamp')])
    expect(ends.filter(([p]) => p !== '/v1/analytics/item-stats').map(([, end]) => end)).toEqual(Array(3).fill(String(today)))
    expect(ends.filter(([p]) => p === '/v1/analytics/item-stats').map(([, end]) => end)).toEqual(Array(4).fill(String(today - DAY + 12 * 3600)))
    expect(new Set(calls().map((u) => u.searchParams.get('min_unix_timestamp')))).toEqual(new Set([String(q.minUnix)]))
    expect([...revalidates.values()].every((r) => r === ttl.expensiveAnalytics)).toBe(true)
    fetchMock.mockClear()
    for (const hour of [6, 12, 18, 23]) {
      vi.setSystemTime(Date.UTC(2026, 9, 14, hour, 30))
      await run() // later in the same UTC day (the 6h analytics step moved on): same keys, all hits
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('cache-only reads', () => {
  it('a miss sends nothing, spends no budget, caches nothing and is pending; a normal call then fills the same entry', async () => {
    const { client } = await load()
    const schema = z.object({ n: z.number() })
    const get = (cacheOnly: boolean) => client.deadlockGet('/v1/test', { schema, revalidate: 60, cacheOnly })
    expect(await kindOf(get(true))).toBe('pending')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(store.size).toBe(0)
    expect(client.apiCallStats()).toMatchObject({ network: 0, notWarmed: 1, budgetWaits: 0, budgetExhausted: 0 })
    await get(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await expect(get(true)).resolves.toEqual({ n: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('joins a normal call already fetching the key (no second request)', async () => {
    const { client } = await load()
    const schema = z.object({ n: z.number() })
    const normal = client.deadlockGet('/v1/test', { schema, revalidate: 60 })
    const cached = client.deadlockGet('/v1/test', { schema, revalidate: 60, cacheOnly: true })
    await expect(Promise.all([normal, cached])).resolves.toEqual([{ n: 1 }, { n: 1 }])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('an uncached call (revalidate false) has no entry: pending without a request', async () => {
    const { client } = await load()
    expect(await kindOf(client.deadlockGet('/v1/test', { schema: z.unknown(), revalidate: false, cacheOnly: true }))).toBe('pending')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('while upstream refuses (breaker not closed), a miss reads as refused, never as pending, and is not cached', async () => {
    const { client } = await load()
    refuse = true
    for (const i of [1, 2, 3]) await client.deadlockGet('/v1/test', { schema: z.unknown(), revalidate: 60, params: { i } }).catch(() => null)
    expect(client.accessBreakerStatus().endpoints['/v1/test']?.state).toBe('open') // 2 refusals pause the endpoint
    fetchMock.mockClear()
    const error = await client.deadlockGet('/v1/test', { schema: z.unknown(), revalidate: 60, cacheOnly: true }).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 403, circuitOpen: true })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(store.size).toBe(0)
  })

  it('item projections: cache-only misses are pending with nothing sent; after a normal call, cache-only hits', async () => {
    const { items } = await load()
    const q = { minUnix: today - 6 * DAY, maxUnix: today + 6 * 3600 }
    expect(await kindOf(items.getItemStatsByMinute(q, null, { cacheOnly: true }))).toBe('pending')
    expect(await kindOf(items.getItemPhases(q, null, { cacheOnly: true }))).toBe('pending')
    expect(await kindOf(items.getItemStatsByHero(q, { cacheOnly: true }))).toBe('pending')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(store.size).toBe(0)
    await Promise.all([items.getItemStatsByMinute(q, null), items.getItemPhases(q, null)]) // what the prewarm job does
    fetchMock.mockClear()
    vi.setSystemTime(Date.UTC(2026, 9, 14, 20)) // same UTC day, later 6h step
    const later = { ...q, maxUnix: today + 18 * 3600 }
    await expect(items.getItemStatsByMinute(later, null, { cacheOnly: true })).resolves.toEqual([])
    await expect(items.getItemPhases(later, null, { cacheOnly: true })).resolves.toEqual({ nodes: [], reached: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('Items: purchase timing', () => {
  const ctxFor = async (m: Awaited<ReturnType<typeof load>>, changes: Partial<Parameters<typeof m.itemLoaders.getItemContext>[0]>) => {
    const ctx = await m.itemLoaders.getItemContext({ ...m.itemQuery.DEFAULT_ITEMS_QUERY, ...changes })
    if (ctx === 'unknown-hero') throw new Error('unknown hero')
    return ctx
  }
  const item = { id: 1, name: 'Item', slug: 'item' } as Parameters<Awaited<ReturnType<typeof load>>['itemLoaders']['getItemTiming']>[0]

  it('outside the default scope it is limited, with nothing sent (window, rank, mode or hero)', async () => {
    const m = await load()
    for (const changes of [{ window: '30d' }, { window: 'patch' }, { rank: 'low' }, { rank: 'top' }, { mode: 'ranked' }, { hero: 'hero-2' }] as const) {
      expect(await kindOf(m.itemLoaders.getItemTiming(item, await ctxFor(m, changes)))).toBe('limited')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('in the default scope it reads the cache only: cold is pending with nothing sent, warmed is served', async () => {
    const m = await load()
    const ctx = await ctxFor(m, {})
    expect(await kindOf(m.itemLoaders.getItemTiming(item, ctx))).toBe('pending')
    expect(fetchMock).not.toHaveBeenCalled()
    // The prewarm job's item stage (same context, normal calls).
    await Promise.all([m.items.getItemStatsByMinute(ctx.scope.statsQuery, null), m.items.getItemPhases(ctx.scope.statsQuery, null)])
    fetchMock.mockClear()
    await expect(m.itemLoaders.getItemTiming(item, ctx)).resolves.toMatchObject({ points: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('Hero Detail / Analyze: per-hero costly analytics', () => {
  const ctxFor = async (m: Awaited<ReturnType<typeof load>>, rank: 'all' | 'low' | 'mid' | 'high' | 'top', window: '7d' | '30d' | 'patch' = '7d') => {
    const ctx = await m.heroLoaders.getHeroContext('hero-5', { ...m.heroQuery.DEFAULT_HERO_QUERY, rank, window })
    if (!ctx) throw new Error('unknown hero')
    return ctx
  }

  it('every rank band other than all: builds, abilities and the builds list are limited, with nothing sent', async () => {
    const m = await load()
    for (const rank of ['low', 'mid', 'high', 'top'] as const) {
      const ctx = await ctxFor(m, rank)
      expect(await kindOf(m.heroLoaders.getBuildsData(ctx))).toBe('limited')
      expect(await kindOf(m.heroLoaders.getAbilitiesData(ctx))).toBe('limited')
      expect(await kindOf(m.heroLoaders.heroBuilds(ctx))).toBe('limited')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('the overview still loads at other rank bands; its per-hero panels say limited (never "no builds")', async () => {
    const m = await load()
    const overview = await m.heroLoaders.getOverviewData(await ctxFor(m, 'high'))
    expect(overview).toMatchObject({ perHeroIssue: 'limited', topBuild: null, opening: null })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('at all ranks, every window is computed (one daily key per costly call)', async () => {
    const m = await load()
    for (const window of ['7d', '30d', 'patch'] as const) {
      const overview = await m.heroLoaders.getOverviewData(await ctxFor(m, 'all', window))
      expect(overview.perHeroIssue).toBeNull()
    }
    expect(paths().filter((p) => p.startsWith('/v1/analytics/hero-build-stats/'))).toHaveLength(3)
    expect(paths().filter((p) => p === '/v1/analytics/ability-order-stats')).toHaveLength(3)
    for (const u of calls()) {
      const end = Number(u.searchParams.get('max_unix_timestamp'))
      // Complete days only: exact endpoints end at a midnight, whole-day ones at a past day's noon, never today.
      if (u.pathname === '/v1/analytics/item-stats' || u.pathname === '/v1/analytics/hero-stats') expect(end % DAY === 12 * 3600 && end < today).toBe(true)
      else expect(end % DAY === 0 && end <= today).toBe(true)
    }
  })
})

describe('Build detail', () => {
  it('rank bands other than all are limited, with nothing sent', async () => {
    const m = await load()
    for (const rank of ['low', 'mid', 'high', 'top'] as const) {
      expect(await kindOf(m.buildLoaders.getBuildDetail('hero-5', 51, { window: '30d', rank }))).toBe('limited')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('item flow is computed for the default scope only; elsewhere its section is limited and nothing is sent for it', async () => {
    const m = await load()
    const week = await m.buildLoaders.getBuildDetail('hero-5', 51, { window: '7d', rank: 'all' })
    expect(week).toMatchObject({ kind: 'build', flow: null, flowIssue: 'limited' })
    expect(paths()).not.toContain('/v1/analytics/item-flow-stats')
    const month = await m.buildLoaders.getBuildDetail('hero-5', 51, { window: '30d', rank: 'all' })
    expect(month).toMatchObject({ kind: 'build', flowIssue: null })
    expect(paths().filter((p) => p === '/v1/analytics/item-flow-stats')).toHaveLength(1)
  })
})
