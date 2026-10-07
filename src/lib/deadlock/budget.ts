/**
 * Outbound request budget for the Deadlock API (docs/API.md § Rate-limit model). Pure: the clock is
 * passed in, so it is unit-tested without timers.
 *
 * Only real network requests spend a token: the client checks its cache first and reaches the budget
 * on a miss (User → cache? → budget → API → cache). Buckets are in memory, per server instance.
 */

export type BudgetClass = 'analytics' | 'rank-batch' | 'match-bulk' | 'default'

type ClassLimit = {
  id: BudgetClass
  matches: (path: string) => boolean
  /** Sustained rate we allow ourselves: 80% of the spec's per-IP limit, leaving headroom. */
  perMinute: number
  /** Burst: requests that may go out at once before the sustained rate applies. */
  capacity: number
}

/**
 * Per-IP limits from the OpenAPI spec (verified 2026-10-07): every /v1/analytics/* endpoint shares one
 * 200/min bucket (400/min with an API key); batch ranks 20/min; bulk match metadata 30/min; most
 * other endpoints 100/s. First match wins.
 */
export function budgetClasses(hasApiKey: boolean): ClassLimit[] {
  return [
    { id: 'rank-batch', matches: (p) => p === '/v1/players/rank', perMinute: 16, capacity: 4 },
    { id: 'match-bulk', matches: (p) => p === '/v1/matches/metadata', perMinute: 24, capacity: 6 },
    { id: 'analytics', matches: (p) => p.startsWith('/v1/analytics/'), perMinute: hasApiKey ? 320 : 160, capacity: 40 },
    { id: 'default', matches: () => true, perMinute: 4_800, capacity: 100 },
  ]
}

export function classFor(path: string, classes: ClassLimit[]): ClassLimit {
  return classes.find((c) => c.matches(path)) ?? classes[classes.length - 1]
}

/**
 * Token bucket with reservations. `reserve` takes a token now or books the next free one and says how
 * long to wait for it; a booking that would wait longer than `maxWaitMs` is refused and costs nothing.
 * Tokens can go negative: that is the queue of booked requests.
 */
export class TokenBucket {
  private tokens: number
  private updatedAt: number
  private readonly perMs: number
  private readonly capacity: number

  constructor(capacity: number, perMinute: number, now: number) {
    this.capacity = capacity
    this.tokens = capacity
    this.updatedAt = now
    this.perMs = perMinute / 60_000
  }

  private refill(now: number) {
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.updatedAt) * this.perMs)
    this.updatedAt = now
  }

  /** Tokens available now (may be negative while booked requests are queued). Reading never spends one. */
  available(now: number): number {
    this.refill(now)
    return this.tokens
  }

  get size(): number {
    return this.capacity
  }

  /** Milliseconds to wait before sending (0 = send now), or null when the wait would exceed `maxWaitMs`. */
  reserve(now: number, maxWaitMs: number): number | null {
    this.refill(now)
    const wait = this.tokens >= 1 ? 0 : Math.ceil((1 - this.tokens) / this.perMs)
    if (wait > maxWaitMs) return null
    this.tokens -= 1
    return wait
  }
}
