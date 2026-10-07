/**
 * Fixed-window request limiter, in memory (docs/QA.md § Rate-limit handling).
 * Per server instance only: on a multi-instance host it bounds each instance, not the whole site.
 * That still caps how much of the shared upstream budget one client can spend through us.
 */
export type RateLimitResult = { ok: true } | { ok: false; retryAfterS: number }

export function createRateLimiter({ limit, windowMs, maxKeys = 10_000 }: { limit: number; windowMs: number; maxKeys?: number }) {
  const windows = new Map<string, { start: number; count: number }>()

  return function check(key: string, now = Date.now()): RateLimitResult {
    let w = windows.get(key)
    if (!w || now - w.start >= windowMs) {
      // Bound memory: drop expired windows first, then the oldest, before adding a key.
      if (!w && windows.size >= maxKeys) {
        for (const [k, v] of windows) if (now - v.start >= windowMs) windows.delete(k)
        if (windows.size >= maxKeys) windows.delete(windows.keys().next().value as string)
      }
      w = { start: now, count: 0 }
      windows.set(key, w)
    }
    w.count += 1
    if (w.count <= limit) return { ok: true }
    return { ok: false, retryAfterS: Math.max(1, Math.ceil((w.start + windowMs - now) / 1000)) }
  }
}

/** The client address as the host reports it; Vercel overwrites `x-forwarded-for` with the real one. */
export function clientKey(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'unknown'
}
