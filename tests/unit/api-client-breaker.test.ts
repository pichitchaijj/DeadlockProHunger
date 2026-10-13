import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

/*
 * The access breaker inside the client (lib/deadlock/client.ts → accessBreaker.ts), with fetch and Next's
 * cache replaced by in-memory fakes. Every assertion about requests counts fetchMock.mock.calls: a call
 * refused by the breaker must never reach fetch or spend budget. Only Date is faked (the breaker and the
 * token buckets read it); real timers run retry and budget waits.
 */
vi.mock('server-only', () => ({}))
const store = new Map<string, unknown>()
vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => Promise<unknown>, keyParts: string[]) => async () => {
    const key = JSON.stringify(keyParts)
    if (store.has(key)) return store.get(key)
    const value = await fn()
    store.set(key, value)
    return value
  },
}))

const MIN = 60_000
const T0 = Date.UTC(2026, 9, 14)
const schema = z.array(z.object({ hero_id: z.number() }))

const ok = () => new Response(JSON.stringify([{ hero_id: 1 }]), { status: 200 })
const reply = (status: number, headers: Record<string, string> = {}) => new Response('{}', { status, headers })
function deferred() {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((r) => (resolve = r))
  return { promise, resolve }
}

/** Upstream fake: per-test answer for a path; everything else answers 200. */
let respond: (path: string) => Response | Promise<Response> = () => ok()
const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => respond(new URL(String(input)).pathname))
const fetchesTo = (path: string) => fetchMock.mock.calls.filter(([u]) => new URL(String(u)).pathname === path).length

// Refusals that open the global level: 2 templates, 3 calls. They answer 403 in every test.
const R1 = '/v1/assets/ranks'
const R2 = '/v1/info'
const P = '/v1/assets/heroes'
const Q = '/v1/builds'
const H = '/v1/analytics/hero-stats'
const refusing = new Set([R1, R2])

async function client() {
  vi.resetModules() // fresh breaker, budget buckets and counters (and classes to match them)
  const c = await import('@/lib/deadlock/client')
  const { classifyError } = await import('@/lib/deadlock/errors')
  return { ...c, classifyError }
}
type Client = Awaited<ReturnType<typeof client>>

const get = (c: Client, path: string, params: Record<string, string | number> = {}, opts: { retry?: boolean; timeoutMs?: number } = {}) =>
  c.deadlockGet(path, { schema, revalidate: 60, params, ...opts })
const attempt = <T,>(p: Promise<T>) =>
  p.then(
    (value) => ({ ok: true as const, value }),
    (error: { status?: number; circuitOpen?: boolean; message?: string }) => ({ ok: false as const, error }),
  )

/** 403 from R1, R1, R2: the 3rd refusal from a 2nd template opens the global level (3 requests). */
async function openGlobal(c: Client) {
  for (const [path, i] of [[R1, 1], [R1, 2], [R2, 3]] as const) await attempt(get(c, path, { open: i, at: Date.now() }))
  expect(c.accessBreakerStatus().global.state).toBe('open')
}

beforeEach(() => {
  store.clear()
  fetchMock.mockClear()
  respond = (path) => (refusing.has(path) ? reply(403) : ok())
  vi.stubGlobal('fetch', fetchMock)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('refusals and retries', () => {
  it('sends a 403 once (no retry) and classifies it as forbidden', async () => {
    const c = await client()
    const r = await attempt(get(c, R1))
    expect(fetchMock.mock.calls.length).toBe(1)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatchObject({ status: 403, circuitOpen: false })
    expect(c.classifyError(r.error)).toBe('forbidden')
    expect(c.apiCallStats()).toMatchObject({ network: 1, accessRefused: 1, circuitRejected: 0 })
  })

  it('keeps the retry behaviour for 429/5xx/network errors, and none of them opens the breaker', async () => {
    const c = await client()
    respond = (path) => {
      if (path.endsWith('/429')) return reply(429, { 'retry-after': '0' })
      if (path.endsWith('/503')) return reply(503, { 'retry-after': '0' })
      if (path.endsWith('/500')) return reply(500)
      if (path.endsWith('/net')) throw new TypeError('fetch failed')
      if (path.endsWith('/timeout')) throw Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' })
      return ok()
    }
    const expected = { '429': 2, '503': 2, '500': 1, net: 2, timeout: 1 }
    for (const [kind, sends] of Object.entries(expected)) {
      const path = `/v1/t/${kind}`
      await attempt(get(c, path, { r: 1 }))
      expect(fetchesTo(path), `${kind} with retry`).toBe(sends)
      await attempt(get(c, path, { r: 0 }, { retry: false }))
      expect(fetchesTo(path), `${kind} without retry`).toBe(sends + 1)
    }
    for (let i = 0; i < 10; i++) await attempt(get(c, '/v1/t/503', { round: i }, { retry: false }))
    expect(c.accessBreakerStatus().global).toMatchObject({ state: 'closed', refusals: 0 })
    expect(c.apiCallStats()).toMatchObject({ accessRefused: 0, circuitRejected: 0 })
  })
})

describe('global level open: nothing reaches fetch', () => {
  it('opens after 3 requests and logs the pause once', async () => {
    const c = await client()
    await openGlobal(c)
    expect(fetchMock.mock.calls.length).toBe(3)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('pausing upstream calls for 10 min'))
  })

  it('refuses 100 distinct calls on 10 endpoints without a single request', async () => {
    const c = await client()
    await openGlobal(c)
    const paths = Array.from({ length: 10 }, (_, k) => (k % 2 ? `/v1/analytics/t${k}` : `/v1/t${k}`))
    const results = await Promise.all(Array.from({ length: 100 }, (_, i) => attempt(get(c, paths[i % 10], { i }))))
    expect(fetchMock.mock.calls.length).toBe(3)
    expect(c.apiCallStats()).toMatchObject({ network: 3, circuitRejected: 100 })
    for (const r of results) {
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.error).toMatchObject({ status: 403, circuitOpen: true })
        expect(c.classifyError(r.error)).toBe('forbidden')
      }
    }
  })

  it('spends no budget on refused calls', async () => {
    const c = await client()
    await openGlobal(c)
    const analytics = c.budgetHeadroom('/v1/analytics/x').available
    const other = c.budgetHeadroom(P).available
    await Promise.all(Array.from({ length: 20 }, (_, i) => attempt(get(c, i % 2 ? H : P, { i }))))
    expect(c.budgetHeadroom('/v1/analytics/x').available).toBe(analytics)
    expect(c.budgetHeadroom(P).available).toBe(other)
  })

  it('still serves cache hits', async () => {
    const c = await client()
    await expect(get(c, P, { cached: 1 })).resolves.toEqual([{ hero_id: 1 }])
    vi.setSystemTime(T0 + 2 * MIN) // that authorized answer would otherwise keep the breaker closed for 60 s
    await openGlobal(c)
    await expect(get(c, P, { cached: 1 })).resolves.toEqual([{ hero_id: 1 }])
    expect(fetchesTo(P)).toBe(1)
    expect(c.apiCallStats().hits).toBe(1)
  })
})

describe('half-open probes', () => {
  it('lets exactly one of 50 concurrent calls through after the cooldown', async () => {
    const c = await client()
    await openGlobal(c)
    vi.setSystemTime(T0 + 10 * MIN)
    const probe = deferred()
    respond = (path) => (path === P ? probe.promise : refusing.has(path) ? reply(403) : ok())
    const before = c.apiCallStats().circuitRejected
    const pending = Promise.all(Array.from({ length: 50 }, (_, i) => attempt(get(c, P, { i }))))
    await vi.waitFor(() => expect(fetchesTo(P)).toBe(1))
    probe.resolve(ok())
    const results = await pending
    expect(fetchesTo(P)).toBe(1)
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(c.apiCallStats().circuitRejected - before).toBe(49)
    expect(c.accessBreakerStatus().global.state).toBe('closed')
  })

  it('a refused probe re-opens for 20 min: no request at 19:59, one at 20:00', async () => {
    const c = await client()
    await openGlobal(c)
    const t1 = T0 + 10 * MIN
    vi.setSystemTime(t1)
    respond = (path) => (path === P || refusing.has(path) ? reply(403) : ok())
    await attempt(get(c, P))
    expect(c.accessBreakerStatus().global).toMatchObject({ state: 'open', cooldownMs: 20 * MIN, retryAt: t1 + 20 * MIN })
    vi.setSystemTime(t1 + 20 * MIN - 1)
    await attempt(get(c, Q, { n: 1 }))
    expect(fetchesTo(Q)).toBe(0)
    vi.setSystemTime(t1 + 20 * MIN)
    await expect(get(c, Q, { n: 2 })).resolves.toEqual([{ hero_id: 1 }])
    expect(fetchesTo(Q)).toBe(1)
  })

  it('an authorized probe closes it: the next 20 calls all go out', async () => {
    const c = await client()
    await openGlobal(c)
    vi.setSystemTime(T0 + 10 * MIN)
    await expect(get(c, P)).resolves.toBeTruthy()
    for (let i = 0; i < 20; i++) await get(c, Q, { i })
    expect(fetchesTo(Q)).toBe(20)
  })

  it('a probe that fails on the network frees the slot for the next call', async () => {
    const c = await client()
    await openGlobal(c)
    vi.setSystemTime(T0 + 10 * MIN)
    respond = (path) => {
      if (path === P) throw new TypeError('fetch failed')
      return refusing.has(path) ? reply(403) : ok()
    }
    const r = await attempt(get(c, P, {}, { retry: false }))
    expect(r.ok).toBe(false)
    expect(fetchesTo(P)).toBe(1)
    expect(c.accessBreakerStatus().global).toMatchObject({ state: 'half-open', probing: false })
    await expect(get(c, Q)).resolves.toBeTruthy()
    expect(fetchesTo(Q)).toBe(1)
    expect(c.accessBreakerStatus().global.state).toBe('closed')
  })
})

describe('player-scoped endpoints', () => {
  const PLAYER = ['rank', 'match-history', 'mate-stats', 'enemy-stats']
  const isPlayer = (path: string) => /^\/v1\/players\/\d+\//.test(path)

  it('pause per endpoint after 3 accounts, but never open the global level', async () => {
    const c = await client()
    respond = (path) => (isPlayer(path) ? reply(403) : ok())
    for (const kind of PLAYER) for (const id of [1, 2, 3]) await attempt(get(c, `/v1/players/${id}/${kind}`))
    expect(fetchMock.mock.calls.length).toBe(12)
    for (const kind of PLAYER) await attempt(get(c, `/v1/players/4/${kind}`))
    expect(fetchMock.mock.calls.length).toBe(12)
    expect(c.accessBreakerStatus().global.state).toBe('closed')
    await expect(get(c, H)).resolves.toEqual([{ hero_id: 1 }])
    expect(fetchesTo(H)).toBe(1)
  })

  it('one private account refused repeatedly pauses nothing', async () => {
    const c = await client()
    respond = (path) => (path === '/v1/players/1/rank' ? reply(403) : ok())
    for (let i = 0; i < 5; i++) {
      await attempt(get(c, '/v1/players/1/rank'))
      await get(c, `/v1/players/${i + 2}/rank`)
    }
    expect(fetchesTo('/v1/players/1/rank')).toBe(5)
    const s = c.accessBreakerStatus()
    expect(s.endpoints['/v1/players/:id/rank'].state).toBe('closed')
    expect(s.global.state).toBe('closed')
  })
})

describe('no-send paths give the probe back', () => {
  it('budget refused after admit: no request, and the probe slot is free again', async () => {
    const c = await client()
    const X = '/v1/analytics/hero-counter-stats'
    respond = (path) => (path === X ? reply(403) : ok())
    await attempt(get(c, X, { n: 1 }))
    await attempt(get(c, X, { n: 2 })) // endpoint X open; global level has 2 signals from 1 template: closed
    expect(c.accessBreakerStatus().endpoints[X].state).toBe('open')
    vi.setSystemTime(T0 + 10 * MIN) // cooldown over, budget refilled
    for (let i = 0; i < 40; i++) await get(c, H, { drain: i }) // analytics burst spent
    const r = await attempt(get(c, X, { n: 3 }, { timeoutMs: 100 })) // X's probe, then no budget
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatchObject({ status: 429, circuitOpen: false })
    expect(fetchesTo(X)).toBe(2)
    expect(c.accessBreakerStatus().endpoints[X]).toMatchObject({ state: 'half-open', probing: false })
    vi.setSystemTime(T0 + 11 * MIN)
    respond = () => ok()
    await expect(get(c, X, { n: 4 })).resolves.toBeTruthy()
    expect(fetchesTo(X)).toBe(3)
    expect(c.accessBreakerStatus().endpoints[X].state).toBe('closed')
  })

  it('breaker opens while a call waits for budget: that call sends nothing', async () => {
    const c = await client()
    // Spend the analytics burst on 500s: neutral answers, so nothing counts as authorized.
    const DRAIN = '/v1/analytics/drain'
    respond = (path) => (path === DRAIN ? reply(500) : refusing.has(path) ? reply(403) : ok())
    for (let i = 0; i < 40; i++) await attempt(get(c, DRAIN, { i }, { retry: false }))
    expect(fetchesTo(DRAIN)).toBe(40)
    const waiting = attempt(get(c, H, { waiting: 1 })) // books a token, sleeps ~375 ms
    await openGlobal(c)
    const r = await waiting
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatchObject({ status: 403, circuitOpen: true })
    expect(fetchesTo(H)).toBe(0)
  })

  it('breaker opens during a retry delay: the retry is never sent', async () => {
    const c = await client()
    respond = (path) => (path === Q ? reply(503, { 'retry-after': '1' }) : refusing.has(path) ? reply(403) : ok())
    const retrying = attempt(get(c, Q))
    await vi.waitFor(() => expect(fetchesTo(Q)).toBe(1))
    await openGlobal(c)
    const r = await retrying
    expect(fetchesTo(Q)).toBe(1)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toMatchObject({ status: 403, circuitOpen: true })
      expect(c.classifyError(r.error)).toBe('forbidden')
    }
  })
})

describe('answers from an older generation', () => {
  it('a 200 sent before the open neither closes it nor counts as authorized', async () => {
    const c = await client()
    const late = deferred()
    respond = (path) => (path === P ? late.promise : refusing.has(path) ? reply(403) : ok())
    const pending = attempt(get(c, P))
    await vi.waitFor(() => expect(fetchesTo(P)).toBe(1))
    await openGlobal(c)
    const { retryAt } = c.accessBreakerStatus().global
    late.resolve(ok())
    expect((await pending).ok).toBe(true)
    expect(c.accessBreakerStatus().global).toMatchObject({ state: 'open', retryAt, lastAuthorizedAt: null })
    vi.setSystemTime(retryAt! - 1)
    await attempt(get(c, Q))
    expect(fetchesTo(Q)).toBe(0)
  })

  it('a replaced probe answering late changes neither state nor retryAt', async () => {
    const c = await client()
    await openGlobal(c)
    const t1 = T0 + 10 * MIN
    vi.setSystemTime(t1)
    const late = deferred()
    respond = (path) => (path === P ? late.promise : path === Q || refusing.has(path) ? reply(403) : ok())
    const first = attempt(get(c, P))
    await vi.waitFor(() => expect(fetchesTo(P)).toBe(1))
    vi.setSystemTime(t1 + MIN) // first probe is stale: the next call replaces it
    await attempt(get(c, Q))
    const reopened = c.accessBreakerStatus().global
    expect(reopened).toMatchObject({ state: 'open', cooldownMs: 20 * MIN, retryAt: t1 + MIN + 20 * MIN })
    late.resolve(ok())
    await first
    expect(c.accessBreakerStatus().global).toMatchObject({ state: 'open', cooldownMs: 20 * MIN, retryAt: reopened.retryAt })
  })

  it('a 403 sent before an open/close cycle does not count after the close', async () => {
    const c = await client()
    const EP = '/v1/analytics/item-stats'
    const late = deferred()
    const X = ['/v1/t/x', '/v1/t/y', '/v1/t/z']
    respond = (path) => (path === EP ? late.promise : refusing.has(path) || X.includes(path) ? reply(403) : ok())
    const pending = attempt(get(c, EP))
    await vi.waitFor(() => expect(fetchesTo(EP)).toBe(1))
    await openGlobal(c)
    // vi.waitFor advances the fake clock while polling, so read the reopening time instead of assuming it.
    const retryAt = c.accessBreakerStatus().global.retryAt!
    vi.setSystemTime(retryAt)
    await expect(get(c, P)).resolves.toBeTruthy() // probe closes the global level
    vi.setSystemTime(retryAt + 2 * MIN) // the probe's authorized answer is out of the 60 s window
    late.resolve(reply(403))
    const r = await pending
    if (!r.ok) expect(r.error).toMatchObject({ status: 403, circuitOpen: false })
    expect(c.accessBreakerStatus().global).toMatchObject({ state: 'closed', refusals: 0 })
    await attempt(get(c, X[0]))
    await attempt(get(c, X[1]))
    expect(c.accessBreakerStatus().global.state).toBe('closed') // would be open if the late 403 had counted
    await attempt(get(c, X[2]))
    expect(c.accessBreakerStatus().global.state).toBe('open')
    for (const x of X) expect(fetchesTo(x)).toBe(1)
  })
})

describe('coalescing', () => {
  it('closed: 20 concurrent callers of one URL share one request', async () => {
    const c = await client()
    const answer = deferred()
    respond = (path) => (path === P ? answer.promise : ok())
    const pending = Promise.all(Array.from({ length: 20 }, () => get(c, P, { same: 1 })))
    await vi.waitFor(() => expect(fetchesTo(P)).toBe(1))
    answer.resolve(ok())
    const results = await pending
    expect(results).toHaveLength(20)
    expect(fetchMock.mock.calls.length).toBe(1)
  })

  it('open: 20 concurrent callers of one URL share one refusal, without a request', async () => {
    const c = await client()
    await openGlobal(c)
    const before = c.apiCallStats().circuitRejected
    const results = await Promise.all(Array.from({ length: 20 }, () => attempt(get(c, P, { same: 1 }))))
    expect(fetchMock.mock.calls.length).toBe(3)
    expect(c.apiCallStats().circuitRejected - before).toBe(1)
    const errors = new Set(results.map((r) => (r.ok ? null : r.error)))
    expect(errors.size).toBe(1)
  })

  it('open: 20 different URLs are 20 refusals, still without a request', async () => {
    const c = await client()
    await openGlobal(c)
    const before = c.apiCallStats().circuitRejected
    await Promise.all(Array.from({ length: 20 }, (_, i) => attempt(get(c, P, { i }))))
    expect(fetchMock.mock.calls.length).toBe(3)
    expect(c.apiCallStats().circuitRejected - before).toBe(20)
  })
})

describe('User-Agent', () => {
  it('is unchanged', async () => {
    const c = await client()
    await get(c, P)
    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> }
    expect(init.headers['User-Agent']).toBe('deadlockprohunger')
  })
})
