import { MIN_EFFECT } from '@/lib/analytics/insights'
import { sampleTier, type SampleTier } from '@/lib/analytics/sampleTier'
import { wilsonInterval, type Interval } from '@/lib/analytics/wilson'

/*
 * Draft Lab rules. Everything here is a statistical association from public matches in the
 * selected scope, never advice from a person.
 *
 * Expected win rates come from the heroes' individual win rates (additive model):
 *   same team:  expected = wr(x) + wr(y) − 50%
 *   opposing:   expected = wr(x) − wr(y) + 50%   (from x's side)
 * A relationship is "clear" only when the pair's 95% interval excludes the expectation, its
 * sample isn't Low, and the gap is at least MIN_EFFECT. With six-figure samples tiny gaps
 * become statistically detectable without mattering, so the effect floor keeps them out.
 * Everything else is treated as noise or missing data, and is not drawn.
 */

/** Smallest gap (1 percentage point) treated as a relationship; shared with the Insight Engine. */
export { MIN_EFFECT }

export type DraftHero = { id: number; slug: string; name: string; role: string | null; iconUrl: string | null }
export type HeroTotals = { heroId: number; wins: number; matches: number; damage: number; damageTaken: number; objectiveDamage: number }
export type PairRow = { a: number; b: number; wins: number; matches: number }

export type Relation = {
  kind: 'synergy' | 'matchup'
  /** synergy: either order · matchup: `from` is the side whose win rate is measured. */
  from: number
  to: number
  winRate: number
  expected: number
  lift: number
  matches: number
  interval: Interval
  sample: SampleTier
  clear: 'positive' | 'negative' | null
}

export type Confidence = 'high' | 'moderate'

export type Recommendation = {
  hero: DraftHero
  confidence: Confidence
  score: number
  relations: Relation[]
  positives: number
  negatives: number
  missing: number
  /** Role this hero would add if no ally has it yet (a fact; not scored). */
  newRole: string | null
}

export type WeakPoint = { kind: 'threat' | 'clash' | 'balance'; title: string; detail: string }

export type BalanceAxis = 'damage' | 'damageTaken' | 'objectiveDamage'
export const BALANCE_LABELS: Record<BalanceAxis, string> = {
  damage: 'Hero damage',
  damageTaken: 'Damage taken (frontline)',
  objectiveDamage: 'Objective damage',
}

export const ROLE_ORDER = ['brawler', 'assassin', 'marksman', 'mystic'] as const

/** Lookup for pair statistics with expectation from individual win rates. */
export function relationIndex(totals: HeroTotals[], synergies: PairRow[], matchups: PairRow[]) {
  const base = new Map(totals.filter((t) => t.matches > 0).map((t) => [t.heroId, t.wins / t.matches]))
  const syn = new Map<string, PairRow>()
  for (const r of synergies) syn.set(r.a < r.b ? `${r.a}:${r.b}` : `${r.b}:${r.a}`, r)
  const vs = new Map(matchups.map((r) => [`${r.a}>${r.b}`, r]))

  const make = (kind: Relation['kind'], from: number, to: number, row: PairRow | undefined, expected: number): Relation | null => {
    if (!row || row.matches === 0) return null
    const interval = wilsonInterval(row.wins, row.matches)
    const sample = sampleTier(row.matches)
    const winRate = row.wins / row.matches
    const lift = winRate - expected
    const clear = sample === 'low' || Math.abs(lift) < MIN_EFFECT ? null : interval.low > expected ? 'positive' : interval.high < expected ? 'negative' : null
    return { kind, from, to, winRate, expected, lift, matches: row.matches, interval, sample, clear }
  }

  return {
    base,
    synergy(x: number, y: number): Relation | null {
      const bx = base.get(x)
      const by = base.get(y)
      if (bx === undefined || by === undefined) return null
      return make('synergy', x, y, syn.get(x < y ? `${x}:${y}` : `${y}:${x}`), bx + by - 0.5)
    },
    matchup(x: number, y: number): Relation | null {
      const bx = base.get(x)
      const by = base.get(y)
      if (bx === undefined || by === undefined) return null
      return make('matchup', x, y, vs.get(`${x}>${y}`), bx - by + 0.5)
    },
  }
}
export type RelationIndex = ReturnType<typeof relationIndex>

/** Clear relationships among the picked heroes (what the map draws). */
export function draftRelations(idx: RelationIndex, allies: number[], enemies: number[]) {
  const pairs = (ids: number[]) => ids.flatMap((x, i) => ids.slice(i + 1).map((y) => idx.synergy(x, y)))
  const all = [...pairs(allies), ...pairs(enemies), ...allies.flatMap((a) => enemies.map((e) => idx.matchup(a, e)))]
  const checked = allies.length * (allies.length - 1) / 2 + enemies.length * (enemies.length - 1) / 2 + allies.length * enemies.length
  const found = all.filter((r): r is Relation => r !== null)
  return { clear: found.filter((r) => r.clear), checked, withData: found.length }
}

/**
 * Next-pick candidates for the allied side. A hero is listed only with at least one clear
 * positive relationship to the current picks and more positives than negatives.
 * high: ≥ 2 clear positives and no clear negative · moderate: otherwise.
 */
export function recommendations(idx: RelationIndex, heroes: DraftHero[], allies: number[], enemies: number[], limit = 5): Recommendation[] {
  if (allies.length + enemies.length === 0 || allies.length >= 6) return []
  const taken = new Set([...allies, ...enemies])
  const allyRoles = new Set(heroes.filter((h) => allies.includes(h.id)).map((h) => h.role))
  return heroes
    .filter((h) => !taken.has(h.id))
    .flatMap((hero): Recommendation[] => {
      const rel = [...allies.map((a) => idx.synergy(hero.id, a)), ...enemies.map((e) => idx.matchup(hero.id, e))]
      const relations = rel.filter((r): r is Relation => r !== null)
      const positives = relations.filter((r) => r.clear === 'positive').length
      const negatives = relations.filter((r) => r.clear === 'negative').length
      if (positives === 0 || positives <= negatives) return []
      const score = relations.reduce((s, r) => s + (r.clear ? r.lift : 0), 0)
      return [{
        hero,
        confidence: positives >= 2 && negatives === 0 ? 'high' : 'moderate',
        score,
        relations: relations.sort((x, y) => Number(y.clear !== null) - Number(x.clear !== null) || Math.abs(y.lift) - Math.abs(x.lift)),
        positives,
        negatives,
        missing: rel.length - relations.length,
        newRole: hero.role && !allyRoles.has(hero.role) ? hero.role : null,
      }]
    })
    .sort((a, b) => (a.confidence === b.confidence ? b.score - a.score : a.confidence === 'high' ? -1 : 1))
    .slice(0, limit)
}

/** Per-hero, per-match averages ranked against all active heroes (0 = lowest, 1 = highest). */
export function balanceProfile(totals: HeroTotals[]) {
  const perMatch = totals.filter((t) => t.matches > 0).map((t) => ({ id: t.heroId, damage: t.damage / t.matches, damageTaken: t.damageTaken / t.matches, objectiveDamage: t.objectiveDamage / t.matches }))
  const pct = new Map<number, Record<BalanceAxis, number>>()
  for (const h of perMatch) {
    const rank = (axis: BalanceAxis) => (perMatch.length > 1 ? perMatch.filter((o) => o[axis] < h[axis]).length / (perMatch.length - 1) : 0.5)
    pct.set(h.id, { damage: rank('damage'), damageTaken: rank('damageTaken'), objectiveDamage: rank('objectiveDamage') })
  }
  return pct
}

export function teamBalance(profile: Map<number, Record<BalanceAxis, number>>, ids: number[]): Record<BalanceAxis, number> | null {
  const rows = ids.map((id) => profile.get(id)).filter((r): r is Record<BalanceAxis, number> => Boolean(r))
  if (rows.length === 0) return null
  const avg = (axis: BalanceAxis) => rows.reduce((s, r) => s + r[axis], 0) / rows.length
  return { damage: avg('damage'), damageTaken: avg('damageTaken'), objectiveDamage: avg('objectiveDamage') }
}

const pp = (v: number) => `${v >= 0 ? '+' : '−'}${(Math.abs(v) * 100).toFixed(1)}pp`

/** Measured weak points of the allied side. Facts only; no claim about what to do. */
export function weakPoints(idx: RelationIndex, heroes: DraftHero[], allies: number[], enemies: number[], balance: Record<BalanceAxis, number> | null): WeakPoint[] {
  const name = (id: number) => heroes.find((h) => h.id === id)?.name ?? `Hero ${id}`
  const out: WeakPoint[] = []
  for (const e of enemies) {
    const hit = allies.map((a) => idx.matchup(a, e)).filter((r): r is Relation => r?.clear === 'negative')
    if (hit.length) {
      out.push({
        kind: 'threat',
        title: `${name(e)}: lower results than expected for ${hit.map((r) => name(r.from)).join(' and ')}`,
        detail: hit.map((r) => `${name(r.from)} wins ${(r.winRate * 100).toFixed(1)}% vs ${name(e)}, expected ${(r.expected * 100).toFixed(1)}% (${pp(r.lift)}, n = ${r.matches.toLocaleString('en-US')})`).join(' · '),
      })
    }
  }
  allies.forEach((x, i) =>
    allies.slice(i + 1).forEach((y) => {
      const r = idx.synergy(x, y)
      if (r?.clear === 'negative') {
        out.push({ kind: 'clash', title: `${name(x)} + ${name(y)} win less together than expected`, detail: `${(r.winRate * 100).toFixed(1)}% together, expected ${(r.expected * 100).toFixed(1)}% (${pp(r.lift)}, n = ${r.matches.toLocaleString('en-US')})` })
      }
    }),
  )
  if (balance && allies.length >= 3) {
    for (const axis of Object.keys(BALANCE_LABELS) as BalanceAxis[]) {
      if (balance[axis] < 0.25) {
        out.push({ kind: 'balance', title: `Low ${BALANCE_LABELS[axis].toLowerCase()}`, detail: `Your picks average the ${Math.round(balance[axis] * 100)}th percentile of heroes on this per-match measure.` })
      }
    }
  }
  return out
}
