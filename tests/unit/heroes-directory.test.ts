import { describe, expect, it } from 'vitest'
import { filterHeroes, normalize } from '@/features/heroes/filter'
import type { DirectoryHero } from '@/features/heroes/loaders'
import { DEFAULT_VIEW, heroesHref, parseView } from '@/features/heroes/query'

/** Synthetic test heroes (not real statistics). */
function hero(name: string, role: string, complexity: number, winRate: number | null): DirectoryHero {
  return {
    slug: name.toLowerCase().replace(/\W+/g, '-'),
    name,
    role,
    complexity,
    cardSrc: null,
    stats:
      winRate === null
        ? null
        : { winRate, pickRate: winRate / 2, matches: 1_000, sample: 'moderate', interval: { low: winRate - 0.02, high: winRate + 0.02 }, trend: null },
  }
}

const heroes = [
  hero('Mo & Krill', 'brawler', 3, 0.5),
  hero('Ivy', 'marksman', 3, 0.53),
  hero('Abrams', 'brawler', 1, 0.49),
  hero('Newcomer', 'mystic', 2, null),
]

describe('normalize', () => {
  it('drops punctuation and case', () => {
    expect(normalize('Mo & Krill')).toBe('mo krill')
  })
})

describe('filterHeroes', () => {
  it('searches names forgivingly, all terms required', () => {
    expect(filterHeroes(heroes, { ...DEFAULT_VIEW, q: 'mo krill' }).map((h) => h.name)).toEqual(['Mo & Krill'])
    expect(filterHeroes(heroes, { ...DEFAULT_VIEW, q: 'IVY' }).map((h) => h.name)).toEqual(['Ivy'])
  })

  it('combines role and complexity filters', () => {
    expect(filterHeroes(heroes, { ...DEFAULT_VIEW, role: 'brawler', complexity: 1 }).map((h) => h.name)).toEqual(['Abrams'])
  })

  it('sorts by a metric with no-data heroes last', () => {
    expect(filterHeroes(heroes, { ...DEFAULT_VIEW, sort: 'winRate' }).map((h) => h.name)).toEqual(['Ivy', 'Mo & Krill', 'Abrams', 'Newcomer'])
  })
})

describe('directory URL state', () => {
  it('round-trips through the URL and drops defaults', () => {
    const view = parseView({ q: 'ivy', role: 'marksman', complexity: '3', sort: 'pickRate' })
    expect(heroesHref({ window: '7d', rank: 'all' }, view)).toBe('/heroes?q=ivy&role=marksman&complexity=3&sort=pickRate')
    expect(heroesHref({ window: '7d', rank: 'all' }, DEFAULT_VIEW)).toBe('/heroes')
  })

  it('ignores invalid values', () => {
    expect(parseView({ role: 'healer', complexity: '9', sort: 'random' })).toEqual(DEFAULT_VIEW)
  })
})
