import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'
import en from '@/i18n/messages/en'
import { buildMetaModel, slugify, type MetaInputRow } from '@/features/meta/model'
import { DEFAULT_QUERY } from '@/features/meta/query'
import { makeMetaFormat, whyFactText } from '@/features/meta/text'
import type { ScopeRef } from '@/lib/analytics/scope'
import { englishScope } from './helpers/scopeEnglish'

const DAY = 86_400
const today = 20_000 * DAY
const SCOPE: ScopeRef = { window: { kind: 'days', days: 7 }, rank: { kind: 'all' } }

/** English "Why?" wording, as the page renders it. */
const whyT = createTranslator({ locale: 'en', messages: en, namespace: 'meta.why' })
const enFact = (fact: Parameters<typeof whyFactText>[0]) => whyFactText(fact, (key, values) => whyT(key as 'result', values), makeMetaFormat('en', englishScope.scope))

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
  scope: SCOPE,
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
    const mystic = buildMetaModel({ heroes, rows, query: { ...DEFAULT_QUERY, role: 'mystic' }, windowStart: today - 6 * DAY, today, scope: SCOPE })
    expect(mystic.rows.map((h) => h.name)).toEqual(['Average Two'])
    expect(mystic.heroes.find((h) => h.id === 1)?.pickRate).toBeCloseTo(model.heroes.find((h) => h.id === 1)!.pickRate)
  })

  it('states only numeric facts in "Why?"', () => {
    const facts = model.heroes.find((h) => h.name === 'Strong One')!.why.map(enFact)
    expect(facts.map((f) => f.label)).toEqual(['Result', 'Certainty', 'Popularity', 'Trend', 'Role', 'Per match'])
    expect(facts[0].text).toBe('Won 56.0% of 14,000 matches (Last 7 days, All ranks).')
  })
})

describe('"Why?" facts (structured, locale-neutral)', () => {
  const strong = model.heroes.find((h) => h.name === 'Strong One')!

  it('keep the count, order, kinds and every number of the analysis', () => {
    expect(strong.why).toEqual([
      { kind: 'result', winRate: strong.winRate, matches: 14_000, scope: SCOPE },
      { kind: 'certainty', lowSample: false, matches: 14_000, interval: strong.interval, tier: 'S' },
      { kind: 'popularity', pickRate: strong.pickRate, pickRank: strong.pickRank, heroCount: 4 },
      { kind: 'trend', current: { winRate: 0.56, matches: 14_000 }, previous: { winRate: 0.56, matches: 14_000 }, delta: 0, direction: 'stable' },
      { kind: 'role', role: 'brawler', roleWinRate: 0.56, hero: 'Strong One', delta: 0 },
      { kind: 'perMatch', kills: 5, deaths: 4, assists: 7, netWorth: 30_000, netWorthDiff: 0 },
    ])
    // The facts restate the hero's own analytics, never a second calculation.
    expect(strong.winRate).toBe(0.56)
    expect(strong.tier).toBe('S')
    expect(strong.trend?.direction).toBe('stable')
  })

  it('mirror each hero: low sample, tier, rank, trend direction and role', () => {
    for (const hero of model.heroes) {
      const byKind = Object.fromEntries(hero.why.map((f) => [f.kind, f]))
      expect(byKind.result).toMatchObject({ winRate: hero.winRate, matches: hero.matches })
      expect(byKind.certainty).toMatchObject({ lowSample: hero.sample === 'low', interval: hero.interval, tier: hero.tier })
      expect(byKind.popularity).toMatchObject({ pickRate: hero.pickRate, pickRank: hero.pickRank, heroCount: model.heroes.length })
      if (byKind.trend) expect(byKind.trend).toMatchObject({ direction: hero.trend?.direction ?? null })
      if (byKind.role) expect(byKind.role).toMatchObject({ role: hero.role, hero: hero.name })
    }
    const riser = model.heroes.find((h) => h.name === 'Riser Four')!
    expect(riser.why.find((f) => f.kind === 'trend')).toMatchObject({ direction: 'rising', current: { winRate: 0.56, matches: 14_000 }, previous: { winRate: 0.48, matches: 14_000 } })
    const rare = model.heroes.find((h) => h.name === 'Rare Three')!
    expect(rare.why.find((f) => f.kind === 'certainty')).toMatchObject({ lowSample: true, matches: 70, tier: null })
  })

  it('are unchanged by wording them (and wording needs no locale in the data)', () => {
    const before = structuredClone(model.heroes.map((h) => h.why))
    model.heroes.forEach((h) => h.why.forEach(enFact))
    expect(model.heroes.map((h) => h.why)).toEqual(before)
    expect(JSON.parse(JSON.stringify(before))).toEqual(before)
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
      scope: SCOPE,
    })
    const trend = fresh.heroes.find((h) => h.id === 9)!.why.find((f) => f.kind === 'noTrend')
    expect(trend).toEqual({ kind: 'noTrend', missing: 'previous' })
    expect(enFact(trend!)).toEqual({ id: 'noTrend', label: 'Trend', text: 'No matches in the 7 days before for this scope, so no trend can be computed.' })
  })
})

describe('slugify', () => {
  it('makes URL-safe hero slugs', () => {
    expect(slugify('Mo & Krill')).toBe('mo-and-krill')
    expect(slugify('The Doorman')).toBe('the-doorman')
  })
})
