/** Next data cache lifetimes in seconds (docs/ARCHITECTURE.md § Cache strategy). */
export const TTL = {
  assets: 24 * 60 * 60,
  /** Matches the upstream analytics cache (6h). */
  analytics: 6 * 60 * 60,
  /**
   * hero-build-stats, ability-order-stats, item-flow-stats, item-stats: the costly analytics. Their keys roll over
   * daily (EXPENSIVE_KEY_STEP, lib/deadlock/expensive.ts), so an entry lives exactly as long as its key is used.
   */
  expensiveAnalytics: 24 * 60 * 60,
  /** Rank distribution changes slowly. */
  distribution: 24 * 60 * 60,
  patches: 60 * 60,
  /** Bulk match metadata: 30 req/min per IP upstream. */
  matches: 10 * 60,
  builds: 60 * 60,
} as const
