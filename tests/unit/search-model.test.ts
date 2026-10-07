import { describe, expect, it } from 'vitest'
import { matchScore, normalize, searchAll } from '@/features/search/model'

/* Synthetic inputs only. */
const data = {
  heroes: [
    { id: 1, slug: 'vindicta', name: 'Vindicta', role: 'marksman', iconUrl: null },
    { id: 2, slug: 'mo-and-krill', name: 'Mo & Krill', role: 'brawler', iconUrl: null },
    { id: 3, slug: 'viscous', name: 'Viscous', role: 'mystic', iconUrl: null },
  ],
  items: [{ id: 9, slug: 'vampiric-burst', name: 'Vampiric Burst', slot: 'spirit', tier: 4, cost: 6200, icon: null }],
  patches: [{ title: '10-02-2026 Update', day: 1790985600, link: 'https://forums.example/1' }],
  builds: [{ id: 77, heroId: 1, name: 'Vindicta Meta Build', favorites: 1200 }],
  players: [{ accountId: 5, name: 'vindi_main', avatar: null, matches30d: 40 }],
}

describe('matching', () => {
  it('normalizes accents, ampersands and punctuation', () => {
    expect(normalize('Mo & Krill')).toBe('mo and krill')
    expect(matchScore('Mo & Krill', 'krill')).toBe(2)
    expect(matchScore('Vindicta', 'vin')).toBe(1)
    expect(matchScore('Vindicta', 'xyz')).toBe(-1)
    expect(matchScore('Mo & Krill', 'mo krill')).toBe(2)
  })
})

describe('searchAll', () => {
  it('groups results in a fixed order with hero shortcuts first', () => {
    const groups = searchAll('vind', data)
    expect(groups.map((g) => g.id)).toEqual(['heroes', 'builds', 'players', 'matches'])
    expect(groups[0].results[0].href).toBe('/heroes/vindicta')
    expect(groups[1].results.map((r) => r.label)).toEqual(['Vindicta builds', 'Vindicta Meta Build'])
    expect(groups[1].results[1].href).toBe('/builds/vindicta/77')
    expect(groups[2].results.map((r) => r.label)).toEqual(['Top Vindicta players', 'vindi_main'])
    expect(groups[3].results[0].href).toBe('/matches?hero=vindicta')
  })

  it('offers match and profile lookups for numeric queries', () => {
    const groups = searchAll('48123456', { ...data, builds: [], players: [] })
    expect(groups.flatMap((g) => g.results.map((r) => r.href))).toEqual(['/players/48123456', '/matches/48123456'])
  })

  it('links items to their item page and patches as external links', () => {
    const groups = searchAll('vamp', data)
    expect(groups.find((g) => g.id === 'items')!.results[0]).toMatchObject({ kind: 'internal', href: '/items/vampiric-burst', description: 'Spirit · Tier 4 · 6,200 souls' })
    expect(searchAll('update', data).find((g) => g.id === 'patches')!.results[0].kind).toBe('external')
  })

  it('drops fuzzy player matches from the upstream search', () => {
    const players = [
      { accountId: 1, name: 'Moses', avatar: null, matches30d: null },
      { accountId: 2, name: 'zzx', avatar: null, matches30d: null },
      { accountId: 3, name: 'oses7', avatar: null, matches30d: null },
    ]
    const groups = searchAll('oses', { ...data, players })
    expect(groups.find((g) => g.id === 'players')!.results.map((r) => r.label)).toEqual(['oses7', 'Moses'])
  })

  it('needs at least two characters', () => {
    expect(searchAll('v', data)).toEqual([])
  })
})
