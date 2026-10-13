import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * The real prewarm job (lib/jobs/prewarm.ts → runner → loaders → client → access breaker) against a fake
 * upstream. Every request count is fetchMock.mock.calls: a refused upstream must stop the run after the
 * first wave of calls, and an open breaker must stop it before any call.
 */
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ getDb: () => null }))
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>) => (...args: unknown[]) => fn(...args), // never caches: every call is a miss
}))

const MIN = 60_000
const T0 = Date.UTC(2026, 9, 14, 6)

let respond: (path: string) => Response = () => new Response('{}', { status: 403 })
const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => respond(new URL(String(input)).pathname))

async function load() {
  vi.resetModules() // fresh breaker, budget and counters
  const { runPrewarmJob } = await import('@/lib/jobs/prewarm')
  const { accessBreakerStatus } = await import('@/lib/deadlock/client')
  const { SKIP_REFUSED } = await import('@/lib/jobs/prewarmRunner')
  return { runPrewarmJob, accessBreakerStatus, SKIP_REFUSED }
}

beforeEach(() => {
  fetchMock.mockClear()
  respond = () => new Response('{}', { status: 403 })
  vi.stubGlobal('fetch', fetchMock)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  for (const level of ['info', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('prewarm against a refusing upstream', () => {
  it('stops after the first wave: at most 3 requests instead of a full run, reported as blocked', async () => {
    const { runPrewarmJob, SKIP_REFUSED } = await load()
    const report = await runPrewarmJob()
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0)
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3)
    expect(report.status).toBe('blocked')
    expect(report.summary.blocked).toBeGreaterThan(0)
    expect(report.summary.ok).toBe(0)
    expect(report.results.filter((r) => r.status === 'skipped').every((r) => r.error === SKIP_REFUSED)).toBe(true)
    expect(report.upstream).toMatchObject({ networkRequests: fetchMock.mock.calls.length, accessRefused: fetchMock.mock.calls.length })
    expect(report.retryAfterS).toBeGreaterThanOrEqual(1)
  })

  it('3 refusals from 3 endpoints open the breaker: the report says open, Retry-After = the cooldown', async () => {
    const { runPrewarmJob } = await load()
    const report = await runPrewarmJob()
    expect(fetchMock.mock.calls.length).toBe(3) // heroes, ranks, patches: the shared-reference stage, 3 in flight
    expect(report.breaker).toEqual({ state: 'open', retryAt: T0 + 10 * MIN })
    expect(report.retryAfterS).toBe(600)
  })

  it('an open breaker before the run: no request at all', async () => {
    const { runPrewarmJob, SKIP_REFUSED } = await load()
    await runPrewarmJob() // opens the breaker
    fetchMock.mockClear()
    vi.setSystemTime(T0 + 9 * MIN)
    const report = await runPrewarmJob()
    expect(fetchMock.mock.calls.length).toBe(0)
    expect(report).toMatchObject({ status: 'blocked', durationMs: 0, breaker: { state: 'open' }, retryAfterS: 60 })
    expect(report.results).toEqual([{ stage: '(run)', name: '(run)', status: 'skipped', ms: 0, error: SKIP_REFUSED }])
    expect(report.upstream.networkRequests).toBe(0)
  })

  it('after the cooldown the run goes ahead and its first call is the single probe', async () => {
    const { runPrewarmJob, accessBreakerStatus } = await load()
    await runPrewarmJob()
    fetchMock.mockClear()
    vi.setSystemTime(T0 + 10 * MIN)
    expect(accessBreakerStatus().global.state).toBe('open') // the stored snapshot; the job reads it as of now
    const report = await runPrewarmJob() // upstream still refuses
    expect(fetchMock.mock.calls.length).toBe(1) // one probe; the other in-flight tasks were refused by the breaker
    expect(report.status).toBe('blocked')
    expect(report.upstream).toMatchObject({ accessRefused: 1 })
    expect(report.upstream.circuitRejected).toBeGreaterThan(0)
    expect(report.breaker).toEqual({ state: 'open', retryAt: T0 + 10 * MIN + 20 * MIN })
    expect(report.retryAfterS).toBe(20 * 60)
  })

  it('a stale probe is not reported as in flight', async () => {
    const { runPrewarmJob, accessBreakerStatus } = await load()
    await runPrewarmJob()
    const { effectiveStatus } = await import('@/lib/deadlock/accessBreaker')
    // A probe that never came back: hold one in flight from the client.
    const { deadlockGet } = await import('@/lib/deadlock/client')
    const { z } = await import('zod')
    let release!: (r: Response) => void
    respond = () => new Response('{}', { status: 403 })
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (release = r)))
    vi.setSystemTime(T0 + 10 * MIN)
    const hanging = deadlockGet('/v1/assets/heroes', { schema: z.unknown(), revalidate: 60, params: { probe: 1 } }).catch(() => null)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(effectiveStatus(accessBreakerStatus().global, Date.now())).toMatchObject({ state: 'half-open', probing: true })
    vi.setSystemTime(T0 + 11 * MIN + 1_000)
    expect(effectiveStatus(accessBreakerStatus().global, Date.now())).toMatchObject({ state: 'half-open', probing: false })
    release(new Response('[]', { status: 200 }))
    await hanging
  })
})

describe('prewarm without refusals keeps its old statuses', () => {
  it('server errors are failures (500 route status), never blocked', async () => {
    const { runPrewarmJob } = await load()
    respond = () => new Response('{}', { status: 500 })
    const report = await runPrewarmJob()
    expect(report.status).toBe('failed')
    expect(report.summary.blocked).toBe(0)
    expect(report.retryAfterS).toBeUndefined()
    expect(report.breaker.state).toBe('closed')
  })
})
