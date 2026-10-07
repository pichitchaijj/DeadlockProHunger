import { describe, expect, it } from 'vitest'
import { nonDescriptiveTerms } from '@/lib/analytics/insights'
import {
  filterAndSort,
  heroBreakdown,
  itemRows,
  minuteAtShare,
  minuteSeries,
  plottable,
  purchasePhases,
  purchaseTimingInsight,
  standoutPhase,
  typicalWindow,
  type ItemRef,
} from '@/features/items/model'
import { itemHref, itemsHref, parseItemsQuery, DEFAULT_ITEMS_QUERY } from '@/features/items/query'

const ref = (id: number, name: string, slot: string): ItemRef => ({ id, slug: name.toLowerCase().replace(/ /g, '-'), name, slot, tier: 1, cost: 800, icon: null })
const items = new Map([
  [1, ref(1, 'Rapid Rounds', 'weapon')],
  [2, ref(2, 'Extra Health', 'vitality')],
])

describe('itemRows', () => {
  const totals = [
    { item_id: 1, wins: 600, matches: 1_000, avg_buy_time_s: 300 },
    { item_id: 2, wins: 450, matches: 1_000, avg_buy_time_s: 900 },
    { item_id: 99, wins: 10, matches: 20, avg_buy_time_s: 60 }, // not a shop item
  ]

  it('computes win rate, interval and buy rate against all player-matches', () => {
    const rows = itemRows(totals, items, 10_000)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ name: 'Rapid Rounds', winRate: 0.6, buyRate: 0.1, sample: 'moderate' })
    expect(rows[0].interval.low).toBeLessThan(0.6)
    expect(rows[0].interval.high).toBeGreaterThan(0.6)
  })

  it('leaves buy rate unavailable (never 0%) when the denominator is missing', () => {
    expect(itemRows(totals, items, null).every((r) => r.buyRate === null)).toBe(true)
  })

  it('filters by slot and sorts', () => {
    const rows = itemRows(totals, items, 10_000)
    expect(filterAndSort(rows, 'vitality', 'winRate', 'desc').map((r) => r.id)).toEqual([2])
    expect(filterAndSort(rows, 'all', 'winRate', 'asc').map((r) => r.id)).toEqual([2, 1])
    expect(filterAndSort(rows, 'all', 'buyTime', 'desc').map((r) => r.id)).toEqual([2, 1])
  })
})

describe('purchase minutes', () => {
  const points = minuteSeries([
    { minute: 2, wins: 300, matches: 500 },
    { minute: 0, wins: 50, matches: 100 },
    { minute: 1, wins: 150, matches: 300 },
    { minute: 3, wins: 60, matches: 100 },
  ])

  it('orders by minute and gives each minute its share of purchases', () => {
    expect(points.map((p) => p.minute)).toEqual([0, 1, 2, 3])
    expect(points.reduce((n, p) => n + p.share, 0)).toBeCloseTo(1)
    expect(points[2].share).toBeCloseTo(0.5)
  })

  it('plots only minutes that are not Low sample', () => {
    expect(plottable(points).map((p) => p.minute)).toEqual([1, 2])
  })

  it('finds the minutes holding the middle half of purchases', () => {
    expect(typicalWindow(points)).toEqual({ from: 1, to: 3 })
    expect(typicalWindow([])).toBeNull()
  })

  it('finds the minute by which a share of purchases has happened', () => {
    expect(minuteAtShare(points, 0.5)).toBe(2)
    expect(minuteAtShare(points, 0.99)).toBe(3)
    expect(minuteAtShare([], 0.99)).toBe(0)
  })
})

describe('purchase phases and the standout rule', () => {
  const phase = (column: number, wins: number, matches: number, adjustedWinRate: number) => ({ column, wins, matches, adjustedWinRate })

  it('keeps every phase and marks phases without data', () => {
    const phases = purchasePhases([phase(0, 500, 1_000, 0.5)])
    expect(phases).toHaveLength(4)
    expect(phases[0].stats).toMatchObject({ share: 1, winRate: 0.5 })
    expect(phases.slice(1).every((p) => p.stats === null)).toBe(true)
  })

  it('names a phase only when intervals separate and the lead survives the net-worth adjustment', () => {
    const phases = purchasePhases([phase(0, 50_000, 100_000, 0.5), phase(1, 26_000, 50_000, 0.505), phase(3, 5_600, 10_000, 0.54)])
    const s = standoutPhase(phases)
    expect(s?.phase.key).toBe('very-late')
    expect(s!.gap).toBeCloseTo(0.04)
    expect(s!.adjustedGap).toBeCloseTo(0.035)
  })

  it('names nothing when the lead disappears after adjustment', () => {
    const phases = purchasePhases([phase(0, 50_000, 100_000, 0.5), phase(3, 5_600, 10_000, 0.505)])
    expect(standoutPhase(phases)).toBeNull()
  })

  it('names nothing when intervals overlap or only one phase has data', () => {
    expect(standoutPhase(purchasePhases([phase(0, 150, 300, 0.5), phase(1, 165, 300, 0.56)]))).toBeNull()
    expect(standoutPhase(purchasePhases([phase(0, 600, 1_000, 0.6)]))).toBeNull()
  })

  it('words the insight descriptively, with its rule and caveat', () => {
    const phases = purchasePhases([phase(0, 50_000, 100_000, 0.5), phase(3, 5_600, 10_000, 0.54)])
    const insight = purchaseTimingInsight('Rapid Rounds', standoutPhase(phases)!, phases, 'Last 7 days, All ranks')
    expect(nonDescriptiveTerms(insight)).toEqual([])
    expect(insight.statement).not.toMatch(/optimal|recommend/i)
    expect(insight.sampleSize).toBe(10_000)
    expect(insight.caveat).toMatch(/not a causal estimate/)
  })
})

describe('heroBreakdown', () => {
  const heroes = new Map([
    [1, { id: 1, slug: 'abrams', name: 'Abrams', iconUrl: null }],
    [2, { id: 2, slug: 'haze', name: 'Haze', iconUrl: null }],
    [3, { id: 3, slug: 'lash', name: 'Lash', iconUrl: null }],
  ])
  it('ranks heroes by buy rate within their matches and drops Low samples', () => {
    const rows = heroBreakdown(
      [
        { heroId: 1, wins: 300, matches: 500 },
        { heroId: 2, wins: 400, matches: 800 },
        { heroId: 3, wins: 50, matches: 100 },
      ],
      new Map([
        [1, 1_000],
        [2, 4_000],
        [3, 100],
      ]),
      heroes,
    )
    expect(rows.map((r) => [r.slug, r.buyRate])).toEqual([
      ['abrams', 0.5],
      ['haze', 0.2],
    ])
  })
})

describe('items query', () => {
  it('parses known values and drops unknown ones', () => {
    expect(parseItemsQuery({ window: '30d', rank: 'top', mode: 'ranked', hero: 'haze', slot: 'spirit', sort: 'winRate', dir: 'asc' })).toEqual({
      window: '30d',
      rank: 'top',
      mode: 'ranked',
      hero: 'haze',
      slot: 'spirit',
      sort: 'winRate',
      dir: 'asc',
    })
    expect(parseItemsQuery({ window: 'year', hero: 'Bad Hero!', slot: 'x' })).toEqual(DEFAULT_ITEMS_QUERY)
  })

  it('keeps URLs short and carries the scope from the list to an item', () => {
    expect(itemsHref(DEFAULT_ITEMS_QUERY)).toBe('/items')
    const q = { ...DEFAULT_ITEMS_QUERY, hero: 'haze', rank: 'high' as const, sort: 'winRate' as const }
    expect(itemsHref(q)).toBe('/items?rank=high&hero=haze&sort=winRate')
    expect(itemHref('rapid-rounds', q)).toBe('/items/rapid-rounds?rank=high&hero=haze')
  })
})
