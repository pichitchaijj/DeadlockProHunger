import 'server-only'
import { createHash } from 'node:crypto'
import { unstable_cache } from 'next/cache'
import { z } from 'zod'
import { budgetClasses, classFor, TokenBucket, type BudgetClass } from './budget'

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
    if (TRACE) console.info(`[api] ${path} budget:${id} exhausted`)
    throw new DeadlockApiError(`Outbound ${id} budget exhausted`, 429, path)
  }
  if (wait > 0) {
    if (TRACE) console.info(`[api] ${path} budget:${id} wait ${wait}ms`)
    await new Promise((resolve) => setTimeout(resolve, wait))
  }
}

// ── Network ──────────────────────────────────────────────────────────

async function request<S extends z.ZodType>(url: string, path: string, schema: S, timeoutMs: number, retry: boolean): Promise<z.infer<S>> {
  const headers: HeadersInit = { Accept: 'application/json', 'User-Agent': 'deadlockprohunger' }
  if (process.env.DEADLOCK_API_KEY) headers['X-API-KEY'] = process.env.DEADLOCK_API_KEY
  // A request may queue for at most half its timeout; beyond that the budget is effectively spent.
  const maxWaitMs = Math.min(3_000, timeoutMs / 2)

  const started = performance.now()
  for (let attempt = 0; ; attempt++) {
    await acquire(path, maxWaitMs) // every network attempt (retries too) spends budget
    let response: Response
    try {
      // no-store: caching is done above, on the parsed result (inside unstable_cache Next treats
      // fetch as no-store anyway).
      response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' })
    } catch (error) {
      // A timeout isn't retried: the upstream is already slow, and a second full wait doubled the time
      // to an answer (20–30 s measured, docs/QA.md § Error handling). Network errors get one retry.
      const timedOut = error instanceof Error && error.name === 'TimeoutError'
      if (retry && attempt === 0 && !timedOut) continue
      throw new DeadlockApiError(`Request failed: ${(error as Error).message}`, null, path)
    }

    if (retry && RETRYABLE.has(response.status) && attempt === 0) {
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

// ── Public ───────────────────────────────────────────────────────────

export async function deadlockGet<S extends z.ZodType>(
  path: string,
  { params, schema, revalidate, tags, timeoutMs = 10_000, retry = true }: GetOptions<S>,
): Promise<z.infer<S>> {
  const url = buildUrl(path, params)
  const sKey = schemaKey(schema)
  const load = () => request(url, path, schema, timeoutMs, retry)

  if (revalidate === false || sKey === null) return coalesce(`${url}|${sKey}|direct`, load)

  return coalesce(`${url}|${sKey}`, async () => {
    let missed = false
    const cached = unstable_cache(
      () => {
        missed = true
        return load()
      },
      ['deadlock', CACHE_VERSION, url, sKey],
      { revalidate, tags },
    )
    const data = (await cached()) as z.infer<S>
    if (TRACE && !missed) console.info(`[api] ${path}${new URL(url).search} hit`)
    return data
  })
}
