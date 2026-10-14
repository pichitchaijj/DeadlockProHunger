import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

/*
 * Upstream request volume of the Builds listing (features/builds/loaders.ts). hero-build-stats goes through the
 * real client (cache → coalescing → budget → access breaker → fetch); every other source is mocked, and a fetch
 * to any other path fails the test. Counts are fetchMock calls, never caller counts. No network, no database.
 *
 * The all-heroes listing is computed for the default scope only (30d, all ranks) and reads hero-build-stats
 * cache-only: the prewarm job fills those entries (one paced call per hero), a page never fans out.
 */
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ getDb: () => null }))

const store = new Map<string, unknown>()
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>, keyParts: string[]) => async (...args: unknown[]) => {
    const key = JSON.stringify([keyParts, args])
    if (store.has(key)) return store.get(key)
    const value = await fn(...args) // a throw is not stored (as in Next: errors are never cached)
    store.set(key, value)
    return value
  },
}))

const HEROES = Array.from({ length: 39 }, (_, i) => ({ id: i + 1, name: `Hero ${i + 1}`, class_name: `hero_${i + 1}`, images: {} }))
const build = (id: number, heroId: number) => ({
  hero_build: { hero_build_id: id, origin_build_id: id, hero_id: heroId, author_account_id: 7, name: `Build ${id}`, version: 1, details: {}, language: 0, last_updated_timestamp: 1, publish_timestamp: 1 },
  num_weekly_favorites: 3,
})
let favorites = [build(11, 1)]
let patchDate = '2026-10-01T12:00:00Z'

vi.mock('@/lib/deadlock/endpoints', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getRanks: async () => [],
  // One known patch, so the `patch` window is its own scope (without one it folds into 7d).
  getPatchFeed: async () => [{ source: 'forum', title: 'Gameplay Update', pub_date: patchDate, link: null }],
  getActiveHeroes: async () => HEROES,
  getHeroStatsByDay: async () => [],
  getBadgeDistribution: async () => [],
}))
vi.mock('@/lib/deadlock/buildEndpoints', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  searchBuilds: async () => favorites,
  getBuildById: async (id: number) => favorites.find((b) => b.hero_build.hero_build_id === id) ?? build(id, 1),
  getSteamNames: async () => [],
  getAccountRanks: async () => [],
}))

// Upstream fake: hero-build-stats only. Tracks requests in flight; hero 1 has one tracked build.
const BUILD_STATS = /^\/v1\/analytics\/hero-build-stats\/(\d+)$/
let refuse = false
let active = 0
let peak = 0
async function upstream(input: string | URL | Request, _init?: RequestInit) {
  const url = new URL(String(input))
  const m = BUILD_STATS.exec(url.pathname)
  if (!m) throw new Error(`unexpected upstream request: ${url.pathname}`)
  active++
  peak = Math.max(peak, active)
  await new Promise((r) => setTimeout(r, 2))
  active--
  if (refuse) return new Response('{}', { status: 403 })
  const rows = m[1] === '1' ? [{ hero_build_id: 11, wins: 180, losses: 120, matches: 300 }] : []
  return new Response(JSON.stringify(rows), { status: 200 })
}
const fetchMock = vi.fn(upstream)
const buildStatsCalls = () => fetchMock.mock.calls.map(([u]) => new URL(String(u))).filter((u) => BUILD_STATS.test(u.pathname))

async function load() {
  vi.resetModules() // fresh client state: budget buckets, in-flight map, access breaker, counters
  const loaders = await import('@/features/builds/loaders')
  const query = await import('@/features/builds/query')
  const client = await import('@/lib/deadlock/client')
  const errors = await import('@/lib/deadlock/errors')
  const { resolveScope } = await import('@/features/meta/scope')
  const { getHeroBuildStats } = await import('@/lib/deadlock/heroEndpoints')
  /** What the prewarm job's "builds tracked stats" stage does: one normal (fetching) call per hero, default scope. */
  const warm = async (heroIds = HEROES.map((h) => h.id)) => {
    const scope = await resolveScope({ window: '30d', rank: 'all', mode: 'all' })
    for (const id of heroIds) await getHeroBuildStats(id, scope.statsQuery)
  }
  const kindOf = (p: Promise<unknown>) => p.then(() => 'ok', (e: unknown) => errors.classifyError(e))
  return { ...loaders, ...query, ...client, warm, kindOf }
}

const T0 = Date.UTC(2026, 9, 14, 0, 30)
beforeEach(() => {
  store.clear()
  fetchMock.mockClear()
  fetchMock.mockImplementation(upstream) // a test may replace it (mockClear keeps implementations)
  refuse = false
  active = 0
  peak = 0
  favorites = [build(11, 1)]
  patchDate = '2026-10-01T12:00:00Z'
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

describe('/builds all-heroes listing: cache-only', () => {
  it('a cold cache sends nothing and fails as pending (never builds without stats)', async () => {
    const c = await load()
    expect(await c.kindOf(c.getBuildsListing(c.DEFAULT_BUILDS_QUERY))).toBe('pending')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(c.apiCallStats().notWarmed).toBeGreaterThan(0)
    expect(c.apiCallStats().network).toBe(0)
  })

  it('once warmed (one call per hero, as the prewarm job does), renders from the cache alone', async () => {
    const c = await load()
    await c.warm()
    expect(buildStatsCalls()).toHaveLength(39)
    expect(peak).toBe(1) // the warm-up is sequential
    fetchMock.mockClear()
    await expect(c.getBuildsListing(c.DEFAULT_BUILDS_QUERY)).resolves.not.toBeNull()
    // Community uses the same per-hero entries, with the build's tracked stats.
    const community = await c.getBuildsListing({ ...c.DEFAULT_BUILDS_QUERY, category: 'community' })
    expect(community?.rows.length).toBeGreaterThan(0) // the fake favorites feed repeats per page
    expect(community?.rows.every((r) => r.id === 11 && r.stats?.matches === 300)).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a partly warmed cache is still pending, with nothing sent for the missing hero', async () => {
    const c = await load()
    await c.warm(HEROES.slice(0, 38).map((h) => h.id))
    fetchMock.mockClear()
    expect(await c.kindOf(c.getBuildsListing(c.DEFAULT_BUILDS_QUERY))).toBe('pending')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('the cache key rolls over at UTC midnight, not every 6 hours', async () => {
    const c = await load()
    await c.warm()
    fetchMock.mockClear()
    for (const hour of [6, 12, 18, 23]) {
      vi.setSystemTime(Date.UTC(2026, 9, 14, hour, 30))
      await expect(c.getBuildsListing(c.DEFAULT_BUILDS_QUERY)).resolves.not.toBeNull()
    }
    vi.setSystemTime(Date.UTC(2026, 9, 15, 0, 30)) // next UTC day: a new key, not warmed yet
    expect(await c.kindOf(c.getBuildsListing(c.DEFAULT_BUILDS_QUERY))).toBe('pending')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('with upstream refusing (breaker open), a cache-only miss reads as refused, not as pending', async () => {
    const c = await load()
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname
      if (path === '/v1/assets/ranks' || path === '/v1/info') return new Response('{}', { status: 403 })
      throw new Error(`unexpected upstream request: ${path}`)
    })
    for (const [path, i] of [['/v1/assets/ranks', 1], ['/v1/assets/ranks', 2], ['/v1/info', 3]] as const) await c.deadlockGet(path, { schema: z.unknown(), revalidate: 60, params: { i } }).catch(() => null)
    expect(c.accessBreakerStatus().global.state).toBe('open')
    fetchMock.mockClear()
    const error = await c.getBuildsListing(c.DEFAULT_BUILDS_QUERY).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 403, circuitOpen: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('/builds scope limits', () => {
  it('every other window × rank of the all-heroes listing is limited, in every category, with nothing sent', async () => {
    const c = await load()
    for (const category of ['meta', 'community', 'pro'] as const) {
      for (const window of ['patch', '7d', '30d'] as const) {
        for (const rank of ['all', 'low', 'mid', 'high', 'top'] as const) {
          if (window === '30d' && rank === 'all') continue
          // As typed in a URL: parsed, then loaded.
          const query = c.parseBuildsQuery({ category, window, rank })
          expect(await c.kindOf(c.getBuildsListing(query))).toBe('limited')
        }
      }
    }
    expect(fetchMock).not.toHaveBeenCalled()
    expect(c.apiCallStats().network).toBe(0)
  })

  it('garbage or unknown parameters parse to the default scope', async () => {
    const c = await load()
    expect(c.parseBuildsQuery({ window: 'forever', rank: 'godlike', category: 'x', utm_source: 'y' })).toEqual(c.DEFAULT_BUILDS_QUERY)
  })

  it('a hero filter keeps every window × rank, one fetching call per scope', async () => {
    favorites = [build(51, 5)]
    const c = await load()
    let minute = 0
    for (const window of ['patch', '7d', '30d'] as const) {
      for (const rank of ['all', 'low', 'mid', 'high', 'top'] as const) {
        vi.setSystemTime(T0 + ++minute * 60_000) // refill the per-instance analytics burst between renders
        await c.getBuildsListing({ ...c.DEFAULT_BUILDS_QUERY, hero: 'hero-5', window, rank })
      }
    }
    const urls = buildStatsCalls()
    expect(urls.every((u) => u.pathname === '/v1/analytics/hero-build-stats/5')).toBe(true)
    expect(new Set(urls.map((u) => u.href)).size).toBe(15)
    expect(urls).toHaveLength(15)
  })

  it('a refused hero-filter render fails as forbidden after one request', async () => {
    favorites = [build(51, 5)]
    refuse = true
    const c = await load()
    expect(await c.kindOf(c.getBuildsListing({ ...c.DEFAULT_BUILDS_QUERY, hero: 'hero-5' }))).toBe('forbidden')
    expect(buildStatsCalls()).toHaveLength(1)
  })
})

describe('patch boundary', () => {
  it('a patch window that starts today has no complete day yet: pending, with nothing sent', async () => {
    patchDate = '2026-10-14T08:00:00Z' // today (T0's UTC day)
    favorites = [build(51, 5)]
    const c = await load()
    expect(await c.kindOf(c.getBuildsListing({ ...c.DEFAULT_BUILDS_QUERY, hero: 'hero-5', window: 'patch' }))).toBe('pending')
    expect(fetchMock).not.toHaveBeenCalled()
    vi.setSystemTime(Date.UTC(2026, 9, 15, 0, 30)) // the next day: one complete day, requested once
    await c.getBuildsListing({ ...c.DEFAULT_BUILDS_QUERY, hero: 'hero-5', window: 'patch' })
    expect(buildStatsCalls().map((u) => [u.searchParams.get('min_unix_timestamp'), u.searchParams.get('max_unix_timestamp')])).toEqual([[String(Date.UTC(2026, 9, 14) / 1000), String(Date.UTC(2026, 9, 15) / 1000)]])
  })
})
