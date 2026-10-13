import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isCronAuthorized } from '@/lib/jobs/cronAuth'

/* Synthetic secrets only. The route's jobs are mocked: these tests cover authorization and output. */
const SECRET = 'test-cron-secret-not-real-123'
const report = { job: 'prewarm', status: 'ok', durationMs: 5, summary: { tasks: 1, ok: 1, failed: 0, rateLimited: 0, skipped: 0 }, upstream: { networkRequests: 0, cacheHits: 1, budgetWaits: 0, budgetExhausted: 0 }, results: [] }

vi.mock('server-only', () => ({}))
const getDb = vi.fn((): object | null => null)
vi.mock('@/lib/db/client', () => ({ getDb: () => getDb() }))
const runJob = vi.fn(async (..._args: unknown[]): Promise<Record<string, unknown>> => ({ status: 'ok', requests: 0, rows: {}, errors: [] }))
vi.mock('@/lib/jobs', () => ({ JOBS: ['reference', 'daily', 'builds', 'prune'], runJob: (...args: unknown[]) => runJob(...args) }))
const runPrewarmJob = vi.fn(async (): Promise<Record<string, unknown>> => report)
vi.mock('@/lib/jobs/prewarm', () => ({ runPrewarmJob: () => runPrewarmJob() }))

async function get(job: string) {
  const { GET } = await import('@/app/api/cron/[job]/route')
  const { NextRequest } = await import('next/server')
  const res = await GET(new NextRequest(`http://localhost/api/cron/${job}`, { headers: { authorization: `Bearer ${SECRET}` } }), { params: Promise.resolve({ job }) })
  return { status: res.status, retryAfter: res.headers.get('retry-after'), body: await res.json() }
}

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

describe('cron status codes', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = SECRET
    runPrewarmJob.mockReset()
    runJob.mockReset()
    getDb.mockReset()
    getDb.mockReturnValue({})
  })
  afterEach(() => {
    delete process.env.CRON_SECRET
  })

  it('prewarm blocked (upstream refused access): 503 with Retry-After', async () => {
    runPrewarmJob.mockResolvedValue({ ...report, status: 'blocked', retryAfterS: 600 })
    const res = await get('prewarm')
    expect(res).toMatchObject({ status: 503, retryAfter: '600' })
    expect(res.body).toMatchObject({ status: 'blocked' })
  })

  it('prewarm failed: still 500, ok and partial: 200, none with Retry-After', async () => {
    for (const [status, code] of [['failed', 500], ['ok', 200], ['partial', 200]] as const) {
      runPrewarmJob.mockResolvedValue({ ...report, status })
      expect(await get('prewarm'), status).toMatchObject({ status: code, retryAfter: null })
    }
  })

  it('a blocked daily job: 503 with Retry-After; failed: 500; ok: 200', async () => {
    runJob.mockResolvedValue({ status: 'blocked', requests: 1, rows: {}, errors: ['HTTP 403'], retryAfterS: 42 })
    expect(await get('daily')).toMatchObject({ status: 503, retryAfter: '42', body: { job: 'daily', status: 'blocked' } })
    runJob.mockResolvedValue({ status: 'failed', requests: 3, rows: {}, errors: ['HTTP 500'] })
    expect(await get('daily')).toMatchObject({ status: 500, retryAfter: null })
    runJob.mockResolvedValue({ status: 'ok', requests: 3, rows: {}, errors: [] })
    expect(await get('daily')).toMatchObject({ status: 200, retryAfter: null })
  })

  it('jobs still answer 503 without a database, before any upstream call', async () => {
    getDb.mockReturnValue(null)
    expect(await get('daily')).toMatchObject({ status: 503, retryAfter: null })
    expect(runJob).not.toHaveBeenCalled()
  })
})
