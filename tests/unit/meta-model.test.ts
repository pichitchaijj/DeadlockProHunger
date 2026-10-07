import { describe, expect, it } from 'vitest'
import { buildMetaModel, slugify, type MetaInputRow } from '@/features/meta/model'
import { DEFAULT_QUERY } from '@/features/meta/query'

const DAY = 86_400
const today = 20_000 * DAY

/** Synthetic test input (not real statistics): `days` daily rows with a fixed win rate. */
function rowsFor(heroId: number, matchesPerDay: number, winRate: number, days: number, endDay = today): MetaInputRow[] {
  return Array.from({ length: days }, (_, i) => ({
    heroId,
    day: endDay - i * DAY,
    wins: Math.round(matchesPerDay * winRate),
    matches: matchesPerDay,
    kills: matchesPerDay * 5,
    deaths: matchesPerDay * 4,
    assists: matchesPerDay * 7,
    netWorth: matchesPerDay * 30_000,
  }))
}

const heroes = [
  { id: 1, name: 'Strong One', className: 'h1', role: 'brawler', iconUrl: null },
  { id: 2, name: 'Average Two', className: 'h2', role: 'mystic', iconUrl: null },
  { id: 3, name: 'Rare Three', className: 'h3', role: 'mystic', iconUrl: null },
  { id: 4, name: 'Riser Four', className: 'h4', role: 'brawler', iconUrl: null },
]

const rows = [
  ...rowsFor(1, 2_000, 0.56, 14),
  ...rowsFor(2, 2_000, 0.5, 14),
  ...rowsFor(3, 10, 0.8, 14), // 70 matches in 7 days: low sample
  ...rowsFor(4, 2_000, 0.56, 7), // this week 56%…
  ...rowsFor(4, 2_000, 0.48, 7, today - 7 * DAY), // …previous week 48%
]

const model = buildMetaModel({
  heroes,
  rows,
  query: DEFAULT_QUERY,
  windowStart: today - 6 * DAY,
  today,
  scopeText: 'test scope',
})

describe('buildMetaModel', () => {
  it('assigns tiers from the interval and never to low samples', () => {
    const byName = Object.fromEntries(model.heroes.map((h) => [h.name, h]))
    expect(byName['Strong One'].tier).toBe('S')
    expect(byName['Average Two'].tier).toBe('B')
    expect(byName['Rare Three'].tier).toBeNull()
    expect(byName['Rare Three'].sample).toBe('low')
  })

  it('hides low-sample heroes from rows and summaries by default', () => {
    expect(model.rows.map((h) => h.name)).not.toContain('Rare Three')
    expect(model.hiddenLowSample).toBe(1)
    expect(model.summary.highestWinRate?.name).not.toBe('Rare Three')
  })

  it('detects a rising hero from non-overlapping weekly intervals', () => {
    expect(model.summary.rising.map((h) => h.name)).toEqual(['Riser Four'])
    expect(model.heroes.find((h) => h.name === 'Average Two')?.trend?.direction).toBe('stable')
  })

  it('computes pick rates from Σ matches ÷ 12', () => {
    const totalSlots = model.heroes.reduce((n, h) => n + h.matches, 0)
    const strong = model.heroes.find((h) => h.name === 'Strong One')!
    expect(strong.pickRate).toBeCloseTo(strong.matches / (totalSlots / 12))
  })

  it('filters by role without changing pick rates', () => {
    const mystic = buildMetaModel({ heroes, rows, query: { ...DEFAULT_QUERY, role: 'mystic' }, windowStart: today - 6 * DAY, today, scopeText: 't' })
    expect(mystic.rows.map((h) => h.name)).toEqual(['Average Two'])
    expect(mystic.heroes.find((h) => h.id === 1)?.pickRate).toBeCloseTo(model.heroes.find((h) => h.id === 1)!.pickRate)
  })

  it('states only numeric facts in "Why?"', () => {
    const facts = model.heroes.find((h) => h.name === 'Strong One')!.why
    expect(facts.map((f) => f.label)).toEqual(['Result', 'Certainty', 'Popularity', 'Trend', 'Role', 'Per match'])
    expect(facts[0].text).toBe('Won 56.0% of 14,000 matches (test scope).')
  })
})

describe('whyFacts without a previous week', () => {
  it('says explicitly that no trend can be computed', () => {
    const fresh = buildMetaModel({
      heroes: [{ id: 9, name: 'New Nine', className: 'h9', role: 'brawler', iconUrl: null }, ...heroes],
      rows: [...rows, ...rowsFor(9, 2_000, 0.6, 7)],
      query: DEFAULT_QUERY,
      windowStart: today - 6 * DAY,
      today,
      scopeText: 't',
    })
    const trend = fresh.heroes.find((h) => h.id === 9)!.why.find((f) => f.label === 'Trend')
    expect(trend?.text).toBe('No matches in the 7 days before for this scope, so no trend can be computed.')
  })
})

describe('slugify', () => {
  it('makes URL-safe hero slugs', () => {
    expect(slugify('Mo & Krill')).toBe('mo-and-krill')
    expect(slugify('The Doorman')).toBe('the-doorman')
  })
})
