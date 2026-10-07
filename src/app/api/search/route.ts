import { NextResponse, type NextRequest } from 'next/server'
import { globalSearch } from '@/features/search/loaders'
import { MAX_QUERY, MIN_QUERY } from '@/features/search/model'
import { clientKey, createRateLimiter } from '@/lib/rateLimit'

/**
 * Each new query costs upstream calls (builds, players) from the shared budget. The palette debounces
 * at 200 ms and caches answers, so real typing stays far below this; scripted query floods don't.
 */
const throttle = createRateLimiter({ limit: 40, windowMs: 60_000 })

/** GET /api/search?q= — grouped results for the command palette. Server-side only; no API key reaches the browser. */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY)
  if (q.length < MIN_QUERY) return NextResponse.json({ groups: [], partial: false })
  const limited = throttle(clientKey(request.headers))
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'rate-limit' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterS), 'Cache-Control': 'no-store' } },
    )
  }
  const result = await globalSearch(q)
  return NextResponse.json(result, {
    // Same query from anyone within a minute is served from the CDN/browser cache.
    headers: { 'Cache-Control': result.partial ? 'no-store' : 'public, max-age=60, s-maxage=300' },
  })
}
