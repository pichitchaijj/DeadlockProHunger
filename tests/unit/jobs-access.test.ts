import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/lib/db/repo'

/*
 * The daily ingestion jobs (lib/jobs/index.ts) against a fake upstream and an in-memory repo (no database).
 * Request counts are fetchMock.mock.calls: refused access must stop a job after its first request (calls go
 * out one at a time until one succeeds), and an open access breaker must stop it before any request.
 */
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>) => (...args: unknown[]) => fn(...args), // never caches
}))
const finishRun = vi.fn(async (_db: unknown, _id: number, _result: { status: string; requests: number; error?: string | null }) => {})
vi.mock('@/lib/db/repo', () => ({
  startRun: async () => 1,
  finishRun: (...args: Parameters<typeof finishRun>) => finishRun(...args),
  upsertHeroes: async () => 0,
  upsertItems: async () => 0,
  upsertPatches: async () => 0,
  upsertHeroStats: async () => 0,
  upsertMatchups: async () => 0,
  upsertSynergies: async () => 0,
  latestPatch: async () => null,
  replaceAbilityOrders: async () => 0,
  putSnapshot: async () => {},
  upsertBuild: async () => {},
  prune: async () => ({ pruned: 0 }),
}))

const db = {} as Db
let respond: (path: string) => Response = () => new Response('{}', { status: 403 })
const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => respond(new URL(String(input)).pathname))

async function load() {
  vi.resetModules() // fresh breaker, budget and counters
  const jobs = await import('@/lib/jobs')
  const client = await import('@/lib/deadlock/client')
  return { ...jobs, ...client }
}

beforeEach(() => {
  fetchMock.mockClear()
  finishRun.mockClear()
  respond = () => new Response('{}', { status: 403 })
  vi.stubGlobal('fetch', fetchMock)
  for (const level of ['info', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('jobs against a refusing upstream', () => {
  for (const job of ['daily', 'reference', 'builds'] as const) {
    it(`${job}: one request, then nothing more; reported as blocked`, async () => {
      const { runJob } = await load()
      const result = await runJob(db, job)
      expect(fetchMock.mock.calls.length).toBe(1)
      expect(result.status).toBe('blocked')
      expect(result.requests).toBe(1)
      expect(result.retryAfterS).toBeGreaterThanOrEqual(1)
      expect(result.errors.join('\n')).toMatch(/HTTP 403/) // the one refusal that was sent says why
      // sync_runs keeps ok | partial | failed: stored as failed with the reason.
      expect(finishRun).toHaveBeenCalledWith(db, 1, expect.objectContaining({ status: 'failed', requests: 1 }))
    })
  }

  it('an open access breaker before the job: no request at all', async () => {
    const { runJob, deadlockGet } = await load()
    const { z } = await import('zod')
    // Open the global level from the client: 3 refusals from 2 endpoints.
    for (const [path, i] of [['/v1/assets/ranks', 1], ['/v1/assets/ranks', 2], ['/v1/info', 3]] as const) {
      await deadlockGet(path, { schema: z.unknown(), revalidate: 60, params: { i } }).catch(() => null)
    }
    fetchMock.mockClear()
    const result = await runJob(db, 'daily')
    expect(fetchMock.mock.calls.length).toBe(0)
    expect(result).toMatchObject({ status: 'blocked', requests: 0 })
    expect(result.retryAfterS).toBeGreaterThan(9 * 60) // ≈ the 10 min cooldown
    expect(result.retryAfterS).toBeLessThanOrEqual(10 * 60)
    expect(finishRun).toHaveBeenCalledWith(db, 1, expect.objectContaining({ status: 'failed', error: expect.stringContaining('upstream access refused') }))
  })

  it('prune needs no upstream and still runs while the breaker is open', async () => {
    const { runJob, deadlockGet } = await load()
    const { z } = await import('zod')
    for (const [path, i] of [['/v1/assets/ranks', 1], ['/v1/assets/ranks', 2], ['/v1/info', 3]] as const) {
      await deadlockGet(path, { schema: z.unknown(), revalidate: 60, params: { i } }).catch(() => null)
    }
    fetchMock.mockClear()
    const result = await runJob(db, 'prune')
    expect(result.status).toBe('ok')
    expect(fetchMock.mock.calls.length).toBe(0)
  })
})

describe('jobs without refusals keep their old statuses', () => {
  it('server errors: failed (500 route status), not blocked, and every unit was still tried', async () => {
    const { runJob } = await load()
    respond = () => new Response('{}', { status: 500 })
    const result = await runJob(db, 'daily')
    expect(result.status).toBe('failed')
    expect(result.retryAfterS).toBeUndefined()
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1) // a 500 doesn't stop the job
  })

  it('after the first success, calls go out in parallel again', async () => {
    const { runJob } = await load()
    let active = 0
    let peak = 0
    respond = () => new Response('[]', { status: 200 })
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
      return respond(new URL(String(input)).pathname)
    })
    const result = await runJob(db, 'daily', { days: 3 })
    expect(result.status).not.toBe('blocked')
    expect(peak).toBeGreaterThan(1)
  })
})
