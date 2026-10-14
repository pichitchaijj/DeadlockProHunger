import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeadlockApiError } from '@/lib/deadlock/apiError'
import { classifyError } from '@/lib/deadlock/errors'

/*
 * Build Detail existence vs scope limits, and refused access (401/403) through the loaders' optional inputs.
 * - A build that doesn't exist is missing (404) at every scope; only a real build is `limited`; a refused lookup
 *   is never "missing".
 * - Optional inputs fall back on ordinary failures (5xx, 429, …) but rethrow refused access (softFail), so a page
 *   never shows a refused input as "no data".
 * Every upstream function is mocked; fetch throws, so no request can leave the test. No database.
 */
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ getDb: () => null }))
vi.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>) => fn }))

const DAY = 86_400
const T0 = Date.UTC(2026, 9, 14, 12)
const today = Date.UTC(2026, 9, 14) / 1000

/** Per-test behavior of the mocked upstream functions: a value (or a factory), or an error to reject with. */
const up = vi.hoisted(() => ({
  fail: new Map<string, Error>(),
  buildById: new Map<number, unknown>(),
  calls: new Map<string, number>(),
}))
async function run<T>(name: string, value: T): Promise<T> {
  up.calls.set(name, (up.calls.get(name) ?? 0) + 1)
  const error = up.fail.get(name)
  if (error) throw error
  return value
}

const HEROES = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, name: `Hero ${i + 1}`, class_name: `hero_${i + 1}`, images: {} }))
const dayRows = () =>
  HEROES.flatMap((h) => Array.from({ length: 14 }, (_, i) => ({ hero_id: h.id, bucket: today - (13 - i) * DAY, wins: 500, losses: 500, matches: 1000, total_kills: 0, total_deaths: 0, total_assists: 0 })))
const build = (id: number, heroId: number) => ({
  hero_build: {
    hero_build_id: id,
    origin_build_id: id,
    hero_id: heroId,
    author_account_id: 7,
    name: `Build ${id}`,
    version: 1,
    details: { mod_categories: [] },
    language: 0,
    last_updated_timestamp: 1,
    publish_timestamp: 1,
  },
  num_weekly_favorites: 3,
})

vi.mock('@/lib/deadlock/endpoints', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getRanks: async () => [],
  getPatchFeed: async () => [{ source: 'forum', title: 'Gameplay Update', pub_date: '2026-09-01T12:00:00Z', link: null }],
  getActiveHeroes: () => run('getActiveHeroes', HEROES),
  getHeroStatsByDay: () => run('getHeroStatsByDay', dayRows()),
  getBadgeDistribution: async () => [],
  getHeroTotals: () => run('getHeroTotals', []),
  getHeroTotalsCompleteDays: () => run('getHeroTotalsCompleteDays', []),
}))
vi.mock('@/lib/deadlock/heroEndpoints', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getHeroCounters: async () => [],
  getHeroSynergies: async () => [],
  getHeroStatsForDuration: async () => [],
  getHeroStatsByBadge: async () => [],
  getHeroAbilities: async () => [],
  getShopItems: async () => [],
  getTopBuilds: async () => [],
  getHeroBuildStats: () => run('getHeroBuildStats', [{ hero_build_id: 51, wins: 3000, losses: 2000, matches: 5000 }]),
  getAbilityOrderStats: () => run('getAbilityOrderStats', []),
  getHeroItemStats: () => run('getHeroItemStats', []),
}))
vi.mock('@/lib/deadlock/buildEndpoints', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getBuildById: (id: number) => run('getBuildById', up.buildById.has(id) ? up.buildById.get(id) : build(id, 5)),
  searchBuilds: () => run('searchBuilds', []),
  getSteamNames: () => run('getSteamNames', []),
  getAccountRanks: () => run('getAccountRanks', []),
  getItemFlow: () => run('getItemFlow', { nodes: [], edges: [], reached_per_column: [], baseline: { wins: 0, matches: 0 } }),
}))
vi.mock('@/lib/deadlock/itemEndpoints', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getItemTotals: () => run('getItemTotals', []),
  getItemStatsByDay: () => run('getItemStatsByDay', []),
}))
vi.mock('@/lib/deadlock/patchEndpoints', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  buildBefore: async (unix: number) => ({ version: unix, builtAt: unix }),
  getAssetSnapshot: () => run('getAssetSnapshot', []),
}))

const refused = (status: 401 | 403 = 403) => new DeadlockApiError(`Request failed with ${status}`, status, '/v1/test')
const broken = () => new DeadlockApiError('Request failed with 500', 500, '/v1/test')
const kindOf = (p: Promise<unknown>) => p.then(() => 'ok', (e: unknown) => classifyError(e))
const fetchMock = vi.fn(async (input: string | URL | Request) => {
  throw new Error(`unexpected network request: ${String(input)}`)
})

beforeEach(() => {
  up.fail.clear()
  up.buildById.clear()
  up.calls.clear()
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  for (const level of ['warn', 'info', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {})
})
afterEach(() => {
  expect(fetchMock).not.toHaveBeenCalled()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const builds = () => import('@/features/builds/loaders')
const ANALYTICS = ['getHeroBuildStats', 'getHeroItemStats', 'getAbilityOrderStats', 'getItemFlow', 'getHeroTotalsCompleteDays']

describe('Build Detail: existence before scope limits', () => {
  it('a nonexistent build at a limited rank is missing (404), with no analytics requested', async () => {
    const { getBuildDetail, loadBuildDetail, buildLoadStatus } = await builds()
    up.buildById.set(999, null)
    expect(await getBuildDetail('hero-5', 999, { window: '30d', rank: 'top' })).toBeNull()
    expect(buildLoadStatus(await loadBuildDetail('hero-5', 999, '30d', 'top'))).toBe('missing')
    for (const name of ANALYTICS) expect(up.calls.get(name) ?? 0).toBe(0)
  })

  it('a build of an inactive hero at a limited rank is missing too', async () => {
    const { getBuildDetail } = await builds()
    up.buildById.set(77, build(77, 42))
    expect(await getBuildDetail('hero-42', 77, { window: '30d', rank: 'mid' })).toBeNull()
  })

  it('an existing build at a limited rank is limited (not missing), with no analytics requested', async () => {
    const { getBuildDetail, loadBuildDetail, buildLoadStatus } = await builds()
    for (const rank of ['low', 'mid', 'high', 'top'] as const) {
      expect(await kindOf(getBuildDetail('hero-5', 51, { window: '30d', rank }))).toBe('limited')
    }
    const load = await loadBuildDetail('hero-5', 51, '7d', 'top')
    expect(load).toEqual({ ok: false, kind: 'limited' })
    expect(buildLoadStatus(load)).toBe('failed')
    for (const name of ANALYTICS) expect(up.calls.get(name) ?? 0).toBe(0)
  })

  it('a wrong hero slug at a limited rank redirects to the right one, keeping the scope', async () => {
    const { getBuildDetail } = await builds()
    expect(await getBuildDetail('hero-2', 51, { window: '30d', rank: 'top' })).toEqual({ kind: 'redirect', href: '/builds/hero-5/51?rank=top' })
  })

  it('a refused build lookup is never missing: forbidden at limited and default ranks, one lookup each', async () => {
    const { loadBuildDetail, buildLoadStatus } = await builds()
    up.fail.set('getBuildById', refused())
    for (const rank of ['top', 'all'] as const) {
      const load = await loadBuildDetail('hero-5', 51, '30d', rank)
      expect(load).toEqual({ ok: false, kind: 'forbidden' })
      expect(buildLoadStatus(load)).toBe('failed')
    }
    expect(up.calls.get('getBuildById')).toBe(2)
  })

  it('at the default rank, a nonexistent build is still missing and a real one renders', async () => {
    const { getBuildDetail } = await builds()
    up.buildById.set(999, null)
    expect(await getBuildDetail('hero-5', 999, { window: '30d', rank: 'all' })).toBeNull()
    expect(await getBuildDetail('hero-5', 51, { window: '30d', rank: 'all' })).toMatchObject({ kind: 'build' })
  })
})

describe('Build Detail optional inputs: refused access propagates, ordinary failures fall back', () => {
  for (const input of ['getAbilityOrderStats', 'getSteamNames', 'getAccountRanks']) {
    it(`${input}: 401/403 fail the detail as forbidden; a 5xx keeps the fallback`, async () => {
      const { getBuildDetail } = await builds()
      for (const status of [401, 403] as const) {
        up.fail.set(input, refused(status))
        expect(await kindOf(getBuildDetail('hero-5', 51, { window: '30d', rank: 'all' }))).toBe('forbidden')
      }
      up.fail.set(input, broken())
      expect(await getBuildDetail('hero-5', 51, { window: '30d', rank: 'all' })).toMatchObject({ kind: 'build' })
      expect(up.calls.get(input)).toBe(3) // one call per render: nothing retried
    })
  }
})

describe('Builds listing: candidate build lookups', () => {
  const query = { category: 'meta', hero: 'hero-5', window: '30d', rank: 'all' } as const

  it('a refused lookup fails the listing as forbidden; a 5xx drops only that build', async () => {
    const { getBuildsListing } = await builds()
    up.fail.set('getBuildById', refused())
    expect(await kindOf(getBuildsListing(query))).toBe('forbidden')
    up.fail.set('getBuildById', broken())
    expect(await getBuildsListing(query)).toMatchObject({ rows: [] })
    expect(up.calls.get('getBuildById')).toBe(2)
  })
})

describe('Hero overview: weekly item stats and per-day rows', () => {
  async function overview() {
    const { getHeroContext, getOverviewData } = await import('@/features/hero/loaders')
    const { DEFAULT_HERO_QUERY } = await import('@/features/hero/query')
    const ctx = await getHeroContext('hero-5', DEFAULT_HERO_QUERY)
    if (!ctx) throw new Error('unknown hero')
    return () => getOverviewData(ctx)
  }

  it('refused weekly item stats fail the overview as forbidden; a 5xx drops only the item insight', async () => {
    const load = await overview()
    up.fail.set('getHeroItemStats', refused())
    expect(await kindOf(load())).toBe('forbidden')
    up.fail.set('getHeroItemStats', broken())
    const data = await load()
    expect(data.insights.find((i) => i.kind === 'item-trend')).toBeUndefined()
  })

  it('refused per-day rows fail the overview as forbidden; a 5xx keeps the overview', async () => {
    const load = await overview()
    up.fail.set('getHeroStatsByDay', refused(401))
    expect(await kindOf(load())).toBe('forbidden')
    up.fail.set('getHeroStatsByDay', broken())
    expect(await kindOf(load())).toBe('ok')
  })
})

describe('Items: buy-rate denominator', () => {
  it('refused hero totals fail the items as forbidden; a 5xx leaves buy rate unavailable', async () => {
    const { getItemContext, itemTotals } = await import('@/features/items/loaders')
    const { DEFAULT_ITEMS_QUERY } = await import('@/features/items/query')
    const ctx = await getItemContext(DEFAULT_ITEMS_QUERY)
    if (ctx === 'unknown-hero') throw new Error('unexpected')
    up.fail.set('getHeroTotalsCompleteDays', refused())
    expect(await kindOf(itemTotals(ctx))).toBe('forbidden')
    up.fail.set('getHeroTotalsCompleteDays', broken())
    expect(await itemTotals(ctx)).toEqual([])
    expect(up.calls.get('getHeroTotalsCompleteDays')).toBe(2)
  })
})

describe('Patches: item impact and game-file diff', () => {
  const patches = [
    { id: '2026-10-10', day: today - 4 * DAY, title: 'B', notesHtml: null, links: [] },
    { id: '2026-10-01', day: today - 13 * DAY, title: 'A', notesHtml: null, links: [] },
  ]
  async function context() {
    const loaders = await import('@/features/patches/loaders')
    const { DEFAULT_PATCH_QUERY } = await import('@/features/patches/query')
    const ctx = await loaders.getPatchContext(DEFAULT_PATCH_QUERY)
    if (typeof ctx === 'string') throw new Error('unexpected')
    return { loaders, ctx }
  }

  it('refused item-by-day stats fail the impact as forbidden; a 5xx leaves items out', async () => {
    const { loaders, ctx } = await context()
    up.fail.set('getItemStatsByDay', refused())
    expect(await kindOf(loaders.getPatchImpact(patches, 1, ctx))).toBe('forbidden')
    up.fail.set('getItemStatsByDay', broken())
    expect(await loaders.getPatchImpact(patches, 1, ctx)).toMatchObject({ items: null })
  })

  it('a refused asset snapshot fails the comparison as forbidden; a 5xx leaves the diff out', async () => {
    const { loaders, ctx } = await context()
    up.fail.set('getAssetSnapshot', refused())
    expect(await kindOf(loaders.getPatchCompare(patches, 0, 1, ctx))).toBe('forbidden')
    up.fail.set('getAssetSnapshot', broken())
    expect(await loaders.getPatchCompare(patches, 0, 1, ctx)).toMatchObject({ diff: null })
    expect(up.calls.get('getAssetSnapshot')).toBe(2) // sequential snapshots: the first failure stops the diff
  })
})
