import { sampleTier, type SampleTier } from './sampleTier'
import { wilsonInterval, type Interval } from './wilson'

export type Group<K extends string = string> = { key: K; label: string; wins: number; matches: number }
export type ScoredGroup<K extends string = string> = Group<K> & { winRate: number; interval: Interval; sample: SampleTier }

export type Comparison<K extends string = string> = {
  groups: ScoredGroup<K>[]
  best: ScoredGroup<K> | null
  worst: ScoredGroup<K> | null
  /** True only when the best group's interval is entirely above the worst group's. */
  clear: boolean
}

/** Scores groups (win rate + 95% interval); best/worst ignore Low-sample groups. */
export function compareGroups<K extends string>(groups: Group<K>[]): Comparison<K> {
  const scored = groups.map((g) => ({
    ...g,
    winRate: g.matches > 0 ? g.wins / g.matches : 0,
    interval: wilsonInterval(g.wins, g.matches),
    sample: sampleTier(g.matches),
  }))
  const eligible = scored.filter((g) => g.sample !== 'low')
  if (eligible.length < 2) return { groups: scored, best: eligible[0] ?? null, worst: null, clear: false }
  const byRate = [...eligible].sort((a, b) => b.winRate - a.winRate)
  const best = byRate[0]
  const worst = byRate[byRate.length - 1]
  return { groups: scored, best, worst, clear: best.interval.low > worst.interval.high }
}
