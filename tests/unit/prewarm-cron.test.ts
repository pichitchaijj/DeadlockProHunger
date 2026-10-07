import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isCronAuthorized } from '@/lib/jobs/cronAuth'

/* Synthetic secrets only. The route's jobs are mocked: these tests cover authorization and output. */
const SECRET = 'test-cron-secret-not-real-123'
const report = { job: 'prewarm', status: 'ok', durationMs: 5, summary: { tasks: 1, ok: 1, failed: 0, rateLimited: 0, skipped: 0 }, upstream: { networkRequests: 0, cacheHits: 1, budgetWaits: 0, budgetExhausted: 0 }, results: [] }

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ getDb: () => null }))
vi.mock('@/lib/jobs', () => ({ JOBS: ['reference', 'daily', 'builds', 'prune'], runJob: vi.fn() }))
const runPrewarmJob = vi.fn(async () => report)
vi.mock('@/lib/jobs/prewarm', () => ({ runPrewarmJob: () => runPrewarmJob() }))

describe('isCronAuthorized', () => {
  it('accepts exactly "Bearer <secret>"', () => {
    expect(isCronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true)
  })
  it('refuses a wrong, partial, differently cased or missing header', () => {
    expect(isCronAuthorized('Bearer wrong', SECRET)).toBe(false)
    expect(isCronAuthorized(SECRET, SECRET)).toBe(false)
    expect(isCronAuthorized(`bearer ${SECRET}`, SECRET)).toBe(false)
    expect(isCronAuthorized(`Bearer ${SECRET}x`, SECRET)).toBe(false)
    expect(isCronAuthorized(null, SECRET)).toBe(false)
  })
  it('refuses everything when no secret is configured', () => {
    expect(isCronAuthorized('Bearer ', undefined)).toBe(false)
    expect(isCronAuthorized('Bearer undefined', undefined)).toBe(false)
    expect(isCronAuthorized('Bearer ', '')).toBe(false)
  })
})

describe('GET /api/cron/prewarm', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = SECRET
    runPrewarmJob.mockClear()
  })
  afterEach(() => {
    delete process.env.CRON_SECRET
  })

  async function call(auth: string | null) {
    const { GET } = await import('@/app/api/cron/[job]/route')
    const { NextRequest } = await import('next/server')
    const headers = auth === null ? undefined : { authorization: auth }
    const res = await GET(new NextRequest('http://localhost/api/cron/prewarm', { headers }), { params: Promise.resolve({ job: 'prewarm' }) })
    return { status: res.status, text: await res.text() }
  }

  it('runs the job with a valid secret and returns the report', async () => {
    const res = await call(`Bearer ${SECRET}`)
    expect(res.status).toBe(200)
    expect(JSON.parse(res.text)).toMatchObject({ job: 'prewarm', status: 'ok' })
    expect(runPrewarmJob).toHaveBeenCalledTimes(1)
  })

  it('returns 401 without running anything for a missing or invalid secret', async () => {
    expect((await call(null)).status).toBe(401)
    expect((await call('Bearer nope')).status).toBe(401)
    expect(runPrewarmJob).not.toHaveBeenCalled()
  })

  it('returns 401 when CRON_SECRET is not configured, even for "Bearer undefined"', async () => {
    delete process.env.CRON_SECRET
    expect((await call('Bearer undefined')).status).toBe(401)
    expect(runPrewarmJob).not.toHaveBeenCalled()
  })

  it('never echoes the secret in any response', async () => {
    for (const auth of [`Bearer ${SECRET}`, 'Bearer nope', null]) {
      expect((await call(auth)).text).not.toContain(SECRET)
    }
  })
})
