import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeadlockApiError } from '@/lib/deadlock/apiError'

/*
 * Home sections and the shared loaders under them (lib/features/home|meta|builds) with the upstream
 * endpoint functions mocked: no network (fetch throws if anything reaches it) and no database.
 *
 * The fake unstable_cache records every write and follows what the installed Next does inside a render
 * (node_modules/next/dist/server/web/spec-extension/unstable-cache.js): a result is written only when the
 * callback resolves; a stale entry whose recompute throws is served as it was, and not overwritten.
 */
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ getDb: () => null }))

type Entry = { value: unknown; at: number; revalidate: number | false }
const store = new Map<string, Entry>()
const writes: string[] = []
vi.mock('next/cache', () => ({
  unstable_cache:
    (fn: (...args: unknown[]) => Promise<unknown>, keyParts: string[], opts: { revalidate?: number | false } = {}) =>
    async (...args: unknown[]) => {
      const key = JSON.stringify([keyParts, args])
      const hit = store.get(key)
      const stale = hit !== undefined && typeof hit.revalidate === 'number' && Date.now() - hit.at > hit.revalidate * 1000
      if (hit && !stale) return hit.value
      try {
        const value = await fn(...args)
        store.set(key, { value, at: Date.now(), revalidate: opts.revalidate ?? false })
        writes.push(key)
        return value
      } catch (error) {
        if (hit) return hit.value // stale entry kept and served
        throw error
      }
    },
}))

const refused = () => new DeadlockApiError('HTTP 403', 403, '/v1/x')
const circuitOpen = () => new DeadlockApiError('Upstream access refused (circuit open)', 403, '/v1/x', { circuitOpen: true })
const failing = (status: number | null) => new DeadlockApiError(status === null ? 'Request failed: fetch failed' : `HTTP ${status}`, status, '/v1/x')

// Endpoint mocks: defaults load (empty but valid); each test overrides one input.
const endpoints = {
  getRanks: vi.fn(async (): Promise<unknown[]> => []),
  getPatchFeed: vi.fn(async (): Promise<unknown[]> => []),
  getActiveHeroes: vi.fn(async (): Promise<unknown[]> => [{ id: 1, name: 'Abrams', class_name: 'hero_abrams', images: {} }]),
  getHeroStatsByDay: vi.fn(async (): Promise<unknown[]> => []),
  getBadgeDistribution: vi.fn(async (): Promise<unknown[] | null> => []),
  getHeroBans: vi.fn(async (): Promise<unknown[] | null> => []),
  getHeroBuildStats: vi.fn(async (): Promise<unknown[]> => []),
  searchBuilds: vi.fn(async (): Promise<unknown[]> => [build()]),
  getSteamNames: vi.fn(async (): Promise<unknown[]> => [{ account_id: 7, personaname: 'author' }]),
  getAccountRanks: vi.fn(async (): Promise<unknown[]> => []),
}
function build() {
  return { hero_build: { hero_build_id: 11, hero_id: 1, author_account_id: 7, name: 'Build', version: 1, details: {}, language: 0, last_updated_timestamp: 1 }, num_weekly_favorites: 3 }
}
vi.mock('@/lib/deadlock/endpoints', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getRanks: () => endpoints.getRanks(),
  getPatchFeed: () => endpoints.getPatchFeed(),
  getActiveHeroes: () => endpoints.getActiveHeroes(),
  getHeroStatsByDay: () => endpoints.getHeroStatsByDay(),
  getBadgeDistribution: () => endpoints.getBadgeDistribution(),
}))
vi.mock('@/lib/deadlock/heroEndpoints', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getHeroBans: () => endpoints.getHeroBans(),
  getHeroBuildStats: () => endpoints.getHeroBuildStats(),
}))
vi.mock('@/lib/deadlock/buildEndpoints', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  searchBuilds: () => endpoints.searchBuilds(),
  getSteamNames: () => endpoints.getSteamNames(),
  getAccountRanks: () => endpoints.getAccountRanks(),
}))

const T0 = Date.UTC(2026, 9, 14, 12)
const sectionWrites = (name: string) => writes.filter((k) => k.includes(`"home","${name}"`)).length

// One module graph for the whole file (no vi.resetModules): DeadlockApiError above must be the same class the
// loaders check with instanceof. State lives only in the fake cache store, cleared before each test.
async function load() {
  const home = await import('@/features/home/loaders')
  const meta = await import('@/features/meta/loaders')
  const scope = await import('@/features/meta/scope')
  const builds = await import('@/features/builds/loaders')
  const { DEFAULT_QUERY } = await import('@/features/meta/query')
  const { DEFAULT_BUILDS_QUERY } = await import('@/features/builds/query')
  return { ...home, ...meta, ...scope, ...builds, DEFAULT_QUERY, DEFAULT_BUILDS_QUERY }
}

beforeEach(() => {
  store.clear()
  writes.length = 0
  for (const fn of Object.values(endpoints)) fn.mockClear()
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network is not allowed in this test'))))
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  for (const level of ['error', 'warn', 'info'] as const) vi.spyOn(console, level).mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  // Restore the default implementations overridden by a test.
  endpoints.getHeroBans.mockImplementation(async () => [])
  endpoints.getBadgeDistribution.mockImplementation(async () => [])
  endpoints.getPatchFeed.mockImplementation(async () => [])
  endpoints.getHeroBuildStats.mockImplementation(async () => [])
  endpoints.getSteamNames.mockImplementation(async () => [{ account_id: 7, personaname: 'author' }])
  endpoints.getAccountRanks.mockImplementation(async () => [])
})

describe('home performance (bans, S1)', () => {
  it('a refused bans call fails the section and writes nothing to its cache', async () => {
    for (const error of [refused(), circuitOpen()]) {
      store.clear()
      writes.length = 0
      endpoints.getHeroBans.mockImplementation(async () => Promise.reject(error))
      const { getHomePerformance } = await load()
      await expect(getHomePerformance()).resolves.toEqual({ ok: false, error: 'forbidden' })
      expect(sectionWrites('performance')).toBe(0)
    }
  })

  it('any other bans failure still drops only the bans tab, is logged, and is cached as before', async () => {
    for (const error of [failing(500), failing(404), failing(429), failing(null)]) {
      store.clear()
      writes.length = 0
      endpoints.getHeroBans.mockImplementation(async () => Promise.reject(error))
      const { getHomePerformance } = await load()
      const s = await getHomePerformance()
      expect(s.ok).toBe(true)
      expect(sectionWrites('performance')).toBe(1)
      expect(console.error).toHaveBeenCalledWith('[home] bans failed', error)
    }
  })

  it('a stale good entry is kept, not overwritten, when its recompute is refused', async () => {
    const first = await load()
    const good = await first.getHomePerformance()
    expect(good.ok).toBe(true)
    expect(sectionWrites('performance')).toBe(1)
    vi.setSystemTime(T0 + 2 * 60 * 60 * 1000) // past the 1 h section revalidate
    endpoints.getHeroBans.mockImplementation(async () => Promise.reject(refused()))
    const later = await load()
    const s = await later.getHomePerformance()
    expect(sectionWrites('performance')).toBe(1) // still only the good write
    expect(s.ok).toBe(true)
    if (s.ok && good.ok) {
      expect(s.asOf).toBe(good.asOf) // the old entry, with its original time
      expect(s.data).toEqual(good.data)
      expect(s.stale).toBe(false) // within FRESHNESS.analytics (12 h)
    }
    vi.setSystemTime(T0 + 13 * 60 * 60 * 1000)
    const muchLater = await later.getHomePerformance()
    expect(sectionWrites('performance')).toBe(1)
    expect(muchLater).toMatchObject({ ok: true, stale: true }) // the UI's Stale flag once it is older than 12 h
  })
})

describe('shared loaders under Home', () => {
  it('S2 badge distribution: refused → the Meta model is forbidden and Home meta caches nothing; 500 → loads as before', async () => {
    endpoints.getBadgeDistribution.mockImplementation(async () => Promise.reject(refused()))
    const a = await load()
    await expect(a.getMetaPageData(a.DEFAULT_QUERY)).resolves.toMatchObject({ ok: false, kind: 'forbidden' })
    await expect(a.getHomeMeta()).resolves.toEqual({ ok: false, error: 'forbidden' })
    expect(sectionWrites('meta')).toBe(0)

    endpoints.getBadgeDistribution.mockImplementation(async () => Promise.reject(failing(500)))
    const b = await load()
    await expect(b.getMetaPageData(b.DEFAULT_QUERY)).resolves.toMatchObject({ ok: true })
    await expect(b.getHomeMeta()).resolves.toMatchObject({ ok: true })
    expect(sectionWrites('meta')).toBe(1)
  })

  it('S3 patch feed: refused → resolveScope throws; 404/500 → a scope without patches, as before', async () => {
    endpoints.getPatchFeed.mockImplementation(async () => Promise.reject(refused()))
    const a = await load()
    await expect(a.resolveScope({ window: '7d', rank: 'all', mode: 'all' })).rejects.toMatchObject({ status: 403 })
    for (const status of [404, 500]) {
      endpoints.getPatchFeed.mockImplementation(async () => Promise.reject(failing(status)))
      const b = await load()
      await expect(b.resolveScope({ window: '7d', rank: 'all', mode: 'all' })).resolves.toMatchObject({ patches: [] })
    }
  })

  it('S4–S6 build stats, author names and ranks: refused → Home builds fails and caches nothing; 500 → listed as before', async () => {
    for (const [name, fn] of [['stats', endpoints.getHeroBuildStats], ['names', endpoints.getSteamNames], ['ranks', endpoints.getAccountRanks]] as const) {
      store.clear()
      writes.length = 0
      fn.mockImplementation(async () => Promise.reject(refused()))
      const a = await load()
      await expect(a.getHomeBuilds(), name).resolves.toEqual({ ok: false, error: 'forbidden' })
      expect(sectionWrites('builds'), name).toBe(0)
      fn.mockImplementation(async () => Promise.reject(failing(500)))
      store.clear()
      writes.length = 0
      const b = await load()
      const s = await b.getHomeBuilds()
      expect(s.ok, name).toBe(true)
      expect(sectionWrites('builds'), name).toBe(1)
      fn.mockImplementation(async () => [])
    }
  })

  it('no request ever reached fetch', async () => {
    const c = await load()
    await c.getHomeMeta()
    await c.getHomePerformance()
    await c.getHomeBuilds()
    expect(fetch).not.toHaveBeenCalled()
  })
})
