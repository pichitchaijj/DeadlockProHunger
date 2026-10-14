import { DataError } from './errors'
import type { HeroStatsQuery } from './endpoints'

/*
 * The expensive analytics endpoints (the Deadlock API maintainer named them: hero-build-stats,
 * ability-order-stats, item-flow-stats, item-stats). Their cache keys roll over once a day instead of every
 * ANALYTICS_KEY_STEP (6h), with TTL.expensiveAnalytics to match, so each scope is requested at most once a day
 * per cache. This lowers how often keys change; it does not stop two server instances that both miss from both
 * requesting (per-instance coalescing only).
 */

const DAY = 86_400

/** Window end step for the expensive endpoints: UTC midnight. Equals TTL.expensiveAnalytics (tests/unit/expensive-scope.test.ts). */
export const EXPENSIVE_KEY_STEP = DAY

/**
 * The query cut to complete UTC days, so every request within a UTC day shares one key and no response holds a
 * partial "today" frozen at whatever time it was cached (docs/API.md § Day rounding):
 * - `exact` endpoints (hero-build-stats, ability-order-stats, item-flow-stats) filter timestamps exactly: the end
 *   is rounded down to UTC midnight, at most today's.
 * - whole-day endpoints (item-stats, and hero-stats when used beside it: `completeDaysQuery`) include the whole day
 *   a bound falls in. The query's last day (the day its end falls in) is kept, but never today: the end sent is
 *   that day's noon (as `throughDay()`), so the window is the same complete days as an exact one.
 * When no complete day is left (e.g. a `patch` window on the patch's own day), nothing is requested: `pending`.
 */
export function expensiveQuery(query: HeroStatsQuery, exact: boolean, nowSec = Date.now() / 1000): HeroStatsQuery {
  const today = Math.floor(nowSec / EXPENSIVE_KEY_STEP) * EXPENSIVE_KEY_STEP
  const day = Math.floor(query.maxUnix / EXPENSIVE_KEY_STEP) * EXPENSIVE_KEY_STEP
  // Exclusive end of the complete days covered.
  const end = Math.min(exact ? day : day + DAY, today)
  const start = exact ? query.minUnix : Math.floor(query.minUnix / DAY) * DAY
  if (end <= start) throw new DataError('No complete day in this window yet', 'pending')
  return { ...query, maxUnix: exact ? end : end - DAY + 12 * 3_600 }
}

/**
 * hero-stats over the same complete UTC days as `expensiveQuery(query, false)`: the denominator of any share whose
 * numerator is item-stats (buy rates, item progression, phase items, weekly item shares), so both sides cover the
 * same days. Throws `pending` like expensiveQuery.
 */
export const completeDaysQuery = (query: HeroStatsQuery, nowSec?: number): HeroStatsQuery => expensiveQuery(query, false, nowSec)

/** `cacheOnly`: read the cached entry only (lib/deadlock/client.ts); used on request paths that must not fan out. */
export type ExpensiveRead = { cacheOnly?: boolean }

/** Throws `limited` (before any request) when a view is computed only for other scopes. */
export function requireScope(allowed: boolean, what: string): void {
  if (!allowed) throw new DataError(`${what} is computed for the default scope only`, 'limited')
}
