import { describe, expect, it } from 'vitest'
import { english } from './helpers/insightEnglish'
import { compareGroups } from '@/lib/analytics/compare'
import {
  abilityOpenings,
  byRank,
  dailySeries,
  heroInsights,
  itemProgression,
  matchupsFor,
  patchImpacts,
  synergiesFor,
  type HeroInsightInput,
  type HeroRef,
} from '@/features/hero/model'

/* Synthetic inputs only; none of these numbers are real Deadlock statistics. */

const ref = (id: number, name: string): HeroRef => ({ id, name, slug: name.toLowerCase(), iconUrl: null })
const heroes = new Map([1, 2, 3, 4].map((id) => [id, ref(id, `H${id}`)]))
const DAY = 86_400

describe('compareGroups', () => {
  it('calls a difference clear only when intervals separate', () => {
    expect(compareGroups([{ key: 'a', label: 'A', wins: 600, matches: 1_000 }, { key: 'b', label: 'B', wins: 450, matches: 1_000 }]).clear).toBe(true)
    expect(compareGroups([{ key: 'a', label: 'A', wins: 510, matches: 1_000 }, { key: 'b', label: 'B', wins: 495, matches: 1_000 }]).clear).toBe(false)
  })

  it('ignores low-sample groups for best and worst', () => {
    const c = compareGroups([{ key: 'a', label: 'A', wins: 90, matches: 100 }, { key: 'b', label: 'B', wins: 500, matches: 1_000 }])
    expect(c.best?.key).toBe('b')
    expect(c.worst).toBeNull()
  })
})

describe('matchups and synergies', () => {
  const counters = [
    { hero_id: 1, enemy_hero_id: 2, wins: 62, matches_played: 100 }, // 62% but small: lower bound ≈ 52%
    { hero_id: 1, enemy_hero_id: 3, wins: 5_800, matches_played: 10_000 }, // 58% and certain
    { hero_id: 1, enemy_hero_id: 4, wins: 4_200, matches_played: 10_000 },
    { hero_id: 2, enemy_hero_id: 1, wins: 30, matches_played: 100 },
  ]

  it('ranks best by the lower bound so small samples cannot win by luck', () => {
    const m = matchupsFor(1, counters, heroes)
    expect(m.best[0].name).toBe('H3')
    expect(m.worst[0].name).toBe('H4')
    expect(m.all).toHaveLength(3)
  })

  it('reads synergy pairs in either order', () => {
    const s = synergiesFor(1, [{ hero_id1: 2, hero_id2: 1, wins: 600, matches_played: 1_000 }, { hero_id1: 3, hero_id2: 4, wins: 1, matches_played: 2 }], heroes)
    expect(s.map((p) => p.name)).toEqual(['H2'])
  })
})

describe('byRank', () => {
  it('folds badge buckets into bands and skips badge 0', () => {
    const rows = [
      { hero_id: 1, bucket: 0, wins: 999, matches: 1_000 },
      { hero_id: 1, bucket: 85, wins: 300, matches: 500 },
      { hero_id: 1, bucket: 96, wins: 300, matches: 500 },
      { hero_id: 1, bucket: 101, wins: 100, matches: 400 },
    ]
    const c = byRank(1, rows, new Map())
    const high = c.groups.find((g) => g.key === 'high')!
    expect(high.matches).toBe(1_000)
    expect(c.groups.find((g) => g.key === 'top')!.matches).toBe(400)
    expect(c.groups.reduce((n, g) => n + g.matches, 0)).toBe(1_400)
  })
})

describe('abilityOpenings', () => {
  it('groups full sequences by their first 8 upgrades', () => {
    const base = [1, 1, 2, 2, 3, 1, 4, 1]
    const o = abilityOpenings([
      { abilities: [...base, 2, 3], wins: 50, matches: 100 },
      { abilities: [...base, 3, 2, 4], wins: 70, matches: 100 },
      { abilities: [2, 2, 1, 1, 3, 2, 4, 2], wins: 40, matches: 100 },
      { abilities: [1, 2], wins: 1, matches: 1 }, // too short
    ])
    expect(o[0].sequence).toEqual(base)
    expect(o[0].matches).toBe(200)
    expect(o[0].share).toBeCloseTo(2 / 3)
  })
})

describe('itemProgression', () => {
  it('keeps core items and groups them by buy time', () => {
    const shop = new Map([
      [10, { id: 10, name: 'Early', slot: 'weapon', tier: 1, cost: 800, icon: null }],
      [20, { id: 20, name: 'Late', slot: 'spirit', tier: 4, cost: 6_400, icon: null }],
      [30, { id: 30, name: 'Rare', slot: 'vitality', tier: 2, cost: 1_600, icon: null }],
    ])
    const phases = itemProgression(
      [
        { item_id: 10, wins: 500, matches: 900, avg_buy_time_s: 300 },
        { item_id: 20, wins: 300, matches: 400, avg_buy_time_s: 1_800 },
        { item_id: 30, wins: 10, matches: 50, avg_buy_time_s: 700 }, // 5% buy rate: not core
        { item_id: 99, wins: 1, matches: 900, avg_buy_time_s: 100 }, // not a shop item
      ],
      shop,
      1_000,
    )
    expect(phases.map((p) => p.items.map((i) => i.name))).toEqual([['Early'], [], ['Late']])
    expect(phases[0].items[0].buyRate).toBeCloseTo(0.9)
  })
})

describe('dailySeries and patchImpacts', () => {
  const rows = [
    ...[0, 1, 2, 3, 4, 5, 6].map((d) => ({ hero_id: 1, bucket: d * DAY, wins: 4_500, matches: 10_000 })),
    ...[7, 8, 9, 10, 11, 12, 13].map((d) => ({ hero_id: 1, bucket: d * DAY, wins: 5_500, matches: 10_000 })),
    ...[0, 7].map((d) => ({ hero_id: 2, bucket: d * DAY, wins: 1, matches: 110_000 })),
  ]

  it('computes daily pick rate against all heroes that day', () => {
    const series = dailySeries(1, rows)
    expect(series).toHaveLength(14)
    expect(series[0].pickRate).toBeCloseTo(10_000 / (120_000 / 12))
  })

  it('compares the week before and after a patch', () => {
    const [impact] = patchImpacts(1, rows, [{ title: 'P', day: 7 * DAY, link: null }], 13 * DAY)
    expect(impact.verdict).toBe('higher')
    expect(impact.before?.matches).toBe(70_000)
  })
})

describe('heroInsights', () => {
  const base: HeroInsightInput = {
    name: 'H1',
    winRate: 0.52,
    scope: { window: { kind: 'days', days: 30 }, rank: { kind: 'all' } },
    weekScope: { window: { kind: 'days', days: 14 }, rank: { kind: 'all' } },
    rankScope: { window: { kind: 'days', days: 30 }, rank: { kind: 'everyBand' } },
    weeks: null,
    patch: null,
    length: compareGroups([{ key: 'short', label: 'Under 25 min', wins: 500, matches: 1_000 }, { key: 'long', label: 'Over 35 min', wins: 650, matches: 1_000 }]),
    rank: compareGroups([{ key: 'low', label: 'Low', wins: 505, matches: 1_000 }, { key: 'top', label: 'Top', wins: 500, matches: 1_000 }]),
    rankPicks: [],
    matchups: { best: [], worst: [] },
    synergies: [],
    builds: [],
    items: [],
  }

  it('emits only insights whose rules pass, ordered by what changed first', () => {
    const insights = heroInsights({ ...base, weeks: { current: { wins: 5_520, matches: 10_000 }, previous: { wins: 5_280, matches: 10_000 } } })
    expect(insights.map((i) => i.kind)).toEqual(['rising', 'length-performance'])
    expect(english(insights[1]).value).toBe('Over 35 min')
  })

  it('drops a patch shift that restates the weekly change, keeps one that does not', () => {
    const weeks = { current: { wins: 5_520, matches: 10_000 }, previous: { wins: 5_280, matches: 10_000 } }
    const patch = (inWeeks: boolean) => ({ title: 'P', before: { wins: 5_280, matches: 10_000 }, after: { wins: 5_520, matches: 10_000 }, inWeeks })
    expect(heroInsights({ ...base, weeks, patch: patch(true) }).map((i) => i.kind)).not.toContain('recent-shift')
    expect(heroInsights({ ...base, weeks, patch: patch(false) }).map((i) => i.kind)).toContain('recent-shift')
  })

  it('never shows a negative top opponent as a positive matchup', () => {
    const negative = { id: 2, name: 'H2', slug: 'h2', iconUrl: null, wins: 400, matches: 1_000, winRate: 0.4, interval: { low: 0.37, high: 0.43 }, sample: 'moderate' as const }
    const kinds = heroInsights({ ...base, matchups: { best: [negative], worst: [negative] } }).map((i) => i.kind)
    expect(kinds).toContain('weak-matchup')
    expect(kinds).not.toContain('strong-matchup')
  })
})

describe('categoryLabel', () => {
  it('translates game tokens and keeps author text', async () => {
    const { categoryLabel } = await import('@/features/hero/model')
    expect(categoryLabel('#Citadel_HeroBuilds_EarlyGame')).toBe('Early game')
    expect(categoryLabel('#Citadel_HeroBuilds_LateGame')).toBe('Late game')
    expect(categoryLabel('Лайнинг')).toBe('Лайнинг')
    expect(categoryLabel('  ')).toBe('Untitled section')
  })
})
