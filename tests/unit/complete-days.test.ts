import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * H1 regression: every share whose numerator is item-stats (buy rates, the item page's heroes, item progression,
 * build phase items, weekly item shares) divides by hero matches over the SAME complete UTC days. item-stats cuts
 * today (lib/deadlock/expensive.ts); a denominator that still counted today made shares too low late in the day
 * (numerator frozen at fill time, denominator refreshed every 6h) and could make or hide an item-trend insight.
 * Upstream is a fetch fake; cheap sources are mocked. No network, no database.
 */
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ getDb: () => null }))

const store = new Map<string, unknown>()
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>, keyParts: string[]) => async (...args: unknown[]) => {
    const key = JSON.stringify([keyParts, args])
    if (store.has(key)) return store.get(key)
    const value = await fn(...args)
    store.set(key, value)
    return value
  },
}))

const DAY = 86_400
const T0 = Date.UTC(2026, 9, 14, 18, 30) // late in the UTC day: the worst case for a partial "today"
const today = Date.UTC(2026, 9, 14) / 1000
const HEROES = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, name: `Hero ${i + 1}`, class_name: `hero_${i + 1}`, images: {} }))

// Per-day hero rows (Meta model, Hero Detail day rows): every hero 1000 matches a day, today included.
const dayRows = () =>
  HEROES.flatMap((h) =>
    Array.from({ length: 60 }, (_, i) => ({ hero_id: h.id, bucket: today - (59 - i) * DAY, wins: 500, losses: 500, matches: 1000, total_kills: 0, total_deaths: 0, total_assists: 0 })),
  )

vi.mock('@/lib/deadlock/endpoints', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getRanks: async () => [],
  getPatchFeed: async () => [{ source: 'forum', title: 'Gameplay Update', pub_date: '2026-09-01T12:00:00Z', link: null }],
  getActiveHeroes: async () => HEROES,
  getHeroStatsByDay: async () => dayRows(),
  getBadgeDistribution: async () => [],
}))
let favorites: unknown[] = []
const build = (id: number, heroId: number) => ({
  hero_build: {
    hero_build_id: id,
    origin_build_id: id,
    hero_id: heroId,
    author_account_id: 7,
    name: `Build ${id}`,
    version: 1,
    details: { mod_categories: [{ name: 'Early', mods: [{ ability_id: 1 }] }] },
    language: 0,
    last_updated_timestamp: 1,
    publish_timestamp: 1,
  },
  num_weekly_favorites: 3,
})
vi.mock('@/lib/deadlock/buildEndpoints', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  searchBuilds: async (o: { start?: number }) => (o.start ? [] : favorites),
  getBuildById: async (id: number) => build(id, 5),
  getSteamNames: async () => [],
  getAccountRanks: async () => [],
}))
const SHOP = [{ id: 1, className: null, shopable: true, name: 'Item One', slot: 'weapon', tier: 1, cost: 800, icon: null }]
vi.mock('@/lib/deadlock/heroEndpoints', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getHeroCounters: async () => [],
  getHeroSynergies: async () => [],
  getHeroStatsForDuration: async () => [],
  getHeroStatsByBadge: async () => [],
  getHeroAbilities: async () => [],
  getShopItems: async () => SHOP,
  getTopBuilds: async () => [],
}))

// Upstream fake. hero-stats totals (the complete-days denominators): hero 5 has 6000 matches = 6 complete days.
let heroTotals = HEROES.map((h) => ({ hero_id: h.id, wins: 0, matches: h.id === 5 ? 6000 : 1000, total_player_damage: 0, total_player_damage_taken: 0, total_boss_damage: 0 }))
let itemWeek = { current: 1800, previous: 2100 }
async function upstream(input: string | URL | Request) {
  const url = new URL(String(input))
  const p = url.searchParams
  await new Promise((r) => setTimeout(r, 1))
  if (url.pathname === '/v1/analytics/hero-stats' && !p.has('bucket')) return Response.json(heroTotals)
  if (url.pathname === '/v1/analytics/item-stats') {
    if (p.get('bucket') === 'hero') return Response.json([{ item_id: 1, bucket: 5, wins: 300, matches: 600 }])
    const previous = p.get('min_unix_timestamp') === String(today - 13 * DAY)
    const matches = p.has('hero_id') ? (previous ? itemWeek.previous : itemWeek.current) : 1100
    return Response.json([{ item_id: 1, wins: matches / 2, losses: matches / 2, matches, players: matches, avg_buy_time_s: 300 }])
  }
  if (/^\/v1\/analytics\/(hero-build-stats\/\d+|ability-order-stats)$/.test(url.pathname)) return Response.json([])
  if (url.pathname === '/v1/analytics/item-flow-stats') return Response.json({ nodes: [], edges: [], reached_per_column: [], baseline: { wins: 0, matches: 0 } })
  throw new Error(`unexpected upstream request: ${url.pathname}`)
}
const fetchMock = vi.fn(upstream)
const calls = () => fetchMock.mock.calls.map(([u]) => new URL(String(u)))
/** The [min, max] window of every request to `path` (optionally only those with `param`). */
const windows = (path: string, has?: string) =>
  calls()
    .filter((u) => u.pathname === path && (!has || u.searchParams.has(has)))
    .map((u) => [Number(u.searchParams.get('min_unix_timestamp')), Number(u.searchParams.get('max_unix_timestamp'))])

async function load() {
  vi.resetModules()
  return {
    items: await import('@/features/items/loaders'),
    itemQuery: await import('@/features/items/query'),
    hero: await import('@/features/hero/loaders'),
    heroQuery: await import('@/features/hero/query'),
    builds: await import('@/features/builds/loaders'),
    buildsQuery: await import('@/features/builds/query'),
    model: await import('@/features/hero/model'),
    insights: await import('@/lib/analytics/insights'),
  }
}

const throughYesterday = today - DAY + 12 * 3600
beforeEach(() => {
  store.clear()
  fetchMock.mockClear()
  fetchMock.mockImplementation(upstream)
  favorites = []
  itemWeek = { current: 1800, previous: 2100 }
  heroTotals = HEROES.map((h) => ({ hero_id: h.id, wins: 0, matches: h.id === 5 ? 6000 : 1000, total_player_damage: 0, total_player_damage_taken: 0, total_boss_damage: 0 }))
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

describe('Items: buy rate and heroes', () => {
  it('buy rate divides item-stats by hero matches over the same complete days (7d window: 6 complete days, today cut)', async () => {
    const m = await load()
    const ctx = await m.items.getItemContext(m.itemQuery.DEFAULT_ITEMS_QUERY)
    if (ctx === 'unknown-hero') throw new Error('unexpected')
    const [row] = await m.items.itemTotals(ctx)
    const item = windows('/v1/analytics/item-stats')
    const heroes = windows('/v1/analytics/hero-stats')
    expect(item).toEqual([[today - 6 * DAY, throughYesterday]])
    expect(heroes).toEqual(item) // same days: from 6 days ago through yesterday
    expect(row.buyRate).toBe(1100 / (6000 + 5 * 1000))
  })

  it('with a hero filter, the hero’s own matches over the same days', async () => {
    const m = await load()
    const ctx = await m.items.getItemContext({ ...m.itemQuery.DEFAULT_ITEMS_QUERY, hero: 'hero-5' })
    if (ctx === 'unknown-hero') throw new Error('unexpected')
    const [row] = await m.items.itemTotals(ctx)
    expect(windows('/v1/analytics/hero-stats')).toEqual(windows('/v1/analytics/item-stats'))
    expect(row.buyRate).toBe(1800 / 6000) // the fake's per-hero item-stats: 1800 purchases
  })

  it('the heroes section uses the same days for each hero’s share', async () => {
    const m = await load()
    const ctx = await m.items.getItemContext(m.itemQuery.DEFAULT_ITEMS_QUERY)
    if (ctx === 'unknown-hero') throw new Error('unexpected')
    const rows = await m.items.getItemHeroes({ id: 1, name: 'Item One', slug: 'item-one' } as Parameters<typeof m.items.getItemHeroes>[0], ctx)
    expect(windows('/v1/analytics/hero-stats')).toEqual(windows('/v1/analytics/item-stats', 'bucket'))
    expect(rows.find((r) => r.id === 5)?.buyRate).toBe(600 / 6000)
  })
})

describe('Hero Detail and Build Detail shares', () => {
  const heroCtx = async (m: Awaited<ReturnType<typeof load>>) => {
    const ctx = await m.hero.getHeroContext('hero-5', m.heroQuery.DEFAULT_HERO_QUERY)
    if (!ctx) throw new Error('unknown hero')
    return ctx
  }

  it('item progression divides by hero matches over the same complete days, not the Meta window that counts today', async () => {
    const m = await load()
    const ctx = await heroCtx(m)
    expect(ctx.stats?.matches).toBe(7000) // Meta: 7 days including today
    itemWeek = { current: 1000, previous: 1000 } // 1000 / 6000 = 16.7% ≥ 15% core; 1000 / 7000 = 14.3% would not be
    const data = await m.hero.getBuildsData(ctx)
    expect(windows('/v1/analytics/hero-stats')).toEqual(windows('/v1/analytics/item-stats', 'hero_id'))
    const items = data.progression.flatMap((p) => p.items)
    expect(items.map((i) => [i.id, i.buyRate])).toEqual([[1, 1000 / 6000]])
  })

  it('build phase items divide by hero matches over the same complete days', async () => {
    const m = await load()
    const detail = await m.builds.getBuildDetail('hero-5', 51, { window: '7d', rank: 'all' })
    if (!detail || detail.kind !== 'build') throw new Error('unexpected')
    expect(windows('/v1/analytics/hero-stats')).toEqual(windows('/v1/analytics/item-stats', 'hero_id'))
    const items = [...detail.phases.phases.flatMap((p) => p.items), ...detail.phases.untimed]
    expect(items.find((i) => i.id === 1)?.buyRate).toBe(1800 / 6000)
  })

  it('weekly item shares: each week’s buyers over the hero’s matches on the same days; equal shares raise no insight', async () => {
    const m = await load()
    const ctx = await heroCtx(m)
    // 1800 / 6000 (6 complete days) = 30% vs 2100 / 7000 (the 7 days before) = 30%: no change.
    // Dividing this week by the Meta week (7 days incl. today, 7000) would read 25.7%: a −4.3pp "trend" (≥ 3pp).
    const overview = await m.hero.getOverviewData(ctx)
    expect(windows('/v1/analytics/item-stats', 'hero_id').sort()).toEqual(
      [
        [today - 13 * DAY, today - 7 * DAY + 12 * 3600],
        [today - 6 * DAY, throughYesterday],
      ].sort(),
    )
    expect(overview.insights.find((i) => i.kind === 'item-trend')).toBeUndefined()
  })

  it('a real ≥ 3pp change is still reported, with the aligned shares and hero matches', async () => {
    const m = await load()
    itemWeek = { current: 2400, previous: 2100 } // 40% vs 30%
    const overview = await m.hero.getOverviewData(await heroCtx(m))
    const trend = overview.insights.find((i) => i.kind === 'item-trend')
    expect(trend).toMatchObject({ current: { buyers: 2400, heroMatches: 6000, share: 0.4 }, previous: { buyers: 2100, heroMatches: 7000, share: 0.3 } })
    expect(m.insights.ITEM_TREND_MIN_SHIFT).toBe(0.03)
  })

  it('heroMatchesInDays counts [from, to) only', async () => {
    const { model } = await load()
    const rows = [
      { hero_id: 5, bucket: today - DAY, matches: 10 },
      { hero_id: 5, bucket: today, matches: 99 },
      { hero_id: 4, bucket: today - DAY, matches: 7 },
    ]
    expect(model.heroMatchesInDays(rows, 5, today - 6 * DAY, today)).toBe(10)
  })
})

describe('H2: builds of inactive heroes in the cache-only listing', () => {
  it('a favorite build of an inactive hero is dropped before the stats read, so the warmed listing still renders', async () => {
    const m = await load()
    favorites = [build(51, 5), build(99, 42), build(52, 2)] // hero 42 isn't active: the prewarm job never warms it
    const { resolveScope } = await import('@/features/meta/scope')
    const { getHeroBuildStats } = await import('@/lib/deadlock/heroEndpoints')
    const scope = await resolveScope({ window: '30d', rank: 'all', mode: 'all' })
    for (const h of HEROES) await getHeroBuildStats(h.id, scope.statsQuery) // the prewarm job's stage
    fetchMock.mockClear()
    for (const category of ['community', 'pro'] as const) {
      const listing = await m.builds.getBuildsListing({ ...m.buildsQuery.DEFAULT_BUILDS_QUERY, category })
      if (category === 'community') expect(listing?.rows.map((r) => [r.id, r.hero.id])).toEqual([[51, 5], [52, 2]]) // order kept
    }
    expect(calls().filter((u) => u.pathname.startsWith('/v1/analytics/hero-build-stats/'))).toHaveLength(0)
  })
})

// Last in the file: it moves the fake clock forward, and later tests would start earlier again (see below).
describe('UTC day boundary', () => {
  it('the windows hold from 00:00 to 23:59 UTC and move to the next day at midnight', async () => {
    // The next UTC days (the fake clock only moves forward: the mocked endpoints module, cached across
    // vi.resetModules, keeps one client whose token bucket assumes a forward clock).
    const d = today + DAY
    const m = await load()
    const at = async (ms: number) => {
      vi.setSystemTime(ms)
      fetchMock.mockClear()
      const ctx = await m.items.getItemContext(m.itemQuery.DEFAULT_ITEMS_QUERY)
      if (ctx === 'unknown-hero') throw new Error('unexpected')
      await m.items.itemTotals(ctx)
      return [windows('/v1/analytics/item-stats'), windows('/v1/analytics/hero-stats')]
    }
    const window = (day: number) => [[day - 6 * DAY, day - DAY + 12 * 3600]] // 6 complete days, through the day before
    expect(await at(d * 1000)).toEqual([window(d), window(d)]) // 00:00 exactly
    expect(await at((d + DAY) * 1000 - 60_000)).toEqual([[], []]) // 23:59, same day: same keys, cache hits
    expect(await at((d + DAY) * 1000)).toEqual([window(d + DAY), window(d + DAY)]) // next midnight: the next day's keys
  })
})
