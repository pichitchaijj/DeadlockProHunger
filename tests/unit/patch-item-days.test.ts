import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HeroStatsQuery } from '@/lib/deadlock/endpoints'

/*
 * getItemStatsByDay (item-stats bucketed by day: Patch impact) follows the costly-analytics policy
 * (lib/deadlock/expensive.ts): complete UTC days, a key that changes once a day, TTL.expensiveAnalytics, and no
 * request when no complete day is left. Patch impact's item buy rates divide by hero matches over those same days.
 * The real endpoint and client run against a fetch fake that records every request; no network, no database.
 */
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ getDb: () => null }))

const store = new Map<string, unknown>()
const revalidates = new Map<string, number | false | undefined>()
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>, keyParts: string[], options: { revalidate?: number | false }) => async (...args: unknown[]) => {
    const key = JSON.stringify([keyParts, args])
    if (store.has(key)) return store.get(key)
    const value = await fn(...args) // a throw is not stored (as in Next)
    store.set(key, value)
    revalidates.set(key, options?.revalidate)
    return value
  },
}))

const DAY = 86_400
const HOUR = 3_600
const HEROES = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, name: `Hero ${i + 1}`, class_name: `hero_${i + 1}`, images: {} }))
/** Every hero 1000 matches on every day up to and including `last` (today's partial bucket too). */
let heroDayRows: (last: number) => unknown[] = () => []
let clockDay = 0
vi.mock('@/lib/deadlock/endpoints', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getRanks: async () => [],
  getPatchFeed: async () => [],
  getActiveHeroes: async () => HEROES,
  getHeroStatsByDay: async () => heroDayRows(clockDay),
  getBadgeDistribution: async () => [],
}))
vi.mock('@/lib/deadlock/heroEndpoints', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getShopItems: async () => [{ id: 1, className: null, shopable: true, name: 'Item One', slot: 'weapon', tier: 1, cost: 800, icon: null }],
}))

/** item-stats by day: item 1 bought in 600 matches on every requested day (from the request's own bounds). */
async function upstream(input: string | URL | Request) {
  const url = new URL(String(input))
  if (url.pathname !== '/v1/analytics/item-stats' || url.searchParams.get('bucket') !== 'start_time_day') throw new Error(`unexpected upstream request: ${url.pathname}`)
  const min = Number(url.searchParams.get('min_unix_timestamp'))
  const max = Number(url.searchParams.get('max_unix_timestamp'))
  const rows = []
  for (let day = Math.floor(min / DAY) * DAY; day <= Math.floor(max / DAY) * DAY; day += DAY) rows.push({ item_id: 1, bucket: day, wins: 300, losses: 300, matches: 600, players: 600 })
  return Response.json(rows)
}
const fetchMock = vi.fn(upstream)
const requests = () => fetchMock.mock.calls.map(([u]) => new URL(String(u)).searchParams)

async function load() {
  vi.resetModules()
  return {
    items: await import('@/lib/deadlock/itemEndpoints'),
    errors: await import('@/lib/deadlock/errors'),
    ttl: (await import('@/lib/cache/ttl')).TTL,
    patches: await import('@/features/patches/loaders'),
    patchQuery: await import('@/features/patches/query'),
  }
}
const at = (ms: number) => {
  vi.setSystemTime(ms)
  clockDay = Math.floor(ms / 1000 / DAY) * DAY
}

const today = Date.UTC(2026, 9, 14) / 1000
beforeEach(() => {
  store.clear()
  revalidates.clear()
  fetchMock.mockClear()
  fetchMock.mockImplementation(upstream)
  heroDayRows = (last) => HEROES.flatMap((h) => Array.from({ length: 20 }, (_, i) => ({ hero_id: h.id, bucket: last - i * DAY, wins: 500, losses: 500, matches: 1000, total_kills: 0, total_deaths: 0, total_assists: 0 })))
  vi.stubGlobal('fetch', fetchMock)
  vi.useFakeTimers({ toFake: ['Date'] })
  at(today * 1000 + 30 * 60_000)
  for (const level of ['warn', 'info', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('getItemStatsByDay: complete UTC days, daily key', () => {
  const window = (asOf: number): HeroStatsQuery => ({ minUnix: today - 6 * DAY, maxUnix: asOf, matchMode: 'ranked,unranked' })

  it('every 6h step of a UTC day shares one key and one request (today cut); the next day is a new key', async () => {
    const m = await load()
    for (const step of [0, 6, 12, 18]) {
      at((today + step * HOUR + 30 * 60) * 1000)
      await m.items.getItemStatsByDay(window(today + step * HOUR))
    }
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect([requests()[0].get('min_unix_timestamp'), requests()[0].get('max_unix_timestamp')]).toEqual([String(today - 6 * DAY), String(today - DAY + 12 * HOUR)])

    at((today + DAY + 30 * 60) * 1000)
    await m.items.getItemStatsByDay(window(today + DAY))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(requests()[1].get('max_unix_timestamp')).toBe(String(today + 12 * HOUR))
  })

  it('is cached for TTL.expensiveAnalytics (a day), not the 6h analytics TTL', async () => {
    const m = await load()
    await m.items.getItemStatsByDay(window(today))
    expect([...revalidates.values()]).toEqual([m.ttl.expensiveAnalytics])
    expect(m.ttl.expensiveAnalytics).toBe(DAY)
  })

  it('a window with no complete day (today only) is pending, with nothing sent', async () => {
    const m = await load()
    const kind = await m.items.getItemStatsByDay({ minUnix: today, maxUnix: today }).then(
      () => 'ok',
      (e: unknown) => m.errors.classifyError(e),
    )
    expect(kind).toBe('pending')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('Patch impact: item buy rates over complete days', () => {
  const patches = (day: number) => [
    { id: 'p2', day, title: 'B', notesHtml: null, links: [] },
    { id: 'p1', day: day - 20 * DAY, title: 'A', notesHtml: null, links: [] },
  ]
  async function impact(m: Awaited<ReturnType<typeof load>>, patchDay: number) {
    const ctx = await m.patches.getPatchContext(m.patchQuery.DEFAULT_PATCH_QUERY)
    if (typeof ctx === 'string') throw new Error('unexpected')
    return m.patches.getPatchImpact(patches(patchDay), 0, ctx)
  }

  it('two days after the patch: items cover the 2 complete days, divided by hero matches on those days only', async () => {
    const m = await load()
    at((today + 18 * HOUR) * 1000)
    const result = await impact(m, today - 2 * DAY)
    expect(requests()).toHaveLength(1)
    expect(requests()[0].get('max_unix_timestamp')).toBe(String(today - DAY + 12 * HOUR)) // through yesterday
    const item = result.items?.find((i) => i.id === 1)
    // 2 days × 600 buyers ÷ (2 days × 6 heroes × 1000); with today's hero matches it would read 1200 / 18000.
    expect(item?.rateAfter).toBeCloseTo(1200 / 12_000)
    expect(item?.rateBefore).toBeCloseTo((7 * 600) / (7 * 6000))
    expect(result.heroes?.length).toBe(HEROES.length) // heroes keep their own window (today included)
    expect(result.after.days).toBe(3)
  })

  it('one day boundary across midnight: a scope resolved before 00:00 UTC cuts the item query at its own day', async () => {
    const m = await load()
    at((today + DAY - 1) * 1000) // 23:59:59 on `today`
    const ctx = await m.patches.getPatchContext(m.patchQuery.DEFAULT_PATCH_QUERY)
    if (typeof ctx === 'string') throw new Error('unexpected')
    at((today + DAY + 1) * 1000) // the same request, now past midnight
    const result = await m.patches.getPatchImpact(patches(today - 2 * DAY), 0, ctx)
    expect(result.itemsAfter).toEqual({ from: today - 2 * DAY, to: today, days: 2 })
    // The query ends where the window does (yesterday from the scope's day), not at the clock's new yesterday.
    expect(requests().map((r) => r.get('max_unix_timestamp'))).toEqual([String(today - DAY + 12 * HOUR)])
    expect(result.items?.find((i) => i.id === 1)?.rateAfter).toBeCloseTo(1200 / 12_000)
  })

  it('on the patch day itself: hero impact as before, no item-stats request, items unavailable', async () => {
    const m = await load()
    at((today + 18 * HOUR) * 1000)
    const result = await impact(m, today)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.items).toBeNull()
    expect(result.heroes).not.toBeNull()
  })
})
