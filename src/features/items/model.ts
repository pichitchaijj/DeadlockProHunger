import { MIN_EFFECT, type Insight } from '@/lib/analytics/insights'
import { SAMPLE_TIER_LABEL, sampleTier, type SampleTier } from '@/lib/analytics/sampleTier'
import { wilsonInterval, type Interval } from '@/lib/analytics/wilson'
import { formatInteger, formatPercent } from '@/lib/format'
import type { ItemSlot, ItemSort } from './query'

/*
 * Item analytics view-models (pure). Definitions:
 * - Win rate: wins ÷ matches in which the item was bought (95% Wilson interval).
 * - Buy rate ("pick rate"): matches with the item ÷ all player-matches in the same scope (hero-stats Σ matches,
 *   or the hero's matches when a hero is selected), the same rule as Hero Detail's item progression.
 * - Purchase timing: purchases grouped by the minute or phase the item was bought in.
 * Raw item win rates are confounded by wealth and match length; wording stays descriptive.
 */

export type ItemRef = { id: number; slug: string; name: string; slot: string | null; tier: number | null; cost: number | null; icon: string | null }

type Outcome = { wins: number; matches: number; winRate: number; interval: Interval; sample: SampleTier }

const outcome = (wins: number, matches: number): Outcome => ({
  wins,
  matches,
  winRate: matches > 0 ? wins / matches : 0,
  interval: wilsonInterval(wins, matches),
  sample: sampleTier(matches),
})

// ── Directory / totals ───────────────────────────────────────────────

export type ItemRow = ItemRef & Outcome & { buyRate: number | null; avgBuyTimeS: number }

/**
 * One row per shop item with stats in scope. `playerMatches` is the buy-rate denominator; null when it
 * couldn't be loaded (buy rate is then shown as unavailable, never as 0%).
 */
export function itemRows(
  totals: Array<{ item_id: number; wins: number; matches: number; avg_buy_time_s: number }>,
  items: Map<number, ItemRef>,
  playerMatches: number | null,
): ItemRow[] {
  return totals.flatMap((t) => {
    const item = items.get(t.item_id)
    if (!item || t.matches <= 0) return []
    return [{ ...item, ...outcome(t.wins, t.matches), buyRate: playerMatches ? t.matches / playerMatches : null, avgBuyTimeS: t.avg_buy_time_s }]
  })
}

const SORT_VALUE: Record<ItemSort, (r: ItemRow) => number> = {
  buyRate: (r) => r.buyRate ?? r.matches,
  winRate: (r) => r.winRate,
  matches: (r) => r.matches,
  buyTime: (r) => r.avgBuyTimeS,
}

export function filterAndSort(rows: ItemRow[], slot: ItemSlot | 'all', sort: ItemSort, dir: 'asc' | 'desc'): ItemRow[] {
  const sign = dir === 'asc' ? 1 : -1
  return rows
    .filter((r) => slot === 'all' || r.slot === slot)
    .sort((a, b) => sign * (SORT_VALUE[sort](a) - SORT_VALUE[sort](b)) || a.name.localeCompare(b.name))
}

// ── Purchase minute ──────────────────────────────────────────────────

export type MinutePoint = Outcome & { minute: number; /** Share of this item's purchases made in this minute. */ share: number }

/** Outcomes by purchase minute, every minute the source returned (the chart plots only non-Low ones). */
export function minuteSeries(rows: Array<{ minute: number; wins: number; matches: number }>): MinutePoint[] {
  const total = rows.reduce((n, r) => n + r.matches, 0)
  return rows
    .filter((r) => r.matches > 0)
    .sort((a, b) => a.minute - b.minute)
    .map((r) => ({ minute: r.minute, share: total > 0 ? r.matches / total : 0, ...outcome(r.wins, r.matches) }))
}

/** Minutes whose sample is large enough to plot a win rate. */
export const plottable = (points: MinutePoint[]) => points.filter((p) => p.sample !== 'low')

/** First minute by which `share` of all purchases have happened (the last minute if never reached). */
export function minuteAtShare(points: MinutePoint[], share: number): number {
  let cum = 0
  for (const p of points) {
    cum += p.share
    if (cum >= share) return p.minute
  }
  return points.at(-1)?.minute ?? 0
}

/** Minute range that holds the middle `coverage` of purchases (e.g. 0.5 → the 25th–75th percentile minutes). */
export function typicalWindow(points: MinutePoint[], coverage = 0.5): { from: number; to: number } | null {
  if (points.length === 0) return null
  const lo = (1 - coverage) / 2
  const hi = 1 - lo
  let cum = 0
  let from: number | null = null
  for (const p of points) {
    cum += p.share
    if (from === null && cum >= lo) from = p.minute
    if (cum >= hi - 1e-9) return { from: from ?? p.minute, to: p.minute + 1 }
  }
  return { from: from ?? points[0].minute, to: points[points.length - 1].minute + 1 }
}

// ── Purchase phases (item-flow) ──────────────────────────────────────

/** The API's fixed `normal`-mode phases (item-flow-stats columns). */
export const PURCHASE_PHASES = [
  { column: 0, key: 'early', label: 'Early game', range: '0–9 min' },
  { column: 1, key: 'mid', label: 'Mid game', range: '9–20 min' },
  { column: 2, key: 'late', label: 'Late game', range: '20–30 min' },
  { column: 3, key: 'very-late', label: 'Very late', range: '30+ min' },
] as const

export type PhaseRow = (typeof PURCHASE_PHASES)[number] & {
  /** Null when the source returned no node: fewer purchases than its minimum in this phase. */
  stats: (Outcome & { share: number; adjustedWinRate: number }) | null
}

export function purchasePhases(nodes: Array<{ column: number; wins: number; matches: number; adjustedWinRate: number }>): PhaseRow[] {
  const total = nodes.reduce((n, r) => n + r.matches, 0)
  return PURCHASE_PHASES.map((phase) => {
    const node = nodes.find((n) => n.column === phase.column)
    return {
      ...phase,
      stats: node && node.matches > 0 ? { ...outcome(node.wins, node.matches), share: node.matches / total, adjustedWinRate: node.adjustedWinRate } : null,
    }
  })
}

export const STANDOUT_RULE =
  'A phase is named only when it has 200+ purchases, its 95% interval sits entirely above every other phase’s, it leads the next phase by at least 1 point, and it also leads by at least 1 point after the net-worth adjustment.'

export type Standout = { phase: PhaseRow; gap: number; adjustedGap: number }

/**
 * The purchase phase with the highest win rate, only when the data separates it (STANDOUT_RULE).
 * The adjusted check means a lead that disappears once net worth is accounted for isn't reported.
 */
export function standoutPhase(phases: PhaseRow[]): Standout | null {
  const eligible = phases.filter((p): p is PhaseRow & { stats: NonNullable<PhaseRow['stats']> } => p.stats !== null && p.stats.sample !== 'low')
  if (eligible.length < 2) return null
  const [top, ...rest] = [...eligible].sort((a, b) => b.stats.winRate - a.stats.winRate)
  const separated = rest.every((p) => top.stats.interval.low > p.stats.interval.high)
  const gap = top.stats.winRate - rest[0].stats.winRate
  const adjustedGap = top.stats.adjustedWinRate - Math.max(...rest.map((p) => p.stats.adjustedWinRate))
  if (!separated || gap < MIN_EFFECT || adjustedGap < MIN_EFFECT) return null
  return { phase: top, gap, adjustedGap }
}

const points = (delta: number) => `${(delta * 100).toFixed(1)}pp`

/** The standout phase as an Insight (rendered with InsightCard: statement, then "Why?" with metrics and rule). */
export function purchaseTimingInsight(itemName: string, standout: Standout, phases: PhaseRow[], scope: string): Insight {
  const { phase, gap, adjustedGap } = standout
  const stats = phase.stats!
  const smallest = Math.min(...phases.flatMap((p) => (p.stats && p.stats.sample !== 'low' ? [p.stats.matches] : [])))
  const sample = sampleTier(smallest)
  return {
    id: `purchase-timing-${phase.key}`,
    kind: 'purchase-timing',
    tone: 'neutral',
    title: 'Purchase timing',
    value: `${phase.label} (${phase.range})`,
    statement: `${itemName} bought at ${phase.range} has a ${formatPercent(stats.winRate)} win rate: ${points(gap)} higher than the next purchase phase, and ${points(adjustedGap)} higher after the net-worth adjustment.`,
    metrics: phases.flatMap((p) =>
      p.stats ? [{ label: `${p.label} (${p.range})`, value: `${formatPercent(p.stats.winRate)} raw · ${formatPercent(p.stats.adjustedWinRate)} adjusted · ${formatInteger(p.stats.matches)} purchases` }] : [],
    ),
    rule: STANDOUT_RULE,
    context: `${scope} · smallest phase ${formatInteger(smallest)} purchases (${SAMPLE_TIER_LABEL[sample]})`,
    sampleSize: smallest,
    sample,
    caveat: 'Observational: players who buy at different times are in different games (lead, net worth, match length). The adjustment re-weights for net worth only; this is not a causal estimate.',
  }
}

// ── By hero ──────────────────────────────────────────────────────────

export type HeroRef = { id: number; slug: string; name: string; iconUrl: string | null }
export type HeroItemRow = HeroRef & Outcome & { buyRate: number }

/** Heroes whose players buy the item, by buy rate within the hero's matches. Low samples are left out. */
export function heroBreakdown(
  rows: Array<{ heroId: number; wins: number; matches: number }>,
  heroMatches: Map<number, number>,
  heroes: Map<number, HeroRef>,
): HeroItemRow[] {
  return rows
    .flatMap((r) => {
      const hero = heroes.get(r.heroId)
      const played = heroMatches.get(r.heroId)
      if (!hero || !played || r.matches <= 0) return []
      return [{ ...hero, ...outcome(r.wins, r.matches), buyRate: Math.min(1, r.matches / played) }]
    })
    .filter((r) => r.sample !== 'low')
    .sort((a, b) => b.buyRate - a.buyRate)
}
