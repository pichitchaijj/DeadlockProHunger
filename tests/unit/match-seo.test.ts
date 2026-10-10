import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeadlockApiError } from '@/lib/deadlock/apiError'
import { classifyError } from '@/lib/deadlock/errors'

/*
 * Match detail indexing: a loaded match is indexable (canonical + hreflang); a match the data source
 * doesn't have (yet) or failed to load is noindex without alternates, never a 404 (only malformed ids are).
 */

const deadlockGet = vi.fn()
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => unknown) => fn }))
vi.mock('@/lib/deadlock/client', () => ({ deadlockGet: (...args: unknown[]) => deadlockGet(...args) }))
vi.mock('@/lib/db/store', () => ({ readStoredMatch: async () => null, storeMatch: () => {} }))
vi.mock('@/lib/deadlock/endpoints', () => ({ getActiveHeroes: async () => [] }))
vi.mock('@/lib/deadlock/buildEndpoints', () => ({ getSteamNames: async () => [] }))
vi.mock('@/features/hero/loaders', () => ({ shopMap: async () => new Map() }))
vi.mock('@/features/meta/scope', () => ({ resolveScope: async () => null }))
vi.mock('@/features/match/model', () => ({ buildMatchView: () => ({ startedAt: 0, averageBadge: [null, null] }) }))

const { parseMatchId, matchIndexing } = await import('@/features/match/seo')
const { getMatchDetail } = await import('@/lib/deadlock/matchDetail')
const { loadMatchPage } = await import('@/features/match/loaders')

const ORIGIN = 'https://deadlock-pro-hunger.vercel.app'
const apiError = (status: number | null, message = `HTTP ${status}`) => new DeadlockApiError(message, status, '/v1/matches/1/metadata')
const raw = { match_info: { players: [] } }

describe('match id', () => {
  it('accepts up to 12 digits', () => {
    expect(parseMatchId('114002164')).toBe(114002164)
    expect(parseMatchId('999999999999')).toBe(999999999999)
  })

  it('rejects anything that cannot be a match id (the page 404s)', () => {
    for (const bad of ['', 'abc', '-1', '1.5', '1e5', '12abc', '1234567890123']) expect(parseMatchId(bad), bad).toBeNull()
  })
})

describe('match indexing metadata', () => {
  const env = process.env.SITE_URL
  beforeEach(() => {
    process.env.SITE_URL = ORIGIN
  })
  afterEach(() => {
    if (env === undefined) delete process.env.SITE_URL
    else process.env.SITE_URL = env
  })

  it('a loaded match is indexable, with its canonical and every locale alternate', () => {
    const meta = matchIndexing(114002164, 'th', 'ok')
    expect(meta.robots).toBeUndefined()
    expect(meta.alternates?.canonical).toBe(`${ORIGIN}/th/matches/114002164`)
    expect(Object.keys(meta.alternates?.languages ?? {})).toEqual(['en', 'th', 'ja', 'ko', 'zh-CN', 'x-default'])
  })

  it('a match that is not available or failed to load is noindex, with no canonical or alternates', () => {
    for (const status of ['not-available', 'failed'] as const) {
      expect(matchIndexing(1, 'en', status)).toEqual({ robots: { index: false } })
    }
  })
})

describe('match page load outcome', () => {
  beforeEach(() => {
    deadlockGet.mockReset()
  })

  it('a match the source returns loads (indexable)', async () => {
    deadlockGet.mockResolvedValue(raw)
    const load = await loadMatchPage(114002164)
    expect(load.status).toBe('ok')
  })

  it('a 404 from the source is "not available" (unknown or not processed yet), not a failure', async () => {
    deadlockGet.mockRejectedValue(apiError(404))
    expect(await getMatchDetail(2)).toBeNull()
    expect((await loadMatchPage(3)).status).toBe('not-available')
  })

  it('transient failures (503 retry-later, rate limit, timeout) are failures, never "not available"', async () => {
    const cases = [
      [apiError(503, 'Match metadata recently failed to fetch from upstream. Retry later.'), 'unavailable'],
      [apiError(429), 'rate-limit'],
      [apiError(null, 'timeout after 20000ms'), 'timeout'],
    ] as const
    let id = 10
    for (const [error, kind] of cases) {
      deadlockGet.mockRejectedValue(error)
      await expect(getMatchDetail(id)).rejects.toBe(error)
      const load = await loadMatchPage(id + 1)
      expect(load.status).toBe('failed')
      if (load.status === 'failed') expect(classifyError(load.error)).toBe(kind)
      id += 2
    }
  })
})
