import 'server-only'
import type { z } from 'zod'

/**
 * Server-only Deadlock API client (docs/API.md § 7).
 * - Optional X-API-KEY header from DEADLOCK_API_KEY (never the api_key query param).
 * - Next data cache per call (`revalidate`, `tags`), so identical presets share one upstream request.
 * - One retry on network errors, 429 and 502/503/504 (Retry-After honored, capped); timeouts aren't retried.
 * - Responses are validated with zod; only the fields we use are kept.
 *
 * - `DEADLOCK_API_TRACE=1` logs every call (path, ms, attempt) for performance audits (docs/PERFORMANCE.md).
 *
 * Not yet implemented (P1): per-class token buckets. Last-good fallbacks live in lib/db/store.ts.
 */
const BASE_URL = process.env.DEADLOCK_API_BASE_URL ?? 'https://api.deadlock-api.com'
const RETRYABLE = new Set([429, 502, 503, 504])

import { DeadlockApiError } from './apiError'

export { DeadlockApiError }

export type QueryValue = string | number | boolean | Array<string | number> | null | undefined

type GetOptions<S extends z.ZodType> = {
  params?: Record<string, QueryValue>
  schema: S
  /**
   * Seconds in the Next data cache (see lib/cache/ttl.ts), or `false` for responses over the
   * cache's 2 MB entry limit: cache a parsed projection with unstable_cache instead.
   */
  revalidate: number | false
  tags?: string[]
  timeoutMs?: number
  /** One retry on network errors, timeouts, 429 and 5xx. Interactive lookups (search) turn it off to stay fast. */
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

export async function deadlockGet<S extends z.ZodType>(
  path: string,
  { params, schema, revalidate, tags, timeoutMs = 10_000, retry = true }: GetOptions<S>,
): Promise<z.infer<S>> {
  const url = buildUrl(path, params)
  const headers: HeadersInit = { Accept: 'application/json', 'User-Agent': 'deadlockprohunger' }
  if (process.env.DEADLOCK_API_KEY) headers['X-API-KEY'] = process.env.DEADLOCK_API_KEY

  const started = performance.now()
  for (let attempt = 0; ; attempt++) {
    let response: Response
    try {
      response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
        ...(revalidate === false ? { cache: 'no-store' as const } : { next: { revalidate, tags } }),
      })
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
    if (process.env.DEADLOCK_API_TRACE === '1') console.info(`[api] ${path}${new URL(url).search} ${response.status} ${Math.round(performance.now() - started)}ms${attempt ? ' retry' : ''}`)
    if (!response.ok) throw new DeadlockApiError(`HTTP ${response.status}`, response.status, path)

    const parsed = schema.safeParse(await response.json())
    if (!parsed.success) {
      throw new DeadlockApiError(`Unexpected response shape: ${parsed.error.issues[0]?.message ?? 'invalid'}`, response.status, path)
    }
    return parsed.data
  }
}
