import { formatInteger, formatPercent, formatPointDelta } from '@/lib/format'
import type { Comparison } from './compare'
import { HEROES_PER_MATCH } from './pickRate'
import { SAMPLE_TIER_LABEL, sampleTier, type SampleTier } from './sampleTier'
import { trendBetween, type WinLoss } from './trend'
import { wilsonInterval } from './wilson'

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

export type InsightMetric = { label: string; value: string }

export type Insight = {
  id: string
  kind: InsightKind
  tone: 'positive' | 'negative' | 'neutral'
  /** Short eyebrow, e.g. "Rising". */
  title: string
  /** The headline value, e.g. "+2.4pp" or "vs Haze". */
  value: string
  /** One descriptive sentence over the metrics. */
  statement: string
  /** The numbers the statement rests on (shown by "Why?"). */
  metrics: InsightMetric[]
  /** The rule this insight passed, in plain words. */
  rule: string
  /** Scope and sample note, e.g. "Last 30 days, All ranks · 12,400 matches (High sample)". */
  context: string
  /** Smallest sample behind the insight. */
  sampleSize: number
  sample: SampleTier
  /** Extra caveat, e.g. that a before/after comparison is timing only. */
  caveat?: string
}

type Base = Pick<Insight, 'id' | 'kind' | 'tone' | 'title' | 'value' | 'statement' | 'metrics' | 'rule' | 'caveat'>

function make(base: Base, scope: string, sampleSize: number): Insight {
  const sample = sampleTier(sampleSize)
  return { ...base, context: `${scope} · ${formatInteger(sampleSize)} matches (${SAMPLE_TIER_LABEL[sample]})`, sampleSize, sample }
}

const rate = (w: WinLoss) => w.wins / w.matches
const describe = (w: WinLoss) => `${formatPercent(rate(w))} of ${formatInteger(w.matches)}`
const range = (w: WinLoss) => {
  const i = wilsonInterval(w.wins, w.matches)
  return `${formatPercent(i.low)}–${formatPercent(i.high)}`
}
const percentagePoints = (delta: number) => `${Math.abs(delta * 100).toFixed(1)} percentage points`
const reliable = (...samples: number[]) => samples.every((n) => sampleTier(n) !== 'low')

// ── Win-rate change over time ────────────────────────────────────────

type ShiftInput = { subject: string; current: WinLoss; previous: WinLoss; currentLabel: string; previousLabel: string; scope: string }

/** Rising / falling: two consecutive windows whose 95% intervals don't overlap, with a gap ≥ MIN_EFFECT. */
export function winRateShift({ subject, current, previous, currentLabel, previousLabel, scope }: ShiftInput): Insight | null {
  const trend = trendBetween(current, previous)
  if (!trend || trend.direction === 'stable' || Math.abs(trend.delta) < MIN_EFFECT) return null
  const up = trend.direction === 'rising'
  return make(
    {
      id: trend.direction,
      kind: trend.direction,
      tone: up ? 'positive' : 'negative',
      title: up ? 'Rising' : 'Falling',
      value: formatPointDelta(trend.delta),
      statement: `${subject}’s win rate ${up ? 'increased' : 'decreased'} ${percentagePoints(trend.delta)}, from ${formatPercent(rate(previous))} in ${previousLabel.toLowerCase()} to ${formatPercent(rate(current))} in ${currentLabel.toLowerCase()}.`,
      metrics: [
        { label: currentLabel, value: `${describe(current)} matches won (95% interval ${range(current)})` },
        { label: previousLabel, value: `${describe(previous)} matches won (95% interval ${range(previous)})` },
        { label: 'Change', value: formatPointDelta(trend.delta) },
      ],
      rule: 'Both windows have at least 200 matches, their 95% intervals don’t overlap, and the change is at least 1 percentage point.',
    },
    scope,
    Math.min(current.matches, previous.matches),
  )
}

type PatchShiftInput = { subject: string; patch: string; before: WinLoss; after: WinLoss; scope: string }

/** Recent shift: the 7 days after a patch vs the 7 before, same rule as rising/falling. Timing only, never cause. */
export function patchShift({ subject, patch, before, after, scope }: PatchShiftInput): Insight | null {
  const trend = trendBetween(after, before)
  if (!trend || trend.direction === 'stable' || Math.abs(trend.delta) < MIN_EFFECT) return null
  const up = trend.direction === 'rising'
  return make(
    {
      id: 'recent-shift',
      kind: 'recent-shift',
      tone: 'neutral',
      title: 'Recent shift',
      value: formatPointDelta(trend.delta),
      statement: `${subject}’s win rate was ${percentagePoints(trend.delta)} ${up ? 'higher' : 'lower'} in the days after the “${patch}” update (${formatPercent(rate(after))}) than in the 7 days before (${formatPercent(rate(before))}).`,
      metrics: [
        { label: 'After the patch', value: `${describe(after)} matches won (95% interval ${range(after)})` },
        { label: '7 days before', value: `${describe(before)} matches won (95% interval ${range(before)})` },
      ],
      rule: 'Both periods have at least 200 matches, their 95% intervals don’t overlap, and the change is at least 1 percentage point.',
      caveat: 'This shows timing only. Other changes in the same days (player mix, other heroes) can move a win rate too.',
    },
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
  const games = relation === 'lane' ? 'lane matchups' : 'matches'
  const metrics = [
    { label: relation === 'ally' ? `With ${other}` : `Against ${other}`, value: `${formatPercent(wr)} won over ${formatInteger(matches)} ${games}` },
    { label: '95% interval', value: `${formatPercent(interval.low)}–${formatPercent(interval.high)}` },
  ]
  const rule = `At least 200 ${games}, a 95% interval entirely ${positive ? 'above' : 'below'} 50%, and a gap of at least 1 percentage point.`
  if (relation === 'ally') {
    if (!positive) return null
    return make(
      { id: 'strong-synergy', kind: 'strong-synergy', tone: 'positive', title: 'Positive pairing', value: other, statement: `${subject} won ${formatPercent(wr)} of ${formatInteger(matches)} matches with ${other} on the same team in the selected dataset.`, metrics, rule },
      scope,
      matches,
    )
  }
  const where = relation === 'lane' ? ' in lane' : ''
  return make(
    {
      id: positive ? 'strong-matchup' : 'weak-matchup',
      kind: positive ? 'strong-matchup' : 'weak-matchup',
      tone: positive ? 'positive' : 'negative',
      title: positive ? 'Positive matchup' : 'Negative matchup',
      value: `vs ${other}`,
      statement: `Shows a ${positive ? 'positive' : 'negative'} matchup against ${other}${where} in the selected dataset: ${formatPercent(wr)} won over ${formatInteger(matches)} ${games}.`,
      metrics,
      rule,
    },
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
    {
      id: 'popular-build',
      kind: 'popular-build',
      tone: 'neutral',
      title: 'Most-selected build',
      value: top.name,
      statement: `“${top.name}” was selected at game start in ${formatInteger(top.matches)} ${subject} matches, ${formatPercent(share)} of matches using a tracked build.`,
      metrics: [
        { label: 'Matches with this build', value: formatInteger(top.matches) },
        { label: 'Matches with any tracked build', value: `${formatInteger(total)} (${tracked.length} builds)` },
        { label: 'Its win rate', value: `${describe(top)} matches won` },
      ],
      rule: 'The tracked build selected in the most matches, with at least 200 of them.',
      caveat: 'Tracked builds are the most-favorited published builds; matches using other builds aren’t counted.',
    },
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
    {
      id: 'high-performing-build',
      kind: 'high-performing-build',
      tone: 'positive',
      title: 'High-performing build',
      value: top.name,
      statement: `Matches where “${top.name}” was selected were won ${formatPercent(top.wins / top.matches)} of the time, above ${subject}’s ${formatPercent(heroWinRate)} overall.`,
      metrics: [
        { label: 'With this build', value: `${describe(top)} matches won (95% interval ${formatPercent(top.interval.low)}–${formatPercent(top.interval.high)})` },
        { label: `${subject} overall`, value: formatPercent(heroWinRate) },
      ],
      rule: 'At least 200 matches, and the build’s 95% interval sits entirely above the hero’s win rate by at least 1 percentage point.',
      caveat: 'Players choose their build, so this compares groups of matches; it doesn’t isolate the build’s effect.',
    },
    scope,
    top.matches,
  )
}

// ── Items ────────────────────────────────────────────────────────────

type ItemWeek = { buyers: number; heroMatches: number }
type ItemTrendInput = { subject: string; items: Array<{ name: string; current: ItemWeek; previous: ItemWeek }>; currentLabel: string; previousLabel: string; scope: string }

/** Unusual item trend: the largest buy-rate change whose intervals separate and that moved ≥ ITEM_TREND_MIN_SHIFT. */
export function itemTrend({ subject, items, currentLabel, previousLabel, scope }: ItemTrendInput): Insight | null {
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
  const up = top.delta > 0
  const share = (w: ItemWeek) => formatPercent(w.buyers / w.heroMatches)
  return make(
    {
      id: 'item-trend',
      kind: 'item-trend',
      tone: 'neutral',
      title: up ? 'Item bought more' : 'Item bought less',
      value: top.name,
      statement: `${top.name} was bought in ${share(top.current)} of ${subject} matches in ${currentLabel.toLowerCase()}, ${up ? 'up' : 'down'} from ${share(top.previous)} in ${previousLabel.toLowerCase()}.`,
      metrics: [
        { label: currentLabel, value: `${formatInteger(top.current.buyers)} of ${formatInteger(top.current.heroMatches)} matches` },
        { label: previousLabel, value: `${formatInteger(top.previous.buyers)} of ${formatInteger(top.previous.heroMatches)} matches` },
        { label: 'Change', value: formatPointDelta(top.delta) },
      ],
      rule: 'Both windows have at least 200 hero matches and 200 buyers, the buy-rate 95% intervals don’t overlap, and the change is at least 3 percentage points.',
    },
    scope,
    Math.min(top.current.heroMatches, top.previous.heroMatches),
  )
}

// ── Rank-specific ────────────────────────────────────────────────────

const SPLITS = {
  rank: { kind: 'rank-performance', title: 'By rank', groups: 'Rank bands', in: (l: string) => l, caveat: 'Only matches with an average rank are counted.' },
  length: { kind: 'length-performance', title: 'By match length', groups: 'Match-length groups', in: (l: string) => l.toLowerCase(), caveat: undefined },
} as const

/** Rank-specific (or match-length) performance: the highest and lowest groups' intervals don't overlap. */
export function splitPerformance({ subject, by, comparison, scope }: { subject: string; by: keyof typeof SPLITS; comparison: Comparison; scope: string }): Insight | null {
  const { best, worst, clear } = comparison
  if (!clear || !best || !worst || best.winRate - worst.winRate < MIN_EFFECT) return null
  const split = SPLITS[by]
  return make(
    {
      id: split.kind,
      kind: split.kind,
      tone: 'neutral',
      title: split.title,
      value: best.label,
      statement: `${subject}’s win rate is highest in ${split.in(best.label)} (${formatPercent(best.winRate)}) and lowest in ${split.in(worst.label)} (${formatPercent(worst.winRate)}).`,
      metrics: comparison.groups.map((g) => ({ label: g.label, value: `${describe(g)} matches won${g.sample === 'low' ? ' (Low sample, not compared)' : ''}` })),
      rule: `${split.groups} with at least 200 matches; the highest group’s 95% interval sits entirely above the lowest group’s.`,
      caveat: split.caveat,
    },
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
    {
      id: 'rank-popularity',
      kind: 'rank-popularity',
      tone: 'neutral',
      title: 'Pick rate by rank',
      value: top.label,
      statement: `Frequently picked by ${top.label} players: in ${formatPercent(top.pick)} of ${top.label} matches, vs ${formatPercent(overall)} across all ranks.`,
      metrics: [
        { label: `${top.label} pick rate`, value: `${formatInteger(top.heroMatches)} of ~${formatInteger(top.matches)} matches` },
        { label: 'All ranks', value: `${formatInteger(heroAll)} of ~${formatInteger(Math.round(matchesAll))} matches` },
        { label: 'Ratio', value: `${(top.pick / overall).toFixed(1)}×` },
      ],
      rule: 'At least 200 matches in the band, a pick rate at least 1.5× the all-rank rate, and non-overlapping 95% intervals. Match counts are estimated as hero picks ÷ 12.',
      caveat: `${subject} is popular there; popularity alone says nothing about results.`,
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

/** Words that state a cause, a judgment or an instruction. Insight text must contain none of them. */
const NON_DESCRIPTIVE = [/\bbroken\b/i, /\bOP\b/, /\boverpowered\b/i, /\bshould\b/i, /\bmust\b/i, /\bcaus(e|es|ed|ing)\b/i, /\bbecause\b/i, /\bleads? to\b/i, /\bbest\b/i, /\bworst\b/i, /\bstrongest\b/i, /\bweakest\b/i, /\bguarantee/i, /\beveryone\b/i]

/**
 * The non-descriptive terms in an insight's own wording (empty when clean). Quoted names are
 * skipped: a build an author called "Best Haze" is a name, not our claim.
 */
export function nonDescriptiveTerms(insight: Pick<Insight, 'statement' | 'title'>): string[] {
  const text = `${insight.title} ${insight.statement}`.replace(/“[^”]*”/g, '')
  return NON_DESCRIPTIVE.flatMap((re) => text.match(re)?.[0] ?? [])
}
