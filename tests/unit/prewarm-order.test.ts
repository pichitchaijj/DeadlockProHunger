import { describe, expect, it, vi } from 'vitest'

/*
 * Prewarm stage order: Home's builds section and the /builds listing read the tracked build stats cache-only
 * (features/builds/loaders.ts), so they must run after the stage that warms them, or a run on a cold day records
 * them as `pending`. Every loader is a stub that records the order; nothing reaches the client or the network.
 */
vi.mock('server-only', () => ({}))

const HEROES = [1, 2, 3].map((id) => ({ id, name: `Hero ${id}`, class_name: `hero_${id}`, images: {} }))
const log = vi.hoisted(() => ({ events: [] as string[], warm: new Set<number>() }))
const ok = <T,>(data: T) => ({ ok: true as const, data, asOf: 0, stale: false })
/** A cache-only reader: `pending` unless every active hero's build stats were warmed first. */
const cacheOnly = (name: string) => {
  log.events.push(name)
  return HEROES.every((h) => log.warm.has(h.id))
}

vi.mock('@/lib/deadlock/client', () => ({
  accessBreakerStatus: () => ({ global: { state: 'closed', since: 0, retryAt: null, cooldownMs: 0, refusals: [] }, endpoints: {} }),
  apiCallStats: () => ({ network: 0, hits: 0, budgetWaits: 0, budgetExhausted: 0, accessRefused: 0, circuitRejected: 0, notWarmed: 0 }),
  budgetHeadroom: () => ({ available: 100, capacity: 100 }),
}))
vi.mock('@/lib/deadlock/endpoints', () => ({
  getActiveHeroes: async () => HEROES,
  getRanks: async () => [],
  getPatchFeed: async () => [],
}))
vi.mock('@/lib/deadlock/heroEndpoints', () => ({
  getHeroBuildStats: async (id: number) => {
    log.events.push(`build stats ${id}`)
    log.warm.add(id)
    return []
  },
}))
vi.mock('@/lib/deadlock/itemEndpoints', () => ({ getItemPhases: async () => ({}), getItemStatsByHero: async () => [], getItemStatsByMinute: async () => [] }))
vi.mock('@/features/items/loaders', () => ({ getItemContext: async () => ({ scope: { statsQuery: {} } }), itemTotals: async () => [] }))
vi.mock('@/features/patches/loaders', () => ({ getPatchContext: async () => ({}), patchDiffById: async () => null, patchImpactById: async () => null, patchList: async () => [] }))
vi.mock('@/features/builds/loaders', async () => {
  const { DataError } = await import('@/lib/deadlock/errors')
  return {
    getBuildsListing: async () => {
      if (!cacheOnly('builds listing')) throw new DataError('not warmed', 'pending')
      return { rows: [] }
    },
  }
})
vi.mock('@/features/hero/loaders', () => ({ getHeroContext: async () => null, getOverviewData: async () => ({}) }))
vi.mock('@/features/home/loaders', () => {
  const home = (name: string) => async () => (log.events.push(name), ok(null))
  return {
    getHomeMeta: home('home meta'),
    getHomePatch: home('home patch'),
    getHomeSource: home('home source'),
    getHomePerformance: home('home performance'),
    getHomeMatches: home('home matches'),
    getHomeBuilds: async () => (cacheOnly('home builds') ? ok([]) : { ok: false as const, error: 'pending' as const }),
  }
})
vi.mock('@/features/meta/loaders', () => ({ getMetaPageData: async () => ({ ok: true, model: { heroes: [] } }) }))
vi.mock('@/features/meta/scope', () => ({ resolveScope: async () => ({ statsQuery: {} }) }))

describe('prewarm stage order', () => {
  it('warms every tracked build stat before Home builds and the builds listing read them cache-only', async () => {
    const { prewarmStages } = await import('@/lib/jobs/prewarm')
    const { runPrewarm } = await import('@/lib/jobs/prewarmRunner')
    for (const level of ['info', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {})
    const { results } = await runPrewarm(prewarmStages(), {
      concurrency: 3,
      headroom: () => 100,
      reserve: 0,
      maxBudgetWaitMs: 0,
      deadlineMs: 60_000,
      now: () => 0,
      sleep: async () => {},
      classify: () => 'failed',
      secrets: [],
      stopAfterRateLimited: 3,
    })

    const at = (name: string) => log.events.indexOf(name)
    const lastStats = Math.max(...HEROES.map((h) => at(`build stats ${h.id}`)))
    expect(lastStats).toBeGreaterThanOrEqual(0)
    expect(at('home builds')).toBeGreaterThan(lastStats)
    expect(at('builds listing')).toBeGreaterThan(lastStats)
    // The rest of Home still runs first (the most-visited page isn't delayed behind the per-hero stage).
    for (const name of ['home meta', 'home patch', 'home source', 'home performance', 'home matches']) expect(at(name)).toBeLessThan(at(`build stats ${HEROES[0].id}`))

    const status = (name: string) => results.find((r) => r.name === name)?.status
    expect(status('home builds')).toBe('ok')
    expect(status('builds default listing')).toBe('ok')
    // Same task set as before, Home builds only moved: one task each, nothing dropped or doubled.
    expect(results.filter((r) => r.name === 'home builds')).toHaveLength(1)
    expect(results.filter((r) => r.stage === 'home').map((r) => r.name)).toEqual(['home summary + pulse', 'home patch', 'home source counters', 'home hero performance', 'home matches'])
  })
})
