import type { Interval } from '@/lib/analytics/wilson'

/*
 * Comparison rules. A difference is only stated when the data separates the two sides:
 * win rates need non-overlapping 95% intervals (and neither side Low sample); other
 * measured quantities need a stated, large gap. Wording describes what was measured
 * ("higher win rate in matches under 25 min"), never an interpretation ("better early game").
 *
 * Differences are facts (which side, which measure, the numbers); `differenceText` words them from
 * the catalog (compare.differences), so hero, build, rank and player names and every number stay data.
 */

export type Side = 'a' | 'b'
export type Rate = { winRate: number; interval: Interval; matches: number; sample: 'low' | 'moderate' | 'high' }

/** Which side is clearly higher, or null when the intervals overlap or either sample is low. */
export function clearlyHigher(a: Rate | null | undefined, b: Rate | null | undefined): Side | null {
  if (!a || !b || a.sample === 'low' || b.sample === 'low' || a.matches === 0 || b.matches === 0) return null
  if (a.interval.low > b.interval.high) return 'a'
  if (b.interval.low > a.interval.high) return 'b'
  return null
}

/** Paired groups: match length (keyed short/standard/long), rank band (label = rank names), shared hero (label = hero name). */
export type GroupKind = 'length' | 'rank' | 'hero'
export type Group = { key: string; label: string; a: Rate | null; b: Rate | null }

/** Where a win rate was measured: all matches, overall / ranked (players), or one group. */
export type WinRateContext = { kind: 'all' } | { kind: 'overall' } | { kind: 'ranked' } | { kind: GroupKind; key: string; label: string }

type Figures = { winRate: number; matches: number }

export type Difference = { side: Side } & (
  | { kind: 'winRate'; context: WinRateContext; higher: Figures; lower: Figures }
  | { kind: 'winRateGroups'; group: GroupKind; count: number; of: number; items: Array<{ key: string; label: string; higher: number; lower: number }> }
  | { kind: 'ratio'; measure: 'pickRate' | 'favorites'; higher: number; lower: number }
  | { kind: 'rising' }
  | { kind: 'lane'; heroA: string; heroB: string; opponent: string; winRate: number; matches: number }
  | { kind: 'aboveHero'; hero: string; winRate: number; heroWinRate: number }
  | { kind: 'rank'; higher: string; lower: string }
)

/** Win-rate difference for one context, or null when not clearly different. */
export function rateDifference(context: WinRateContext, a: Rate | null | undefined, b: Rate | null | undefined): Difference | null {
  const winner = clearlyHigher(a, b)
  if (!winner) return null
  const [w, l] = winner === 'a' ? [a!, b!] : [b!, a!]
  return { side: winner, kind: 'winRate', context, higher: { winRate: w.winRate, matches: w.matches }, lower: { winRate: l.winRate, matches: l.matches } }
}

/** A plain quantity difference (pick rate, popularity) when one side is at least `ratio`× the other. */
export function ratioDifference(measure: 'pickRate' | 'favorites', a: number, b: number, ratio = 1.5): Difference | null {
  if (a <= 0 && b <= 0) return null
  if (a >= b * ratio) return { side: 'a', kind: 'ratio', measure, higher: a, lower: b }
  if (b >= a * ratio) return { side: 'b', kind: 'ratio', measure, higher: b, lower: a }
  return null
}

/**
 * Paired groups (match length, rank bands, shared heroes): at most one statement per side, so the panel
 * stays short. One separated group keeps its own wording; several merge into "in 2 of 3 match lengths"
 * (counted over groups with data on both sides), with each group's numbers in the detail.
 */
export function groupDifferences(groups: Group[], group: GroupKind): Difference[] {
  const compared = groups.filter((g) => g.a && g.b && g.a.matches > 0 && g.b.matches > 0)
  const found = groups.flatMap((g) => {
    const d = rateDifference({ kind: group, key: g.key, label: g.label }, g.a, g.b)
    return d?.kind === 'winRate' ? [{ ...d, key: g.key, label: g.label }] : []
  })
  return (['a', 'b'] as const).flatMap((side): Difference[] => {
    const mine = found.filter((d) => d.side === side)
    if (mine.length === 0) return []
    if (mine.length === 1) return [{ side, kind: 'winRate', context: mine[0].context, higher: mine[0].higher, lower: mine[0].lower }]
    return [{ side, kind: 'winRateGroups', group, count: mine.length, of: compared.length, items: mine.map((d) => ({ key: d.key, label: d.label, higher: d.higher.winRate, lower: d.lower.winRate })) }]
  })
}

export function byLabel(values: Array<Difference | null>): Difference[] {
  return values.filter((d): d is Difference => d !== null)
}

// ── Wording ──────────────────────────────────────────────────────────

type Translate = (key: string, values?: Record<string, string | number>) => string

export type DifferenceFormat = {
  percent: (v: number) => string
  integer: (v: number) => string
  compact: (v: number) => string
  /** A group's display label: length keys are translated; rank-band and hero labels are data. */
  groupLabel: (group: GroupKind, key: string, label: string) => string
}

/** Title and detail for one difference. `t` reads compare.differences. */
export function differenceText(d: Difference, t: Translate, f: DifferenceFormat): { text: string; detail: string } {
  const versus = (higher: string, lower: string) => t('versus', { higher, lower })
  switch (d.kind) {
    case 'winRate': {
      const c = d.context
      const context = c.kind === 'all' ? null : c.kind === 'overall' || c.kind === 'ranked' ? t(`context.${c.kind}`) : c.kind === 'length' ? t(`context.length.${c.key}`) : t(`context.${c.kind}`, { label: c.label })
      return {
        text: context === null ? t('winRate') : t('winRateIn', { context }),
        detail: t('winRateDetail', { higher: f.percent(d.higher.winRate), lower: f.percent(d.lower.winRate), nHigher: f.integer(d.higher.matches), nLower: f.integer(d.lower.matches) }),
      }
    }
    case 'winRateGroups':
      return {
        text: t(d.count === d.of ? 'groupsAll' : 'groupsSome', { count: d.count, of: d.of, group: d.group }),
        detail: t('groupsDetail', { items: d.items.map((i) => t('groupItem', { label: f.groupLabel(d.group, i.key, i.label), values: versus(f.percent(i.higher), f.percent(i.lower)) })).join(' · ') }),
      }
    case 'ratio': {
      const format = d.measure === 'pickRate' ? f.percent : f.compact
      return { text: t(`ratio.${d.measure}`), detail: versus(format(d.higher), format(d.lower)) }
    }
    case 'rising':
      return { text: t('rising'), detail: t('risingDetail') }
    case 'lane':
      return { text: t('lane', { hero: d.opponent }), detail: t('laneDetail', { heroA: d.heroA, heroB: d.heroB, rate: f.percent(d.winRate), count: f.integer(d.matches) }) }
    case 'aboveHero':
      return { text: t('aboveHero'), detail: t('aboveHeroDetail', { rate: f.percent(d.winRate), hero: d.hero, heroRate: f.percent(d.heroWinRate) }) }
    case 'rank':
      return { text: t('rank'), detail: versus(d.higher, d.lower) }
  }
}
