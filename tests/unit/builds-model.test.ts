import { describe, expect, it } from 'vitest'
import { abilityPlan, buildWhyFacts, flowForBuild, labelsFor, metaOrder, patchStatus, phaseItems, scoreBuild } from '@/features/builds/model'

/* Synthetic inputs only; none of these are real Deadlock statistics. */

describe('labelsFor', () => {
  const strong = { id: 1, stats: scoreBuild(1_400, 2_000) } // 70%, high sample
  const ok = { id: 2, stats: scoreBuild(520, 1_000) }
  const small = { id: 3, stats: scoreBuild(90, 100) }
  const all = [strong, ok, small]

  it('uses "best-performing" only when the interval clears every other tracked build', () => {
    expect(labelsFor({ stats: strong.stats, heroWinRate: 0.5, heroBuildStats: all, buildId: 1, favoritesRank: null })).toEqual([
      'best-performing',
      'frequently-used',
      'high-confidence',
    ])
  })

  it('falls back to "high-performing" when another build overlaps', () => {
    const close = { id: 4, stats: scoreBuild(1_380, 2_000) }
    const labels = labelsFor({ stats: strong.stats, heroWinRate: 0.5, heroBuildStats: [...all, close], buildId: 1, favoritesRank: 3 })
    expect(labels).toContain('high-performing')
    expect(labels).not.toContain('best-performing')
    expect(labels).toContain('popular')
  })

  it('never labels performance from a low sample', () => {
    expect(labelsFor({ stats: small.stats, heroWinRate: 0.5, heroBuildStats: all, buildId: 3, favoritesRank: null })).toEqual([])
  })
})

describe('metaOrder', () => {
  it('ranks by lift of the interval low end over the hero win rate, dropping low samples', () => {
    const rows = [
      { id: 'a', stats: scoreBuild(600, 1_000), heroWinRate: 0.55 },
      { id: 'b', stats: scoreBuild(560, 1_000), heroWinRate: 0.45 },
      { id: 'c', stats: scoreBuild(90, 100), heroWinRate: 0.4 },
      { id: 'd', stats: null, heroWinRate: 0.5 },
    ]
    expect(metaOrder(rows).map((r) => r.id)).toEqual(['b', 'a'])
  })
})

describe('patchStatus', () => {
  it('compares the update time with the patch start', () => {
    expect(patchStatus(10, 5)).toBe('current')
    expect(patchStatus(4, 5)).toBe('older')
    expect(patchStatus(null, 5)).toBeNull()
  })
})

describe('abilityPlan', () => {
  it('keeps one unlock and up to three upgrades per ability, ignoring repeats', () => {
    const steps = abilityPlan(
      [
        { ability_id: 1, currency_type: 2 },
        { ability_id: 1, currency_type: 1 },
        { ability_id: 1, currency_type: 1 },
        { ability_id: 1, currency_type: 1 },
        { ability_id: 1, currency_type: 1 }, // 4th upgrade: dropped
        { ability_id: 1, currency_type: 2 }, // repeated unlock: dropped
        { ability_id: 9, currency_type: 2 }, // not this hero's ability
      ],
      new Set([1, 2]),
    )
    expect(steps.map((s) => `${s.kind}${s.level}`)).toEqual(['unlock0', 'upgrade1', 'upgrade2', 'upgrade3'])
  })
})

const shop = new Map([
  [10, { id: 10, name: 'A', slot: 'weapon', tier: 1, cost: 800, icon: null }],
  [20, { id: 20, name: 'B', slot: 'spirit', tier: 2, cost: 1_600, icon: null }],
  [30, { id: 30, name: 'C', slot: 'vitality', tier: 4, cost: 6_400, icon: null }],
])

describe('phaseItems', () => {
  it('groups by observed buy time and keeps untimed items separate', () => {
    const { phases, untimed } = phaseItems([...shop.values()], [{ item_id: 10, matches: 500, avg_buy_time_s: 300 }, { item_id: 20, matches: 200, avg_buy_time_s: 900 }], 1_000)
    expect(phases.map((p) => p.items.map((i) => i.name))).toEqual([['A'], ['B'], []])
    expect(untimed.map((i) => i.name)).toEqual(['C'])
    expect(phases[0].items[0].buyRate).toBeCloseTo(0.5)
  })
})

describe('flowForBuild', () => {
  it('keeps each build item’s most common column and transitions within the build', () => {
    const f = flowForBuild(
      [10, 20],
      {
        nodes: [
          { column: 0, item_id: 10, matches: 900, adjusted_win_rate: 0.51 },
          { column: 1, item_id: 10, matches: 100, adjusted_win_rate: 0.6 },
          { column: 1, item_id: 20, matches: 400, adjusted_win_rate: 0.49 },
          { column: 0, item_id: 30, matches: 800, adjusted_win_rate: 0.7 },
        ],
        edges: [
          { from_item_id: 10, to_item_id: 20, matches: 300 },
          { from_item_id: 10, to_item_id: 30, matches: 600 },
        ],
        baseline: { wins: 500, matches: 1_000 },
      },
      shop,
    )
    expect(f.items.map((i) => [i.name, i.column])).toEqual([['A', 0], ['B', 1]])
    expect(f.transitions.map((t) => `${t.from.name}>${t.to.name}`)).toEqual(['A>B'])
    expect(f.baselineWinRate).toBe(0.5)
  })
})

describe('buildWhyFacts', () => {
  const phases = phaseItems([...shop.values()], [{ item_id: 10, matches: 500, avg_buy_time_s: 300 }, { item_id: 20, matches: 200, avg_buy_time_s: 900 }], 1_000)
  const base = { heroWinRate: 0.5, trackedCount: 4, weeklyFavorites: null, favoritesRank: null, favoritesOf: 0, phases, flow: null }

  it('returns facts as data (no wording) with the interval rule applied', () => {
    const facts = buildWhyFacts({ ...base, stats: scoreBuild(700, 1_000) })
    expect(facts.map((f) => f.kind)).toEqual(['sample', 'win-rate', 'timing'])
    expect(facts.find((f) => f.kind === 'win-rate')).toMatchObject({ comparison: 'above', heroWinRate: 0.5 })
    expect(facts.find((f) => f.kind === 'timing')).toMatchObject({ timed: 2, total: 3, core: 1 })
  })

  it('says only "no matches" without stats, and "low" for a low sample', () => {
    expect(buildWhyFacts({ ...base, stats: null }).map((f) => f.kind)).toEqual(['no-matches', 'timing'])
    expect(buildWhyFacts({ ...base, stats: scoreBuild(30, 40) }).find((f) => f.kind === 'win-rate')).toMatchObject({ comparison: 'low' })
    expect(buildWhyFacts({ ...base, stats: scoreBuild(500, 1_000) }).find((f) => f.kind === 'win-rate')).toMatchObject({ comparison: 'overlap' })
  })
})