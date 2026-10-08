/**
 * Scope of a statistic as data: which window and rank band its numbers come from. Never pre-worded:
 * lib/analytics/scopeText.ts words a scope in the reader's language (catalog `scope.*`), so the same
 * value serves every locale and never enters a cache key or request in translated form.
 */

/** The time window. Patch days are unix seconds (UTC day start); `text` is a caller's own wording (features not localized yet). */
export type ScopeWindow = { kind: 'days'; days: number } | { kind: 'patch'; since: number | null } | { kind: 'text'; text: string }

/** A rank tier as the game names it (`name` is API data; null when the rank list doesn't have it). */
export type RankTier = { tier: number; name: string | null }

/** The rank scope: every rank, one band of tiers, every band compared, or a caller's own wording. */
export type ScopeRank = { kind: 'all' } | { kind: 'band'; from: RankTier; to: RankTier } | { kind: 'everyBand' } | { kind: 'text'; text: string }

/** Window and rank, plus the narrowing a page may add: ranked matches only, or one hero's players. */
export type ScopeRef = { window: ScopeWindow; rank: ScopeRank; ranked?: boolean; hero?: string }

/**
 * Display contract for any statistic: where it comes from and how much data is behind it.
 * Components that render statistics require a scope (CLAUDE.md § Analytics principles).
 * `demo` marks mock data and always renders a visible DEMO DATA label.
 */
export type StatScope = ScopeRef & {
  sampleSize?: number // matches behind the number; omit for non-statistical data
  source: 'live' | 'snapshot' | 'demo'
  fetchedAt?: number // unix ms; shown for snapshots
}
