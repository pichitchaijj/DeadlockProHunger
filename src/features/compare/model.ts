import type { Interval } from '@/lib/analytics/wilson'
import { formatPercent } from '@/lib/format'

/*
 * Comparison rules. A difference is only stated when the data separates the two sides:
 * win rates need non-overlapping 95% intervals (and neither side Low sample); other
 * measured quantities need a stated, large gap. Wording describes what was measured
 * ("higher win rate in matches under 25 min"), never an interpretation ("better early game").
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

export type Difference = { side: Side; text: string; detail: string }

/** Win-rate difference statement for one context, or null when not clearly different. */
export function rateDifference(context: string, a: Rate | null | undefined, b: Rate | null | undefined): Difference | null {
  const winner = clearlyHigher(a, b)
  if (!winner) return null
  const [w, l] = winner === 'a' ? [a!, b!] : [b!, a!]
  return {
    side: winner,
    text: `Higher win rate${context ? ` ${context}` : ''}`,
    detail: `${formatPercent(w.winRate)} vs ${formatPercent(l.winRate)} (intervals don’t overlap; n = ${w.matches.toLocaleString('en-US')} vs ${l.matches.toLocaleString('en-US')})`,
  }
}

/** A plain quantity difference (pick rate, popularity) when one side is at least `ratio`× the other. */
export function ratioDifference(text: string, a: number, b: number, format: (v: number) => string, ratio = 1.5): Difference | null {
  if (a <= 0 && b <= 0) return null
  if (a >= b * ratio) return { side: 'a', text, detail: `${format(a)} vs ${format(b)}` }
  if (b >= a * ratio) return { side: 'b', text, detail: `${format(b)} vs ${format(a)}` }
  return null
}

/**
 * Paired groups (match length, rank bands): at most one statement per side, so the panel stays short.
 * One separated group keeps its own wording; several merge into "in 2 of 3 match lengths"
 * (counted over groups with data on both sides), with each group's numbers in the detail.
 */
export function groupDifferences(
  groups: Array<{ key: string; label: string; a: Rate | null; b: Rate | null }>,
  phrase: (label: string) => string,
  unit: string,
): Difference[] {
  const compared = groups.filter((g) => g.a && g.b && g.a.matches > 0 && g.b.matches > 0)
  const found = groups.flatMap((g) => {
    const d = rateDifference(phrase(g.label), g.a, g.b)
    return d ? [{ ...d, label: g.label }] : []
  })
  return (['a', 'b'] as const).flatMap((side): Difference[] => {
    const mine = found.filter((d) => d.side === side)
    if (mine.length === 0) return []
    if (mine.length === 1) return [{ side, text: mine[0].text, detail: mine[0].detail }]
    const text = `Higher win rate in ${mine.length === compared.length ? `all ${compared.length}` : `${mine.length} of ${compared.length}`} ${unit}`
    return [{ side, text, detail: mine.map((d) => `${d.label}: ${d.detail.split(' (')[0]}`).join(' · ') + ' (each interval separated)' }]
  })
}

export function byLabel(values: Array<Difference | null>): Difference[] {
  return values.filter((d): d is Difference => d !== null)
}
