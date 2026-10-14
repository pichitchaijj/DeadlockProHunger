import 'server-only'
import { createHash } from 'node:crypto'
import { unstable_cache } from 'next/cache'
import { stableKey } from '@/lib/cache/stableKey'
import { z } from 'zod'
import { AccessGuard, outcomeFor, type AccessStatus, type Outcome } from './accessBreaker'
import { budgetClasses, classFor, TokenBucket, type BudgetClass } from './budget'
import { DataError } from './errors'

/**
 * Server-only Deadlock API client (docs/API.md § 7). Every call follows one path:
 *
 *   caller → cache? ── hit ──→ parsed data (no request, no budget spent)
 *              └── miss → outbound budget (token bucket per limit class) → Deadlock API
 *                         → zod parse → cache → caller
 *
 * - Cache: Next's data cache via `unstable_cache`, keyed on the full URL plus the schema, holding the
 *   *parsed* projection (only the fields we use), so a hit skips both the request and the parse.
 *   Errors are never cached. `revalidate: false` callers cache their own projection and skip this layer.
 * - Budget (lib/deadlock/budget.ts): spent only on real requests, retries included. When a request
 *   would have to wait longer than its share of the timeout, it fails as a rate limit (`classifyError`
 *   → 'rate-limit') instead of queuing, so pages show the usual "rate limited" notice or a snapshot.
 * - Concurrent misses for the same key share one request (in-flight coalescing).
 * - Optional X-API-KEY header from DEADLOCK_API_KEY (never the api_key query param).
 * - One retry on network errors, 429 and 502/503/504 (Retry-After honored, capped); timeouts aren't retried.
 * - Access breaker (lib/deadlock/accessBreaker.ts): after repeated 401/403, calls fail as a refusal without a
 *   request or budget until a cooldown ends; checked before the budget and again right before sending.
 * - `cacheOnly` reads (lib/deadlock/expensive.ts): the same cache entry, but a miss sends nothing and fails as
 *   `pending` (or as refused while the breaker reports a refusal); nothing is cached for it.
 * - `DEADLOCK_API_TRACE=1` logs every call: network requests with status and time, cache hits as `hit`,
 *   and budget waits (docs/PERFORMANCE.md).
 */
const BASE_URL = process.env.DEADLOCK_API_BASE_URL ?? 'https://api.deadlock-api.com'
const RETRYABLE = new Set([429, 502, 503, 504])
const TRACE = process.env.DEADLOCK_API_TRACE === '1'
/** Bump to discard every cached API entry (e.g. after changing how entries are stored). */
const CACHE_VERSION = 'v2'

import { DeadlockApiError } from './apiError'

export { DeadlockApiError }

export type QueryValue = string | number | boolean | Array<string | number> | null | undefined

type GetOptions<S extends z.ZodType> = {
  params?: Record<string, QueryValue>
  schema: S
  /**
   * Seconds in the data cache (see lib/cache/ttl.ts), or `false` when the caller caches its own parsed
   * projection with unstable_cache (responses over the 2 MB entry limit).
   */
  revalidate: number | false
  tags?: string[]
  timeoutMs?: number
  /** One retry on network errors, 429 and 5xx. Interactive lookups (search) turn it off to stay fast. */
  retry?: boolean
  /**
   * Read the cached entry only: a miss sends no request, spends no budget, caches nothing and fails as
   * `pending` (refused, if the access breaker reports a refusal). The entry is the one a normal call fills.
   */
  cacheOnly?: boolean
}

export function buildUrl(path: string, params: Record<string, QueryValue> = {}): string {
  const url = new URL(path, BASE_URL)
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    url.searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value))
  }
  return url.toString()
}

// ── Outbound budget ──────────────────────────────────────────────────

const CLASSES = budgetClasses(Boolean(process.env.DEADLOCK_API_KEY))
const buckets = new Map<BudgetClass, TokenBucket>()

/**
 * Counters since the server instance started (for the prewarm job's report and audits). Counts only:
 * no URLs, headers or keys are kept.
 */
const counters = { network: 0, hits: 0, budgetWaits: 0, budgetExhausted: 0, accessRefused: 0, circuitRejected: 0, notWarmed: 0 }
export type ApiCallStats = typeof counters
export const apiCallStats = (): ApiCallStats => ({ ...counters })

// ── Access breaker ───────────────────────────────────────────────────

let access = new AccessGuard()

/** Breaker state (global and per endpoint template), for reports. No URLs or ids. */
export const accessBreakerStatus = (): AccessStatus => access.status()

/** Test-only: a fresh breaker. */
export function resetAccessBreakerForTests() {
  access = new AccessGuard()
}

/** A call refused by the breaker itself: nothing was sent and no budget was spent. */
function refusedByBreaker(path: string) {
  counters.circuitRejected++
  return new DeadlockApiError('Upstream access refused (circuit open)', 403, path, { circuitOpen: true })
}

/** Unspent tokens in the bucket that serves `path`, so background work can leave room for users. */
export function budgetHeadroom(path: string): { available: number; capacity: number } {
  const { bucket } = bucketFor(path)
  return { available: bucket.available(Date.now()), capacity: bucket.size }
}

function bucketFor(path: string) {
  const cls = classFor(path, CLASSES)
  let bucket = buckets.get(cls.id)
  if (!bucket) buckets.set(cls.id, (bucket = new TokenBucket(cls.capacity, cls.perMinute, Date.now())))
  return { bucket, id: cls.id }
}

/** Waits for a request slot, or fails as a rate limit when the wait would exceed `maxWaitMs`. */
async function acquire(path: string, maxWaitMs: number) {
  const { bucket, id } = bucketFor(path)
  const wait = bucket.reserve(Date.now(), maxWaitMs)
  if (wait === null) {
    counters.budgetExhausted++
    if (TRACE) console.info(`[api] ${path} budget:${id} exhausted`)
    throw new DeadlockApiError(`Outbound ${id} budget exhausted`, 429, path)
  }
  if (wait > 0) {
    counters.budgetWaits++
    if (TRACE) console.info(`[api] ${path} budget:${id} wait ${wait}ms`)
    await new Promise((resolve) => setTimeout(resolve, wait))
  }
}

// ── Network ──────────────────────────────────────────────────────────

/**
 * Vercel Preview deployments (their build and runtime) send nothing upstream unless DEADLOCK_API_IN_PREVIEW=1:
 * a pushed branch must not prerender or serve pages from the live API by accident. Fail-closed for
 * VERCEL_ENV=preview; production (VERCEL_ENV=production), local and test runs (no VERCEL_ENV) are unchanged.
 * Read per call, so a deployment's env decides, not the module's first load.
 */
export function previewBlocked(): boolean {
  return process.env.VERCEL_ENV === 'preview' && process.env.DEADLOCK_API_IN_PREVIEW !== '1'
}

async function request<S extends z.ZodType>(url: string, path: string, schema: S, timeoutMs: number, retry: boolean): Promise<z.infer<S>> {
  // Before the breaker and the budget: a blocked call takes no ticket, spends no token and sends nothing. Not a
  // refusal (nothing was refused upstream) and not cached (thrown inside the cache callback, like any failure).
  if (previewBlocked()) {
    if (TRACE) console.info(`[api] ${path} blocked (preview)`)
    throw new DataError('Deadlock API calls are off in Vercel Preview (DEADLOCK_API_IN_PREVIEW=1 allows them)', 'unavailable')
  }
  const headers: HeadersInit = { Accept: 'application/json', 'User-Agent': 'deadlockprohunger' }
  if (process.env.DEADLOCK_API_KEY) headers['X-API-KEY'] = process.env.DEADLOCK_API_KEY
  // A request may queue for at most half its timeout; beyond that the budget is effectively spent.
  const maxWaitMs = Math.min(3_000, timeoutMs / 2)

  const started = performance.now()
  for (let attempt = 0; ; attempt++) {
    // Every attempt (retries too) is admitted by the breaker first: synchronous, before any await.
    const ticket = access.admit(path, Date.now())
    if ('rejected' in ticket) throw refusedByBreaker(path)
    // Settled exactly once below, on every path: an attempt that sends nothing settles as 'none', which
    // frees a half-open probe slot it may hold.
    let outcome: Outcome = 'none'
    try {
      await acquire(path, maxWaitMs) // every network attempt (retries too) spends budget
      // The breaker may have opened while this attempt waited for budget: then nothing is sent.
      if (!access.isCurrent(ticket)) throw refusedByBreaker(path)
      ticket.sentAt = Date.now()
      counters.network++
      outcome = 'neutral'
      let response: Response
      try {
        // no-store: caching is done above, on the parsed result (inside unstable_cache Next treats
        // fetch as no-store anyway).
        response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' })
      } catch (error) {
        // A timeout isn't retried: the upstream is already slow, and a second full wait doubled the time
        // to an answer (20–30 s measured, docs/QA.md § Error handling). Network errors get one retry.
        const timedOut = error instanceof Error && error.name === 'TimeoutError'
        if (retry && attempt === 0 && !timedOut) {
          access.settle(ticket, outcome, Date.now())
          continue
        }
        throw new DeadlockApiError(`Request failed: ${(error as Error).message}`, null, path)
      }

      outcome = outcomeFor(response.status)
      if (outcome === 'refused') counters.accessRefused++
      if (retry && RETRYABLE.has(response.status) && attempt === 0) {
        access.settle(ticket, outcome, Date.now()) // before sleeping, so a probe slot isn't held through the wait
        const retryAfter = Number(response.headers.get('retry-after'))
        await new Promise((resolve) => setTimeout(resolve, Math.min(Number.isFinite(retryAfter) ? retryAfter * 1000 : 800, 3000)))
        continue
      }
      // Path + query, so audits can tell true duplicates (same params) from distinct calls on one path.
      if (TRACE) console.info(`[api] ${path}${new URL(url).search} ${response.status} ${Math.round(performance.now() - started)}ms${attempt ? ' retry' : ''}`)
      if (!response.ok) throw new DeadlockApiError(`HTTP ${response.status}`, response.status, path)

      const parsed = schema.safeParse(await response.json())
      if (!parsed.success) {
        throw new DeadlockApiError(`Unexpected response shape: ${parsed.error.issues[0]?.message ?? 'invalid'}`, response.status, path)
      }
      return parsed.data
    } finally {
      access.settle(ticket, outcome, Date.now())
    }
  }
}

// ── Cache keys and coalescing ────────────────────────────────────────

const schemaKeys = new WeakMap<z.ZodType, string | null>()

/**
 * Stable fingerprint of a schema, so two call sites that request the same URL but keep different
 * fields never share a cached projection. Null when the schema can't be described (then: no cache).
 */
function schemaKey(schema: z.ZodType): string | null {
  if (schemaKeys.has(schema)) return schemaKeys.get(schema)!
  let key: string | null = null
  try {
    key = createHash('sha1').update(JSON.stringify(z.toJSONSchema(schema, { unrepresentable: 'any' }))).digest('hex').slice(0, 12)
  } catch (error) {
    console.warn('[api] schema not cacheable; requests for it bypass the cache', error)
  }
  schemaKeys.set(schema, key)
  return key
}

const inFlight = new Map<string, Promise<unknown>>()

/** Concurrent calls with the same key share one promise until it settles. */
function coalesce<T>(key: string, run: () => Promise<T>): Promise<T> {
  const pending = inFlight.get(key) as Promise<T> | undefined
  if (pending) return pending
  const promise = run().finally(() => inFlight.delete(key))
  inFlight.set(key, promise)
  return promise
}

/** A cache-only miss: nothing was sent. A refusal stays a refusal; otherwise the data isn't prepared yet. */
export function notWarmed(path: string): Error {
  if (access.refusing(path, Date.now())) return refusedByBreaker(path)
  counters.notWarmed++
  if (TRACE) console.info(`[api] ${path} not warmed (cache-only)`)
  return new DataError('Not in the cache yet (cache-only)', 'pending')
}

/**
 * The cache layer for `path`: Next's data cache under the URL + schema key. Normal and cache-only reads use the
 * same key parts and the same fixed callback text (stableKey), so they read the same entry.
 */
function cachedEntry<T>(url: string, sKey: string, revalidate: number, tags: string[] | undefined, onMiss: () => Promise<T>) {
  // Fixed source text: the key is the URL + schema below, the same in every bundle (cron route and pages).
  return unstable_cache(stableKey('deadlock-api', onMiss), ['deadlock', CACHE_VERSION, url, sKey], { revalidate, tags })
}

// ── Public ───────────────────────────────────────────────────────────

export async function deadlockGet<S extends z.ZodType>(
  path: string,
  { params, schema, revalidate, tags, timeoutMs = 10_000, retry = true, cacheOnly = false }: GetOptions<S>,
): Promise<z.infer<S>> {
  const url = buildUrl(path, params)
  const sKey = schemaKey(schema)
  const load = () => request(url, path, schema, timeoutMs, retry)

  if (cacheOnly) {
    // Uncached calls (revalidate false: the caller caches its own projection) have no entry to read here.
    if (revalidate === false || sKey === null) throw notWarmed(path)
    // A normal call already fetching this key: share its result (no extra request).
    const fetching = inFlight.get(`${url}|${sKey}`) as Promise<z.infer<S>> | undefined
    if (fetching) return fetching
    return coalesce(`${url}|${sKey}|cache-only`, async () => {
      const data = (await cachedEntry(url, sKey, revalidate, tags, async () => {
        throw notWarmed(path)
      })()) as z.infer<S>
      counters.hits++
      if (TRACE) console.info(`[api] ${path}${new URL(url).search} hit (cache-only)`)
      return data
    })
  }

  if (revalidate === false || sKey === null) return coalesce(`${url}|${sKey}|direct`, load)

  return coalesce(`${url}|${sKey}`, async () => {
    let missed = false
    const cached = cachedEntry(url, sKey, revalidate, tags, () => {
      missed = true
      return load()
    })
    const data = (await cached()) as z.infer<S>
    if (!missed) counters.hits++
    if (TRACE && !missed) console.info(`[api] ${path}${new URL(url).search} hit`)
    return data
  })
}
