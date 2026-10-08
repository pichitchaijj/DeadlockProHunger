import type { Comparison } from './compare'
import { HEROES_PER_MATCH } from './pickRate'
import { sampleTier, type SampleTier } from './sampleTier'
import { trendBetween, type WinLoss } from './trend'
import { wilsonInterval, type Interval } from './wilson'

/*
 * Insight Engine v1: DATA → INSIGHT (docs/PRODUCT.md § "Why?" explanations).
 *
 * Each generator turns metrics into at most one insight, or null when the data doesn't
 * support it. The contract every insight keeps:
 *  1. Nothing is concluded beyond the metrics: a generator emits only when its rule passes.
 *  2. Traceable: `metrics` lists every number the statement rests on, and `rule` the test it passed.
 *  3. A context note: scope plus the smallest sample behind it, with its tier.
 *  4. Descriptive wording: it says what was measured, never why, and never what to do
 *     (checked by `nonDescriptiveTerms` in tests).
 * Templates are fixed sentences over real numbers; there is no free-form or LLM text.
 *
 * Generators return facts, not sentences: each insight carries its kind's numbers and names, and
 * lib/analytics/insightText.ts words them from the catalog (insights.*) in the reader's language.
 */

/** Smallest gap (1 percentage point) treated as a difference. Huge samples make tiny gaps "significant". */
export const MIN_EFFECT = 0.01
/** A share this many times the baseline counts as "frequently picked" (same as Compare's popularity rule). */
export const POPULARITY_RATIO = 1.5
/** Buy-rate change treated as an unusual item trend. Starting threshold; tune with real distributions. */
export const ITEM_TREND_MIN_SHIFT = 0.03

export type InsightKind =
  | 'rising'
  | 'falling'
  | 'recent-shift'
  | 'strong-matchup'
  | 'weak-matchup'
  | 'strong-synergy'
  | 'popular-build'
  | 'high-performing-build'
  | 'item-trend'
  | 'rank-performance'
  | 'length-performance'
  | 'rank-popularity'
  | 'purchase-timing'

/** A measured win/loss record with its rate (wins ÷ matches) and 95% interval. */
export type Measured = WinLoss & { winRate: number; interval: Interval }
/** A group in a rank or match-length split: `key` names it (length keys short/standard/long), `label` is its data label. */
export type SplitGroup = { key: string; label: string; winRate: number; matches: number; sample: SampleTier }
/** The item-flow purchase phases (features/items/model.ts PURCHASE_PHASES). */
export type PurchasePhaseKey = 'early' | 'mid' | 'late' | 'very-late'
type ItemWeek = { buyers: number; heroMatches: number }

/** What each kind measured: the numbers and names its wording needs, nothing pre-worded. */
export type InsightFacts =
  | { kind: 'rising' | 'falling'; subject: string; current: Measured; previous: Measured; delta: number }
  | { kind: 'recent-shift'; subject: string; patch: string; before: Measured; after: Measured; delta: number; direction: 'rising' | 'falling' }
  | { kind: 'strong-matchup' | 'weak-matchup' | 'strong-synergy'; subject: string; other: string; relation: 'lane' | 'any' | 'ally'; winRate: number; matches: number; interval: Interval }
  | { kind: 'popular-build'; subject: string; build: string; buildMatches: number; buildWinRate: number; share: number; total: number; builds: number }
  | { kind: 'high-performing-build'; subject: string; build: string; buildRecord: Measured; heroWinRate: number }
  | { kind: 'item-trend'; subject: string; item: string; current: ItemWeek & { share: number }; previous: ItemWeek & { share: number }; delta: number }
  | { kind: 'rank-performance' | 'length-performance'; subject: string; best: SplitGroup; worst: SplitGroup; groups: SplitGroup[] }
  | { kind: 'rank-popularity'; subject: string; band: string; pick: number; overall: number; bandHeroMatches: number; bandMatches: number; heroAll: number; matchesAll: number; ratio: number }
  | { kind: 'purchase-timing'; item: string; phase: PurchasePhaseKey; winRate: number; gap: number; adjustedGap: number; phases: Array<{ key: PurchasePhaseKey; winRate: number; adjustedWinRate: number; matches: number }> }

export type Insight = InsightFacts & {
  id: string
  tone: 'positive' | 'negative' | 'neutral'
  /** The scope label the numbers come from (shared scope text, e.g. "Last 30 days, All ranks"). */
  scope: string
  /** Smallest sample behind the insight. */
  sampleSize: number
  sample: SampleTier
}

function make(base: { id: string; tone: Insight['tone'] }, facts: InsightFacts, scope: string, sampleSize: number): Insight {
  return { ...base, ...facts, scope, sampleSize, sample: sampleTier(sampleSize) }
}

const measured = (w: WinLoss): Measured => ({ wins: w.wins, matches: w.matches, winRate: w.wins / w.matches, interval: wilsonInterval(w.wins, w.matches) })
const reliable = (...samples: number[]) => samples.every((n) => sampleTier(n) !== 'low')

// ── Win-rate change over time ────────────────────────────────────────

/** `current` is the last 7 days, `previous` the 7 days before (the only windows Hero Detail compares). */
type ShiftInput = { subject: string; current: WinLoss; previous: WinLoss; scope: string }

/** Rising / falling: two consecutive windows whose 95% intervals don't overlap, with a gap ≥ MIN_EFFECT. */
export function winRateShift({ subject, current, previous, scope }: ShiftInput): Insight | null {
  const trend = trendBetween(current, previous)
  if (!trend || trend.direction === 'stable' || Math.abs(trend.delta) < MIN_EFFECT) return null
  const up = trend.direction === 'rising'
  return make(
    { id: trend.direction, tone: up ? 'positive' : 'negative' },
    { kind: trend.direction, subject, current: measured(current), previous: measured(previous), delta: trend.delta },
    scope,
    Math.min(current.matches, previous.matches),
  )
}

type PatchShiftInput = { subject: string; patch: string; before: WinLoss; after: WinLoss; scope: string }

/** Recent shift: the 7 days after a patch vs the 7 before, same rule as rising/falling. Timing only, never cause. */
export function patchShift({ subject, patch, before, after, scope }: PatchShiftInput): Insight | null {
  const trend = trendBetween(after, before)
  if (!trend || trend.direction === 'stable' || Math.abs(trend.delta) < MIN_EFFECT) return null
  return make(
    { id: 'recent-shift', tone: 'neutral' },
    { kind: 'recent-shift', subject, patch, before: measured(before), after: measured(after), delta: trend.delta, direction: trend.direction },
    scope,
    Math.min(before.matches, after.matches),
  )
}

// ── Pairings ─────────────────────────────────────────────────────────

type PairingInput = { subject: string; other: string; wins: number; matches: number; relation: 'lane' | 'any' | 'ally'; scope: string }

/** Matchup or synergy: the pair's interval excludes 50%, with a gap ≥ MIN_EFFECT and a non-Low sample. */
export function pairing({ subject, other, wins, matches, relation, scope }: PairingInput): Insight | null {
  if (!reliable(matches)) return null
  const wr = wins / matches
  const interval = wilsonInterval(wins, matches)
  const positive = interval.low > 0.5 && wr - 0.5 >= MIN_EFFECT
  const negative = interval.high < 0.5 && 0.5 - wr >= MIN_EFFECT
  if (!positive && !negative) return null
  const facts = { subject, other, relation, winRate: wr, matches, interval }
  if (relation === 'ally') {
    if (!positive) return null
    return make({ id: 'strong-synergy', tone: 'positive' }, { kind: 'strong-synergy', ...facts }, scope, matches)
  }
  return make(
    { id: positive ? 'strong-matchup' : 'weak-matchup', tone: positive ? 'positive' : 'negative' },
    { kind: positive ? 'strong-matchup' : 'weak-matchup', ...facts },
    scope,
    matches,
  )
}

// ── Builds ───────────────────────────────────────────────────────────

type BuildRef = { name: string; wins: number; matches: number }

/** Popular build: the most-selected tracked build, when its sample isn't Low. */
export function popularBuild({ subject, builds, scope }: { subject: string; builds: BuildRef[]; scope: string }): Insight | null {
  const tracked = builds.filter((b) => b.matches > 0)
  const top = [...tracked].sort((a, b) => b.matches - a.matches)[0]
  if (!top || !reliable(top.matches)) return null
  const total = tracked.reduce((n, b) => n + b.matches, 0)
  const share = top.matches / total
  return make(
    { id: 'popular-build', tone: 'neutral' },
    { kind: 'popular-build', subject, build: top.name, buildMatches: top.matches, buildWinRate: top.wins / top.matches, share, total, builds: tracked.length },
    scope,
    top.matches,
  )
}

/** High-performing build: its interval sits entirely above the hero's own win rate, by at least MIN_EFFECT. */
export function highPerformingBuild({ subject, heroWinRate, builds, scope }: { subject: string; heroWinRate: number; builds: BuildRef[]; scope: string }): Insight | null {
  const candidates = builds
    .filter((b) => reliable(b.matches))
    .map((b) => ({ ...b, interval: wilsonInterval(b.wins, b.matches) }))
    .filter((b) => b.interval.low > heroWinRate && b.wins / b.matches - heroWinRate >= MIN_EFFECT)
    .sort((a, b) => b.interval.low - a.interval.low)
  const top = candidates[0]
  if (!top) return null
  return make(
    { id: 'high-performing-build', tone: 'positive' },
    { kind: 'high-performing-build', subject, build: top.name, buildRecord: { wins: top.wins, matches: top.matches, winRate: top.wins / top.matches, interval: top.interval }, heroWinRate },
    scope,
    top.matches,
  )
}

// ── Items ────────────────────────────────────────────────────────────

/** `current` is the last 7 days, `previous` the 7 days before (same windows as winRateShift). */
type ItemTrendInput = { subject: string; items: Array<{ name: string; current: ItemWeek; previous: ItemWeek }>; scope: string }

/** Unusual item trend: the largest buy-rate change whose intervals separate and that moved ≥ ITEM_TREND_MIN_SHIFT. */
export function itemTrend({ subject, items, scope }: ItemTrendInput): Insight | null {
  const shifts = items
    .filter((i) => reliable(i.current.heroMatches, i.previous.heroMatches, i.current.buyers, i.previous.buyers))
    .map((i) => {
      const cur = wilsonInterval(i.current.buyers, i.current.heroMatches)
      const prev = wilsonInterval(i.previous.buyers, i.previous.heroMatches)
      const delta = i.current.buyers / i.current.heroMatches - i.previous.buyers / i.previous.heroMatches
      return { ...i, delta, separate: cur.low > prev.high || cur.high < prev.low }
    })
    .filter((i) => i.separate && Math.abs(i.delta) >= ITEM_TREND_MIN_SHIFT)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  const top = shifts[0]
  if (!top) return null
  const week = (w: ItemWeek) => ({ ...w, share: w.buyers / w.heroMatches })
  return make(
    { id: 'item-trend', tone: 'neutral' },
    { kind: 'item-trend', subject, item: top.name, current: week(top.current), previous: week(top.previous), delta: top.delta },
    scope,
    Math.min(top.current.heroMatches, top.previous.heroMatches),
  )
}

// ── Rank-specific ────────────────────────────────────────────────────

const SPLITS = { rank: 'rank-performance', length: 'length-performance' } as const

/** A split group as a fact; the win rate is wins ÷ matches as recorded (the wording shows it as is). */
const splitGroup = (g: Comparison['groups'][number]): SplitGroup => ({ key: g.key, label: g.label, winRate: g.wins / g.matches, matches: g.matches, sample: g.sample })

/** Rank-specific (or match-length) performance: the highest and lowest groups' intervals don't overlap. */
export function splitPerformance({ subject, by, comparison, scope }: { subject: string; by: keyof typeof SPLITS; comparison: Comparison; scope: string }): Insight | null {
  const { best, worst, clear } = comparison
  if (!clear || !best || !worst || best.winRate - worst.winRate < MIN_EFFECT) return null
  const kind = SPLITS[by]
  return make(
    { id: kind, tone: 'neutral' },
    { kind, subject, best: { ...splitGroup(best), winRate: best.winRate }, worst: { ...splitGroup(worst), winRate: worst.winRate }, groups: comparison.groups.map(splitGroup) },
    scope,
    Math.min(best.matches, worst.matches),
  )
}

type BandPicks = { label: string; heroMatches: number; allHeroMatches: number }

/** "Frequently picked by X players": a band's pick rate ≥ POPULARITY_RATIO × the all-rank rate, intervals separate. */
export function rankPopularity({ subject, bands, scope }: { subject: string; bands: BandPicks[]; scope: string }): Insight | null {
  const heroAll = bands.reduce((n, b) => n + b.heroMatches, 0)
  const matchesAll = bands.reduce((n, b) => n + b.allHeroMatches, 0) / HEROES_PER_MATCH
  if (matchesAll <= 0 || !reliable(heroAll)) return null
  const overall = heroAll / matchesAll
  const overallInterval = wilsonInterval(heroAll, Math.round(matchesAll))
  const top = bands
    .filter((b) => reliable(b.heroMatches) && b.allHeroMatches > 0)
    .map((b) => {
      const matches = Math.round(b.allHeroMatches / HEROES_PER_MATCH)
      return { ...b, matches, pick: b.heroMatches / matches, interval: wilsonInterval(b.heroMatches, matches) }
    })
    .filter((b) => b.pick >= overall * POPULARITY_RATIO && b.interval.low > overallInterval.high)
    .sort((a, b) => b.pick / overall - a.pick / overall)[0]
  if (!top) return null
  return make(
    { id: 'rank-popularity', tone: 'neutral' },
    {
      kind: 'rank-popularity',
      subject,
      band: top.label,
      pick: top.pick,
      overall,
      bandHeroMatches: top.heroMatches,
      bandMatches: top.matches,
      heroAll,
      matchesAll: Math.round(matchesAll),
      ratio: top.pick / overall,
    },
    scope,
    top.heroMatches,
  )
}

// ── Selection and language ───────────────────────────────────────────

const PRIORITY: InsightKind[] = ['rising', 'falling', 'recent-shift', 'rank-popularity', 'rank-performance', 'length-performance', 'high-performing-build', 'strong-matchup', 'weak-matchup', 'item-trend', 'strong-synergy', 'popular-build']

/** Drops nulls and orders by kind, so the first cards answer "what changed?" before "what holds?". */
export function rankInsights(list: Array<Insight | null>): Insight[] {
  return list.filter((i): i is Insight => i !== null).sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind))
}

/** Words that state a cause, a judgment or an instruction. Insight text (English) must contain none of them. */
const NON_DESCRIPTIVE = [/\bbroken\b/i, /\bOP\b/, /\boverpowered\b/i, /\bshould\b/i, /\bmust\b/i, /\bcaus(e|es|ed|ing)\b/i, /\bbecause\b/i, /\bleads? to\b/i, /\bbest\b/i, /\bworst\b/i, /\bstrongest\b/i, /\bweakest\b/i, /\bguarantee/i, /\beveryone\b/i]

/**
 * The non-descriptive terms in an insight's own wording (empty when clean). Quoted names are
 * skipped: a build an author called "Best Haze" is a name, not our claim. Checks the English
 * wording (insightText with the English catalog).
 */
export function nonDescriptiveTerms(insight: { title: string; statement: string }): string[] {
  const text = `${insight.title} ${insight.statement}`.replace(/“[^”]*”/g, '')
  return NON_DESCRIPTIVE.flatMap((re) => text.match(re)?.[0] ?? [])
}
