/*
 * Access breaker: after repeated 401/403 answers the client stops calling upstream for a while, so a refused
 * client doesn't keep re-sending every request (docs/API.md § client). It does not fix a refusal; it only
 * stops repeating refused calls. Pure: callers pass the clock, the client (lib/deadlock/client.ts) owns one.
 *
 * Two levels, each a closed → open → half-open state machine:
 *  - global: refusals from endpoints that are NOT player-scoped. Opens on ≥ 3 refusals from ≥ 2 endpoint
 *    templates within 60 s, with no authorized answer from any endpoint sent in that window.
 *  - endpoint (one per template, ids replaced by `:id`): opens on ≥ 2 refusals (player-scoped: ≥ 3 from ≥ 3
 *    accounts) within 60 s, with no authorized answer from that template sent in that window.
 * Player-scoped 401/403 (`/v1/players/{id}/…`, e.g. a private profile) never count toward the global level,
 * and an endpoint opening never signals the global level.
 *
 * Open: every call is refused without a request until `retryAt`. Then half-open: one probe at a time; an
 * authorized probe closes (cooldown back to base), a refused one re-opens with the cooldown doubled (capped),
 * anything else frees the slot for the next probe. A probe older than 60 s is replaced.
 *
 * Generations: every open/close bumps `gen`. A result is applied only for a pass of the current generation
 * (and, for a probe, the current probe id), so an answer to a request sent before a transition never
 * changes state, counts, `lastAuthorizedAt` or cooldown.
 */

/** refused = 401/403; authorized = upstream accepted the request (2xx, other 4xx); neutral = says nothing about access; none = nothing was sent. */
export type Outcome = 'refused' | 'authorized' | 'neutral' | 'none'
export type BreakerState = 'closed' | 'open' | 'half-open'

const MINUTE = 60_000
export const WINDOW_MS = MINUTE
export const PROBE_STALE_MS = MINUTE

export type BreakerConfig = { tripAfter: number; minKeys: number; baseCooldownMs: number; maxCooldownMs: number }
export const GLOBAL_BREAKER: BreakerConfig = { tripAfter: 3, minKeys: 2, baseCooldownMs: 10 * MINUTE, maxCooldownMs: 60 * MINUTE }
export const ENDPOINT_BREAKER: BreakerConfig = { tripAfter: 2, minKeys: 1, baseCooldownMs: 10 * MINUTE, maxCooldownMs: 60 * MINUTE }
export const PLAYER_ENDPOINT_BREAKER: BreakerConfig = { tripAfter: 3, minKeys: 3, baseCooldownMs: 2 * MINUTE, maxCooldownMs: 10 * MINUTE }

/** `/v1/players/123/rank` → `/v1/players/:id/rank`: one endpoint, whatever the id. */
export function endpointTemplate(path: string): string {
  return path
    .split('?')[0]
    .split('/')
    .map((segment) => (/^\d+$/.test(segment) ? ':id' : segment))
    .join('/')
}

const PLAYER_SCOPED = /^\/v1\/players\/:id\//

/** Per-account player endpoints (rank, match-history, mate-stats, enemy-stats). */
export function isPlayerScoped(template: string): boolean {
  return PLAYER_SCOPED.test(template)
}

export function outcomeFor(status: number): Outcome {
  if (status === 401 || status === 403) return 'refused'
  if (status === 429 || status >= 500) return 'neutral'
  return 'authorized'
}

export type Pass = { readonly gen: number; readonly probeId: number | null }
type Rejected = { rejected: true; retryAt: number }

export type BreakerStatus = {
  state: BreakerState
  retryAt: number | null
  cooldownMs: number
  probing: boolean
  /** When the probe in flight was let through, or null. */
  probeStartedAt: number | null
  refusals: number
  lastAuthorizedAt: number | null
}

/**
 * A status as of `now`. `status()` is a snapshot of the stored state, which moves from open to half-open only
 * when the next call is admitted; this reports an open breaker whose cooldown has ended as half-open (a call
 * would now be let through as the probe) and a stale probe as not probing. Reading it changes nothing.
 */
export function effectiveStatus(status: BreakerStatus, now: number): BreakerStatus {
  const due = status.state === 'open' && status.retryAt !== null && now >= status.retryAt
  const state = due ? 'half-open' : status.state
  return { ...status, state, probing: state === 'half-open' && status.probing && (status.probeStartedAt === null || now - status.probeStartedAt < PROBE_STALE_MS) }
}

export class Breaker {
  private readonly config: BreakerConfig
  private state: BreakerState = 'closed'
  private gen = 0
  private retryAt = 0
  private cooldownMs: number
  private probe: { id: number; startedAt: number } | null = null
  private probeSeq = 0
  private refusals: Array<{ key: string; at: number }> = []
  private lastAuthorizedAt = Number.NEGATIVE_INFINITY

  constructor(config: BreakerConfig) {
    this.config = config
    this.cooldownMs = config.baseCooldownMs
  }

  /** A pass for one attempt, or a refusal. Synchronous, so concurrent callers can't share a probe. */
  admit(now: number): Pass | Rejected {
    if (this.state === 'closed') return { gen: this.gen, probeId: null }
    if (this.state === 'open') {
      if (now < this.retryAt) return { rejected: true, retryAt: this.retryAt }
      this.state = 'half-open'
    }
    if (this.probe && now - this.probe.startedAt < PROBE_STALE_MS) return { rejected: true, retryAt: this.probe.startedAt + PROBE_STALE_MS }
    // A stale probe is replaced; its id stops being current, so its late answer is ignored.
    this.probe = { id: ++this.probeSeq, startedAt: now }
    return { gen: this.gen, probeId: this.probe.id }
  }

  isCurrent(pass: Pass): boolean {
    if (pass.gen !== this.gen) return false
    if (pass.probeId === null) return this.state === 'closed'
    return this.state === 'half-open' && this.probe?.id === pass.probeId
  }

  /**
   * Applies one attempt's outcome. `outcome` is already mapped for this level ('refused' only when it counts
   * here); `key` tells refusals apart (template or account); `sentAt` is when the request went out.
   */
  settle(pass: Pass, outcome: Outcome, key: string, sentAt: number | null, now: number): 'opened' | 'closed' | null {
    if (!this.isCurrent(pass)) return null
    if (pass.probeId !== null) {
      this.probe = null
      if (outcome === 'authorized') return this.close(sentAt ?? now)
      if (outcome === 'refused') return this.open(now, true)
      return null
    }
    if (outcome === 'authorized') {
      this.lastAuthorizedAt = Math.max(this.lastAuthorizedAt, sentAt ?? now)
      return null
    }
    if (outcome !== 'refused') return null
    this.refusals = [...this.refusals.filter((r) => now - r.at < WINDOW_MS), { key, at: now }]
    const keys = new Set(this.refusals.map((r) => r.key)).size
    const authorizedRecently = now - this.lastAuthorizedAt < WINDOW_MS
    if (this.refusals.length >= this.config.tripAfter && keys >= this.config.minKeys && !authorizedRecently) return this.open(now, false)
    return null
  }

  status(): BreakerStatus {
    return {
      state: this.state,
      retryAt: this.state === 'closed' ? null : this.retryAt,
      cooldownMs: this.cooldownMs,
      probing: this.probe !== null,
      probeStartedAt: this.probe?.startedAt ?? null,
      refusals: this.refusals.length,
      lastAuthorizedAt: Number.isFinite(this.lastAuthorizedAt) ? this.lastAuthorizedAt : null,
    }
  }

  private open(now: number, escalate: boolean) {
    if (escalate) this.cooldownMs = Math.min(this.cooldownMs * 2, this.config.maxCooldownMs)
    this.gen++
    this.state = 'open'
    this.retryAt = now + this.cooldownMs
    this.refusals = []
    this.probe = null
    return 'opened' as const
  }

  private close(sentAt: number) {
    this.gen++
    this.state = 'closed'
    this.cooldownMs = this.config.baseCooldownMs
    this.refusals = []
    this.lastAuthorizedAt = sentAt
    return 'closed' as const
  }
}

/** One attempt's passes for both levels. Settled exactly once. */
export type Ticket = {
  readonly template: string
  readonly key: string
  readonly player: boolean
  readonly endpoint: Pass
  readonly global: Pass
  sentAt: number | null
  settled: boolean
}

export type AccessRefusal = { rejected: true; scope: 'global' | 'endpoint'; retryAt: number }

export type AccessStatus = { global: BreakerStatus; endpoints: Record<string, BreakerStatus> }

export class AccessGuard {
  private readonly global = new Breaker(GLOBAL_BREAKER)
  private readonly endpoints = new Map<string, Breaker>()

  /** Endpoint level first: a paused endpoint never takes the global probe. */
  admit(path: string, now: number): Ticket | AccessRefusal {
    const template = endpointTemplate(path)
    const player = isPlayerScoped(template)
    const endpoint = this.endpoint(template)
    const e = endpoint.admit(now)
    if ('rejected' in e) return { rejected: true, scope: 'endpoint', retryAt: e.retryAt }
    const g = this.global.admit(now)
    if ('rejected' in g) {
      endpoint.settle(e, 'none', template, null, now) // give back an endpoint probe taken above
      return { rejected: true, scope: 'global', retryAt: g.retryAt }
    }
    return { template, key: player ? path.split('/')[3] : template, player, endpoint: e, global: g, sentAt: null, settled: false }
  }

  /** Both passes still current: checked again right before a request goes out. */
  isCurrent(ticket: Ticket): boolean {
    return this.endpoint(ticket.template).isCurrent(ticket.endpoint) && this.global.isCurrent(ticket.global)
  }

  settle(ticket: Ticket, outcome: Outcome, now: number): void {
    if (ticket.settled) return
    ticket.settled = true
    const endpoint = this.endpoint(ticket.template)
    this.log(ticket.template, endpoint, endpoint.settle(ticket.endpoint, outcome, ticket.key, ticket.sentAt, now))
    // Player-scoped refusals never reach the global level (a private profile is not a blocked client).
    const globalOutcome = ticket.player && outcome === 'refused' ? 'neutral' : outcome
    this.log('all endpoints', this.global, this.global.settle(ticket.global, globalOutcome, ticket.template, ticket.sentAt, now))
  }

  status(): AccessStatus {
    return { global: this.global.status(), endpoints: Object.fromEntries([...this.endpoints].map(([t, b]) => [t, b.status()])) }
  }

  private endpoint(template: string): Breaker {
    let breaker = this.endpoints.get(template)
    if (!breaker) this.endpoints.set(template, (breaker = new Breaker(isPlayerScoped(template) ? PLAYER_ENDPOINT_BREAKER : ENDPOINT_BREAKER)))
    return breaker
  }

  /** One line per transition: the template (ids already replaced), never a URL, query or header. */
  private log(scope: string, breaker: Breaker, change: 'opened' | 'closed' | null) {
    if (change === 'opened') console.warn(`[api] upstream refused access (401/403) on ${scope}; pausing upstream calls for ${breaker.status().cooldownMs / MINUTE} min`)
    if (change === 'closed') console.info(`[api] upstream access restored on ${scope}`)
  }
}
