import { sampleTier, type SampleTier } from '@/lib/analytics/sampleTier'
import { wilsonInterval, type Interval } from '@/lib/analytics/wilson'
import type { ShopItemRef } from '@/features/hero/model'

/*
 * Pure Builds model. Wording rules (product requirement):
 *  - "best-performing" only when the build's interval is above every other tracked build's for the hero;
 *  - otherwise "high-performing", "popular", "frequently used" or "high-confidence", each with a data rule.
 */

export type BuildStats = { wins: number; matches: number; winRate: number; interval: Interval; sample: SampleTier }

export function scoreBuild(wins: number, matches: number): BuildStats {
  return { wins, matches, winRate: wins / matches, interval: wilsonInterval(wins, matches), sample: sampleTier(matches) }
}

export type BuildLabel = 'best-performing' | 'high-performing' | 'frequently-used' | 'popular' | 'high-confidence'

export const LABEL_TEXT: Record<BuildLabel, { text: string; rule: string }> = {
  'best-performing': { text: 'Best-performing tracked', rule: 'Win-rate interval above every other tracked build for this hero' },
  'high-performing': { text: 'High-performing', rule: 'Win-rate interval entirely above the hero’s own win rate' },
  'frequently-used': { text: 'Frequently used', rule: 'Among the 3 most-selected tracked builds for this hero' },
  popular: { text: 'Popular', rule: 'Among the 10 most-favorited builds this week' },
  'high-confidence': { text: 'High-confidence', rule: 'More than 1,000 tracked matches' },
}

export type LabelContext = {
  stats: BuildStats | null
  heroWinRate: number | null
  /** Every tracked build for the same hero and scope, including this one. */
  heroBuildStats: Array<{ id: number; stats: BuildStats }>
  buildId: number
  /** 1-based rank by weekly favorites within the list it came from; null if unknown. */
  favoritesRank: number | null
}

export function labelsFor({ stats, heroWinRate, heroBuildStats, buildId, favoritesRank }: LabelContext): BuildLabel[] {
  const labels: BuildLabel[] = []
  if (stats && stats.sample !== 'low') {
    const others = heroBuildStats.filter((b) => b.id !== buildId && b.stats.sample !== 'low')
    const highPerforming = heroWinRate !== null && stats.interval.low > heroWinRate
    if (highPerforming && others.length > 0 && others.every((o) => stats.interval.low > o.stats.interval.high)) labels.push('best-performing')
    else if (highPerforming) labels.push('high-performing')
    const byUse = [...heroBuildStats].sort((a, b) => b.stats.matches - a.stats.matches)
    if (byUse.findIndex((b) => b.id === buildId) < 3) labels.push('frequently-used')
    if (stats.sample === 'high') labels.push('high-confidence')
  }
  if (favoritesRank !== null && favoritesRank <= 10) labels.push('popular')
  return labels
}

/** Meta ranking: tracked builds with 200+ matches, by how far the interval's low end sits above the hero's win rate. */
export function metaOrder<T extends { stats: BuildStats | null; heroWinRate: number | null }>(rows: T[]): T[] {
  return rows
    .filter((r) => r.stats && r.stats.sample !== 'low' && r.heroWinRate !== null)
    .sort((a, b) => b.stats!.interval.low - b.heroWinRate! - (a.stats!.interval.low - a.heroWinRate!))
}

export type PatchStatus = 'current' | 'older' | null

/** Whether the build was last updated on or after the current patch date. */
export function patchStatus(updatedAtMs: number | null, patchStartMs: number | null): PatchStatus {
  if (updatedAtMs === null || patchStartMs === null) return null
  return updatedAtMs >= patchStartMs ? 'current' : 'older'
}

// ── Ability plan ─────────────────────────────────────────────────────

export type PlanStep = { abilityId: number; kind: 'unlock' | 'upgrade'; level: number }

/**
 * Author's ability plan from `ability_order.currency_changes`. Read from the data structure:
 * type 2 occurs once per ability (unlock); type 1 spends 1/2/5 points (upgrades 1–3).
 * Repeated entries (seen in some builds) are dropped: one unlock and at most 3 upgrades per ability.
 */
export function abilityPlan(changes: Array<{ ability_id: number; currency_type: number }>, heroAbilities: Set<number>): PlanStep[] {
  const unlocked = new Set<number>()
  const upgrades = new Map<number, number>()
  const steps: PlanStep[] = []
  for (const c of changes) {
    if (!heroAbilities.has(c.ability_id)) continue
    if (c.currency_type === 2 && !unlocked.has(c.ability_id)) {
      unlocked.add(c.ability_id)
      steps.push({ abilityId: c.ability_id, kind: 'unlock', level: 0 })
    } else if (c.currency_type === 1) {
      const level = (upgrades.get(c.ability_id) ?? 0) + 1
      if (level > 3) continue
      upgrades.set(c.ability_id, level)
      steps.push({ abilityId: c.ability_id, kind: 'upgrade', level })
    }
  }
  return steps
}

// ── Item timing and flow ─────────────────────────────────────────────

export const BUILD_PHASES = [
  { key: 'early', label: 'Early', note: 'bought before 10 min on average', until: 600 },
  { key: 'core', label: 'Core', note: '10–25 min', until: 1_500 },
  { key: 'late', label: 'Late', note: 'after 25 min', until: Infinity },
] as const

export type TimedItem = ShopItemRef & { avgBuyTimeS: number | null; buyRate: number | null }

/**
 * Splits the build's items into Early / Core / Late by this hero's observed average buy time.
 * Items without enough purchase data go to `untimed` rather than being guessed.
 */
export function phaseItems(items: ShopItemRef[], itemStats: Array<{ item_id: number; matches: number; avg_buy_time_s: number }>, heroMatches: number) {
  const byId = new Map(itemStats.map((r) => [r.item_id, r]))
  const timed: TimedItem[] = items.map((item) => {
    const row = byId.get(item.id)
    return { ...item, avgBuyTimeS: row?.avg_buy_time_s ?? null, buyRate: row && heroMatches > 0 ? row.matches / heroMatches : null }
  })
  let from = 0
  const phases = BUILD_PHASES.map((phase) => {
    const inPhase = timed
      .filter((i) => i.avgBuyTimeS !== null && i.avgBuyTimeS >= from && i.avgBuyTimeS < phase.until)
      .sort((a, b) => a.avgBuyTimeS! - b.avgBuyTimeS!)
    from = phase.until
    return { ...phase, items: inPhase }
  })
  return { phases, untimed: timed.filter((i) => i.avgBuyTimeS === null) }
}

export const FLOW_COLUMN_LABELS = ['0–10 min', '10–20 min', '20–30 min', '30+ min']

export type FlowItem = ShopItemRef & { column: number; adjustedWinRate: number; matches: number }

/**
 * Item flow for the build's items: the phase column each item is most often bought in, its
 * wealth-adjusted win rate (upstream re-weights by net worth at purchase; still observational),
 * and the most common transitions between items of this build.
 */
export function flowForBuild(
  itemIds: number[],
  flow: { nodes: Array<{ column: number; item_id: number; matches: number; adjusted_win_rate: number }>; edges: Array<{ from_item_id: number; to_item_id: number; matches: number }>; baseline: { wins: number; matches: number } },
  shop: Map<number, ShopItemRef>,
) {
  const inBuild = new Set(itemIds)
  const byItem = new Map<number, FlowItem>()
  for (const node of flow.nodes) {
    if (!inBuild.has(node.item_id) || !shop.has(node.item_id)) continue
    const current = byItem.get(node.item_id)
    if (!current || node.matches > current.matches) {
      byItem.set(node.item_id, { ...shop.get(node.item_id)!, column: node.column, adjustedWinRate: node.adjusted_win_rate, matches: node.matches })
    }
  }
  const transitions = flow.edges
    .filter((e) => inBuild.has(e.from_item_id) && inBuild.has(e.to_item_id) && shop.has(e.from_item_id) && shop.has(e.to_item_id))
    .sort((a, b) => b.matches - a.matches)
    .slice(0, 5)
    .map((e) => ({ from: shop.get(e.from_item_id)!, to: shop.get(e.to_item_id)!, matches: e.matches }))
  return {
    items: [...byItem.values()].sort((a, b) => a.column - b.column || b.matches - a.matches),
    transitions,
    baselineWinRate: flow.baseline.matches > 0 ? flow.baseline.wins / flow.baseline.matches : null,
  }
}

// ── Why this build? ──────────────────────────────────────────────────

/**
 * One measured fact about the build, as data: the Build page words it in the active locale
 * (builds.why). `comparison` is the interval rule: 'low' = too few matches to compare, 'above' /
 * 'below' = the 95% interval is entirely above / below the hero's win rate, 'overlap' = it includes it.
 */
export type BuildFact =
  | { kind: 'popularity'; favorites: number; rank: number | null; of: number }
  | { kind: 'no-matches' }
  | { kind: 'sample'; matches: number; sample: SampleTier; tracked: number }
  | { kind: 'win-rate'; winRate: number; heroWinRate: number; interval: Interval; comparison: 'low' | 'above' | 'below' | 'overlap' }
  | { kind: 'timing'; timed: number; total: number; core: number; last: TimedItem }
  | { kind: 'flow'; above: number; total: number; baseline: number }

type WhyInput = {
  stats: BuildStats | null
  heroWinRate: number | null
  trackedCount: number
  weeklyFavorites: number | null
  favoritesRank: number | null
  favoritesOf: number
  phases: ReturnType<typeof phaseItems>
  flow: ReturnType<typeof flowForBuild> | null
}

/** Facts supporting (or not) this build. Every fact is a measured number; none is a recommendation. */
export function buildWhyFacts(input: WhyInput): BuildFact[] {
  const facts: BuildFact[] = []
  if (input.weeklyFavorites) facts.push({ kind: 'popularity', favorites: input.weeklyFavorites, rank: input.favoritesRank, of: input.favoritesOf })

  const s = input.stats
  if (!s) {
    facts.push({ kind: 'no-matches' })
  } else {
    facts.push({ kind: 'sample', matches: s.matches, sample: s.sample, tracked: input.trackedCount })
    if (input.heroWinRate !== null) {
      const comparison =
        s.sample === 'low' ? 'low' : s.interval.low > input.heroWinRate ? 'above' : s.interval.high < input.heroWinRate ? 'below' : 'overlap'
      facts.push({ kind: 'win-rate', winRate: s.winRate, heroWinRate: input.heroWinRate, interval: s.interval, comparison })
    }
  }

  const core = input.phases.phases.find((p) => p.key === 'core')?.items ?? []
  const timedCount = input.phases.phases.reduce((n, p) => n + p.items.length, 0)
  if (timedCount > 0) {
    const last = input.phases.phases.flatMap((p) => p.items).at(-1)!
    facts.push({ kind: 'timing', timed: timedCount, total: timedCount + input.phases.untimed.length, core: core.length, last })
  }

  if (input.flow && input.flow.items.length > 0 && input.flow.baselineWinRate !== null) {
    const above = input.flow.items.filter((i) => i.adjustedWinRate > input.flow!.baselineWinRate!).length
    facts.push({ kind: 'flow', above, total: input.flow.items.length, baseline: input.flow.baselineWinRate })
  }
  return facts
}
