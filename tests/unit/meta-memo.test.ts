import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MetaQuery } from '@/features/meta/query'

/*
 * getMetaPageData's process-local memo (features/meta/loaders.ts): a successful live result is reused for at most
 * 30 s within one analytics key step and UTC day; concurrent callers share one computation; failures, database
 * snapshots and rejections are never kept; at most 64 entries; results are deep-frozen.
 * Every upstream source is a mock (computations are counted by getHeroStatsByDay calls); fetch throws, so nothing
 * can reach the network; the database store is mocked.
 */
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ getDb: () => null }))

const DAY = 86_400
const HOUR = 3_600
const today = Date.UTC(2026, 9, 14) / 1000
const HEROES = Array.from({ length: 4 }, (_, i) => ({ id: i + 1, name: `Hero ${i + 1}`, class_name: `hero_${i + 1}`, hero_type: 'brawler', images: {} }))
const rows = () =>
  HEROES.flatMap((h) =>
    Array.from({ length: 30 }, (_, d) => ({ hero_id: h.id, bucket: today - d * DAY, wins: 500 + h.id * 10, losses: 500, matches: 1000 + h.id * 10, total_kills: 0, total_deaths: 0, total_assists: 0, total_net_worth: 0 })),
  )

const up = vi.hoisted(() => ({ byDay: vi.fn(), history: vi.fn(), onRanks: null as null | (() => void) }))
vi.mock('@/lib/deadlock/endpoints', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getRanks: async () => {
    up.onRanks?.()
    return []
  },
  getPatchFeed: async () => [],
  getActiveHeroes: async () => HEROES,
  getBadgeDistribution: async () => [],
  getHeroStatsByDay: up.byDay,
}))
vi.mock('@/lib/db/store', () => ({ heroStatsFromHistory: up.history }))

const fetchMock = vi.fn(async () => {
  throw new Error('network is not allowed in this test')
})
const at = (sec: number) => vi.setSystemTime(sec * 1000)
const computations = () => up.byDay.mock.calls.length

async function load() {
  vi.resetModules() // a fresh memo per test
  const loaders = await import('@/features/meta/loaders')
  const { DEFAULT_QUERY } = await import('@/features/meta/query')
  return { ...loaders, q: DEFAULT_QUERY }
}

beforeEach(() => {
  up.byDay.mockReset().mockImplementation(async () => rows())
  up.history.mockReset().mockResolvedValue(null)
  up.onRanks = null
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  vi.useFakeTimers({ toFake: ['Date'] })
  at(today + 2 * HOUR)
  for (const level of ['info', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {})
})
afterEach(() => {
  expect(fetchMock).not.toHaveBeenCalled()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('reuse and expiry', () => {
  it('reuses a live result before 30 s (same object, one computation) and recomputes after', async () => {
    const m = await load()
    const first = await m.getMetaPageData(m.q)
    expect(first).toMatchObject({ ok: true, scope: { source: 'live' } })
    at(today + 2 * HOUR + 29)
    expect(await m.getMetaPageData(m.q)).toBe(first)
    expect(computations()).toBe(1)
    at(today + 2 * HOUR + 30)
    const third = await m.getMetaPageData(m.q)
    expect(computations()).toBe(2)
    expect(third).not.toBe(first)
    expect(third).toEqual(first) // same inputs, same result
  })

  it('shares one computation between concurrent callers', async () => {
    const m = await load()
    const [a, b, c] = await Promise.all([m.getMetaPageData(m.q), m.getMetaPageData(m.q), m.getMetaPageData({ ...m.q })])
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(computations()).toBe(1)
  })
})

describe('time boundaries', () => {
  it('never reuses across an analytics key step (06:00 UTC)', async () => {
    const m = await load()
    at(today + 6 * HOUR - 5)
    await m.getMetaPageData(m.q)
    at(today + 6 * HOUR + 5) // 10 s later, next step
    await m.getMetaPageData(m.q)
    expect(computations()).toBe(2)
  })

  it('never reuses across a UTC day (00:00 UTC)', async () => {
    const m = await load()
    at(today + DAY - 5)
    await m.getMetaPageData(m.q)
    at(today + DAY + 5)
    await m.getMetaPageData(m.q)
    expect(computations()).toBe(2)
  })

  it('does not store a computation whose start straddles a boundary (clock read in both buckets)', async () => {
    const m = await load()
    at(today + 6 * HOUR - 1)
    up.onRanks = () => at(today + 6 * HOUR) // the clock crosses 06:00 while the computation starts
    const straddled = await m.getMetaPageData(m.q)
    expect(straddled).toMatchObject({ ok: true })
    expect(m.metaMemoSizeForTests()).toBe(0)
    up.onRanks = null
    await m.getMetaPageData(m.q) // same instant, new bucket: computed (and kept) under its own bucket only
    expect(computations()).toBe(2)
    expect(m.metaMemoSizeForTests()).toBe(1)
  })
})

describe('keys', () => {
  it('is canonical: the same query with properties in another order shares the entry', async () => {
    const m = await load()
    const reordered = Object.fromEntries(Object.entries(m.q).reverse()) as MetaQuery
    expect(Object.keys(reordered)).not.toEqual(Object.keys(m.q))
    const a = await m.getMetaPageData(m.q)
    expect(await m.getMetaPageData(reordered)).toBe(a)
    expect(computations()).toBe(1)
  })

  it('keeps different queries apart', async () => {
    const m = await load()
    const a = await m.getMetaPageData(m.q)
    const b = await m.getMetaPageData({ ...m.q, window: '30d' })
    const c = await m.getMetaPageData({ ...m.q, showLow: true })
    expect(computations()).toBe(3)
    expect(new Set([a, b, c]).size).toBe(3)
  })
})

describe('results that are not kept', () => {
  it('{ ok: false } is not kept: the next call retries live data', async () => {
    const m = await load()
    up.byDay.mockRejectedValueOnce(new Error('upstream down'))
    expect(await m.getMetaPageData(m.q)).toMatchObject({ ok: false })
    expect(m.metaMemoSizeForTests()).toBe(0)
    expect(await m.getMetaPageData(m.q)).toMatchObject({ ok: true, scope: { source: 'live' } })
    expect(computations()).toBe(2)
  })

  it('a database snapshot is shared by concurrent callers but not kept: live data replaces it next call', async () => {
    const m = await load()
    up.byDay.mockRejectedValueOnce(new Error('upstream down'))
    up.history.mockResolvedValueOnce({ rows: rows(), syncedAt: new Date((today - HOUR) * 1000) })
    const [a, b] = await Promise.all([m.getMetaPageData(m.q), m.getMetaPageData(m.q)])
    expect(a).toMatchObject({ ok: true, scope: { source: 'snapshot' } })
    expect(b).toBe(a)
    expect(m.metaMemoSizeForTests()).toBe(0)
    expect(await m.getMetaPageData(m.q)).toMatchObject({ ok: true, scope: { source: 'live' } })
  })

  it('a rejected computation is removed (no unhandled rejection) and the next call retries', async () => {
    const m = await load()
    up.byDay.mockRejectedValueOnce(new Error('upstream down'))
    // The failure path itself throws (its log call), so the computation rejects instead of returning { ok: false }.
    vi.mocked(console.error).mockImplementationOnce(() => {
      throw new Error('logging failed')
    })
    await expect(m.getMetaPageData(m.q)).rejects.toThrow('logging failed')
    expect(m.metaMemoSizeForTests()).toBe(0)
    expect(await m.getMetaPageData(m.q)).toMatchObject({ ok: true })
    expect(computations()).toBe(2)
  })

  it('an old computation settling late (expired, failed) never removes the newer entry for its key', async () => {
    const m = await load()
    let failOld: (error: Error) => void = () => {}
    up.byDay.mockImplementationOnce(() => new Promise((_, reject) => (failOld = reject)))
    const old = m.getMetaPageData(m.q) // in flight, will fail
    at(today + 2 * HOUR + 31) // its entry expires while it is still running
    const fresh = await m.getMetaPageData(m.q) // a newer entry for the same key
    expect(fresh).toMatchObject({ ok: true })
    failOld(new Error('late failure'))
    expect(await old).toMatchObject({ ok: false })
    at(today + 2 * HOUR + 32)
    expect(await m.getMetaPageData(m.q)).toBe(fresh) // the newer entry survived
    expect(computations()).toBe(2)
  })
})

describe('size limit and expired entries', () => {
  const queries = (q: MetaQuery, n: number): MetaQuery[] => {
    const out: MetaQuery[] = []
    for (const window of ['7d', '30d', 'patch'] as const)
      for (const role of ['all', 'marksman', 'mystic', 'brawler', 'assassin'] as const)
        for (const sort of ['tier', 'winRate', 'pickRate', 'matches'] as const)
          for (const dir of ['desc', 'asc'] as const) out.push({ ...q, window, role, sort, dir })
    return out.slice(0, n)
  }

  it('keeps at most 64 entries and evicts the oldest first', async () => {
    const m = await load()
    const qs = queries(m.q, 65)
    expect(new Set(qs.map((q) => JSON.stringify(q))).size).toBe(65)
    for (const q of qs.slice(0, 64)) await m.getMetaPageData(q)
    expect(m.metaMemoSizeForTests()).toBe(64)
    await m.getMetaPageData(qs[64]) // 65th: evicts the first
    expect(m.metaMemoSizeForTests()).toBe(64)
    expect(computations()).toBe(65)
    await m.getMetaPageData(qs[1]) // still kept
    expect(computations()).toBe(65)
    await m.getMetaPageData(qs[0]) // evicted: recomputed
    expect(computations()).toBe(66)
    expect(m.metaMemoSizeForTests()).toBe(64)
  })

  it('removes expired entries when a new one is stored', async () => {
    const m = await load()
    for (const q of queries(m.q, 3)) await m.getMetaPageData(q)
    expect(m.metaMemoSizeForTests()).toBe(3)
    at(today + 2 * HOUR + 31)
    await m.getMetaPageData(queries(m.q, 4)[3])
    expect(m.metaMemoSizeForTests()).toBe(1)
  })
})

describe('frozen results', () => {
  it('a kept result is deep-frozen: in-place changes throw instead of reaching other requests', async () => {
    const m = await load()
    const data = await m.getMetaPageData({ ...m.q, showLow: true })
    if (!data.ok) throw new Error('expected a result')
    expect(data.model.heroes.length).toBeGreaterThan(1)
    for (const value of [data, data.model, data.model.heroes, data.model.heroes[0], data.model.heroes[0].interval, data.model.summary, data.scope, data.windows, data.ranks]) {
      expect(Object.isFrozen(value)).toBe(true)
    }
    expect(() => data.model.heroes.sort((a, b) => a.id - b.id)).toThrow(TypeError)
    expect(() => {
      ;(data.model.heroes[0] as { winRate: number }).winRate = 0
    }).toThrow(TypeError)
    expect(await m.getMetaPageData({ ...m.q, showLow: true })).toBe(data) // unchanged, still shared
  })
})

describe('test isolation', () => {
  it('resetMetaMemoForTests clears every entry', async () => {
    const m = await load()
    await m.getMetaPageData(m.q)
    expect(m.metaMemoSizeForTests()).toBe(1)
    m.resetMetaMemoForTests()
    expect(m.metaMemoSizeForTests()).toBe(0)
    await m.getMetaPageData(m.q)
    expect(computations()).toBe(2)
  })
})
