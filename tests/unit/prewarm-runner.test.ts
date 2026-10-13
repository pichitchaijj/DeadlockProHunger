import { describe, expect, it } from 'vitest'
import { redact, retryAfterSeconds, runPrewarm, SKIP_RATE_LIMITED, SKIP_REFUSED, summarize, type PrewarmStage, type RunnerOptions } from '@/lib/jobs/prewarmRunner'

/* A fake clock: sleep advances time instantly, so budget waits and deadlines are deterministic. */
function clock() {
  let t = 0
  return { now: () => t, sleep: async (ms: number) => void (t += ms), advance: (ms: number) => void (t += ms) }
}

function options(c: ReturnType<typeof clock>, over: Partial<RunnerOptions> = {}): RunnerOptions {
  return {
    concurrency: 3,
    headroom: () => 40,
    reserve: 20,
    maxBudgetWaitMs: 20_000,
    deadlineMs: 240_000,
    now: c.now,
    sleep: c.sleep,
    classify: (e) => (e instanceof Error && /403/.test(e.message) ? 'blocked' : e instanceof Error && /429|rate/.test(e.message) ? 'rate-limited' : 'failed'),
    secrets: [],
    stopAfterRateLimited: 3,
    ...over,
  }
}

const task = (name: string, run: () => Promise<unknown> = async () => {}) => ({ name, run })

describe('runPrewarm', () => {
  it('never runs more tasks at once than the concurrency limit', async () => {
    const c = clock()
    let active = 0
    let peak = 0
    const slow = (name: string) =>
      task(name, async () => {
        active++
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 5))
        active--
      })
    const stages: PrewarmStage[] = [{ name: 's', tasks: Array.from({ length: 10 }, (_, i) => slow(`t${i}`)) }]
    const { results } = await runPrewarm(stages, options(c, { concurrency: 3 }))
    expect(peak).toBe(3)
    expect(results.filter((r) => r.status === 'ok')).toHaveLength(10)
  })

  it('runs stages in order, so a later stage can use what an earlier one loaded', async () => {
    const c = clock()
    const order: string[] = []
    const stages: PrewarmStage[] = [
      { name: 'first', tasks: [task('a', async () => void order.push('a'))] },
      { name: 'second', tasks: async () => [task(`b-after-${order.join()}`, async () => void order.push('b'))] },
    ]
    const { results } = await runPrewarm(stages, options(c))
    expect(order).toEqual(['a', 'b'])
    expect(results[1].name).toBe('b-after-a')
  })

  it('keeps going after a failure and records each outcome (partial failure)', async () => {
    const c = clock()
    const stages: PrewarmStage[] = [
      { name: 's1', tasks: [task('ok1'), task('boom', async () => Promise.reject(new Error('HTTP 500'))), task('limited', async () => Promise.reject(new Error('HTTP 429'))), task('ok2')] },
      { name: 'broken plan', tasks: async () => Promise.reject(new Error('plan failed')) },
      { name: 's3', tasks: [task('ok3')] },
    ]
    const { results } = await runPrewarm(stages, options(c, { concurrency: 1 }))
    expect(results.map((r) => [r.name, r.status])).toEqual([
      ['ok1', 'ok'],
      ['boom', 'failed'],
      ['limited', 'rate-limited'],
      ['ok2', 'ok'],
      ['(plan)', 'failed'],
      ['ok3', 'ok'],
    ])
    expect(summarize(results)).toEqual({ tasks: 6, ok: 3, failed: 2, rateLimited: 1, blocked: 0, skipped: 0 })
  })

  it('waits for budget headroom before starting a task, leaving the reserve for users', async () => {
    const c = clock()
    const tokens = 5 // below the reserve of 20; refills 5 per second of fake time
    const headroom = () => tokens + Math.floor(c.now() / 1_000) * 5
    let startedAt = -1
    const { results } = await runPrewarm([{ name: 's', tasks: [task('t', async () => void (startedAt = c.now()))] }], options(c, { headroom }))
    expect(results[0].status).toBe('ok')
    expect(startedAt).toBeGreaterThanOrEqual(3_000) // 5 + 3 s × 5 = 20
  })

  it('skips (does not force) a task when the budget does not recover in time', async () => {
    const c = clock()
    let ran = false
    const { results } = await runPrewarm([{ name: 's', tasks: [task('t', async () => void (ran = true))] }], options(c, { headroom: () => 0, maxBudgetWaitMs: 5_000 }))
    expect(ran).toBe(false)
    expect(results[0]).toMatchObject({ status: 'skipped', error: 'budget headroom' })
  })

  it('backs off after consecutive rate limits instead of retrying into them (circuit breaker)', async () => {
    const c = clock()
    let calls = 0
    const limited = (name: string) => task(name, async () => { calls++; throw new Error('HTTP 429') })
    const stages: PrewarmStage[] = [
      { name: 'busy', tasks: [limited('a'), limited('b'), limited('c'), limited('d'), limited('e')] },
      { name: 'later', tasks: [task('f')] },
    ]
    const { results } = await runPrewarm(stages, options(c, { concurrency: 1, stopAfterRateLimited: 3 }))
    expect(calls).toBe(3) // d and e were never sent
    expect(results.map((r) => r.status)).toEqual(['rate-limited', 'rate-limited', 'rate-limited', 'skipped', 'skipped', 'skipped'])
    expect(results.at(-1)).toMatchObject({ stage: 'later', error: 'backed off: upstream rate limiting' })
  })

  it('a success resets the circuit breaker; ordinary failures never trip it', async () => {
    const c = clock()
    const fail = (name: string, msg: string) => task(name, async () => Promise.reject(new Error(msg)))
    const stages: PrewarmStage[] = [{ name: 's', tasks: [fail('a', 'HTTP 429'), fail('b', 'HTTP 429'), task('ok'), fail('c', 'HTTP 429'), fail('d', 'HTTP 500'), fail('e', 'HTTP 500'), fail('f', 'HTTP 500'), task('g')] }]
    const { results } = await runPrewarm(stages, options(c, { concurrency: 1 }))
    expect(results.filter((r) => r.status === 'skipped')).toHaveLength(0)
  })

  it('starts no new task after a refused one (blocked) and says why in every skip', async () => {
    const c = clock()
    let calls = 0
    const counted = (name: string, msg?: string) => task(name, async () => { calls++; if (msg) throw new Error(msg) })
    const stages: PrewarmStage[] = [
      { name: 'first', tasks: [counted('a'), counted('b', 'HTTP 403'), counted('c'), counted('d')] },
      { name: 'later', tasks: [counted('e')] },
    ]
    const { results } = await runPrewarm(stages, options(c, { concurrency: 1 }))
    expect(calls).toBe(2) // c, d and e never ran
    expect(results.map((r) => [r.name, r.status])).toEqual([['a', 'ok'], ['b', 'blocked'], ['c', 'skipped'], ['d', 'skipped'], ['(stage)', 'skipped']])
    for (const r of results.filter((x) => x.status === 'skipped')) expect(r.error).toBe(SKIP_REFUSED)
    expect(summarize(results)).toMatchObject({ blocked: 1, skipped: 3 })
  })

  it('lets tasks already in flight finish, but starts no more once one is blocked', async () => {
    const c = clock()
    let calls = 0
    const refused = (name: string) =>
      task(name, async () => {
        calls++
        await new Promise((r) => setTimeout(r, 1))
        throw new Error('HTTP 403')
      })
    const stages: PrewarmStage[] = [{ name: 's', tasks: Array.from({ length: 10 }, (_, i) => refused(`t${i}`)) }]
    const { results } = await runPrewarm(stages, options(c, { concurrency: 3 }))
    expect(calls).toBe(3) // the 3 started together; none after the first refusal came back
    expect(results.filter((r) => r.status === 'blocked')).toHaveLength(3)
    expect(results.filter((r) => r.status === 'skipped' && r.error === SKIP_REFUSED)).toHaveLength(7)
  })

  it('a refused stage plan stops the run too', async () => {
    const c = clock()
    let ran = false
    const stages: PrewarmStage[] = [
      { name: 'plan', tasks: async () => Promise.reject(new Error('HTTP 403')) },
      { name: 'later', tasks: [task('x', async () => void (ran = true))] },
    ]
    const { results } = await runPrewarm(stages, options(c))
    expect(ran).toBe(false)
    expect(results.map((r) => [r.name, r.status, r.error])).toEqual([['(plan)', 'blocked', 'HTTP 403'], ['(stage)', 'skipped', SKIP_REFUSED]])
  })

  it('a rate-limited stage plan counts toward the rate-limit circuit breaker', async () => {
    const c = clock()
    const limited = (name: string) => task(name, async () => Promise.reject(new Error('HTTP 429')))
    const stages: PrewarmStage[] = [
      { name: 's1', tasks: [limited('a'), limited('b')] },
      { name: 'plan', tasks: async () => Promise.reject(new Error('HTTP 429')) },
      { name: 'later', tasks: [task('x')] },
    ]
    const { results } = await runPrewarm(stages, options(c, { concurrency: 1, stopAfterRateLimited: 3 }))
    expect(results.at(-1)).toMatchObject({ stage: 'later', status: 'skipped', error: SKIP_RATE_LIMITED })
  })

  it('a plain plan failure still neither trips nor resets anything', async () => {
    const c = clock()
    const stages: PrewarmStage[] = [
      { name: 'plan', tasks: async () => Promise.reject(new Error('HTTP 500')) },
      { name: 'later', tasks: [task('x')] },
    ]
    const { results } = await runPrewarm(stages, options(c))
    expect(results.map((r) => r.status)).toEqual(['failed', 'ok'])
  })

  it('retryAfterSeconds: time to retryAt, or the fallback, never below 1 s', () => {
    expect(retryAfterSeconds(10_500, 1_000, 600_000)).toBe(10)
    expect(retryAfterSeconds(null, 1_000, 600_000)).toBe(600)
    expect(retryAfterSeconds(500, 1_000, 600_000)).toBe(1)
  })

  it('skips what remains after the deadline', async () => {
    const c = clock()
    const stages: PrewarmStage[] = [{ name: 's', tasks: [task('a', async () => c.advance(300_000)), task('b')] }]
    const { results } = await runPrewarm(stages, options(c, { concurrency: 1, deadlineMs: 240_000 }))
    expect(results.map((r) => r.status)).toEqual(['ok', 'skipped'])
  })

  it('is safe to run repeatedly: the same plan gives the same outcomes', async () => {
    const stages: PrewarmStage[] = [{ name: 's', tasks: [task('a'), task('b')] }]
    const first = await runPrewarm(stages, options(clock()))
    const second = await runPrewarm(stages, options(clock()))
    expect(second.results.map((r) => r.status)).toEqual(first.results.map((r) => r.status))
  })

  it('never reports a secret, even when an error message contains one', async () => {
    const secret = 'sk-live-not-a-real-key-42'
    const c = clock()
    const { results } = await runPrewarm([{ name: 's', tasks: [task('leaky', async () => Promise.reject(new Error(`failed with key ${secret} at /x`)))] }], options(c, { secrets: [secret] }))
    expect(JSON.stringify(results)).not.toContain(secret)
    expect(results[0].error).toContain('[redacted]')
    expect(redact(`a ${secret} b ${secret}`, [secret, ''])).toBe('a [redacted] b [redacted]')
  })
})
