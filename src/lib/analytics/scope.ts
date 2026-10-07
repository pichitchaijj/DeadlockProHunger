/**
 * Display contract for any statistic: where it comes from and how much data is behind it.
 * Components that render statistics require a scope (CLAUDE.md § Analytics principles).
 * `demo` marks mock data and always renders a visible DEMO DATA label.
 */
export type StatScope = {
  windowLabel: string // e.g. "Last 7 days", "Patch 10-05"
  rankLabel: string // e.g. "All ranks", "Oracle+"
  sampleSize?: number // matches behind the number; omit for non-statistical data
  source: 'live' | 'snapshot' | 'demo'
  fetchedAt?: number // unix ms; shown for snapshots
}
