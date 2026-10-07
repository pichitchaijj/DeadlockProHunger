import { describe, expect, it } from 'vitest'
import { liveSummary, parseUtc, patchFor, rankName, toMatchRow } from '@/features/matches/model'
import { hasPerspective, matchesHref, parseMatchesQuery } from '@/features/matches/query'

/* Synthetic inputs only. */
const heroes = new Map([1, 2, 3, 4].map((id) => [id, { id, name: `H${id}`, slug: `h${id}`, iconUrl: null }]))
const tierNames = new Map([[8, 'Oracle']])

const raw = {
  match_id: 5,
  start_time: '2026-10-06 10:47:00',
  winning_team: 'Team1',
  duration_s: 1_900,
  match_mode: 'Ranked',
  average_badge: 84,
  players: [
    { account_id: 10, hero_id: 1, team: 'Team0', kills: 1, deaths: 2, assists: 3, net_worth: 30_000 },
    { account_id: 11, hero_id: 2, team: 'Team1', kills: 4, deaths: 0, assists: 5, net_worth: 40_000 },
  ],
}

describe('toMatchRow', () => {
  it('maps raw teams, badges and patches to readable values', () => {
    const row = toMatchRow(raw, { heroes, tierNames, patches: [{ title: '09-29-2026', day: Date.UTC(2026, 8, 29) / 1000 }], focusHeroId: null, focusAccountId: null, focusLabel: null })
    expect(row.teams.map((t) => `${t.label}:${t.won}`)).toEqual(['Team 1:false', 'Team 2:true'])
    expect(row.rank).toBe('Oracle IV')
    expect(row.patch).toBe('Sep 29')
    expect(row.focus).toBeNull()
    expect(row.teams[1].netWorth).toBe(40_000)
  })

  it('gives the filtered hero a perspective', () => {
    const row = toMatchRow(raw, { heroes, tierNames, patches: [], focusHeroId: 1, focusAccountId: null, focusLabel: null })
    expect(row.focus).toEqual({ label: 'H1', won: false, kda: '1 / 2 / 3' })
  })

  it('prefers the filtered player over the hero', () => {
    const row = toMatchRow(raw, { heroes, tierNames, patches: [], focusHeroId: 1, focusAccountId: 11, focusLabel: 'Someone' })
    expect(row.focus?.won).toBe(true)
    expect(row.focus?.label).toBe('Someone')
  })
})

describe('helpers', () => {
  it('reads UTC timestamps', () => {
    expect(parseUtc('2026-10-06 10:47:00')).toBe(Date.UTC(2026, 9, 6, 10, 47))
  })
  it('returns null rank for unranked averages', () => {
    expect(rankName(null, tierNames)).toBeNull()
    expect(rankName(0, tierNames)).toBeNull()
  })
  it('picks the latest patch before the match', () => {
    const patches = [{ title: 'new', day: 10 * 86_400 }, { title: 'old', day: 5 * 86_400 }]
    expect(patchFor(7 * 86_400_000, patches)).toBe('Jan 6')
    expect(patchFor(50_000, patches)).toBeNull()
  })
})

describe('liveSummary', () => {
  it('keeps normal mode only and maps enums', () => {
    const s = liveSummary(
      [
        { match_id: 1, game_mode_parsed: 'KECitadelGameModeNormal', match_mode_parsed: 'Ranked', spectators: 9, net_worth_team_0: 75, net_worth_team_1: 25, start_time: 0, players: [{ hero_id: 1, team: 0 }, { hero_id: 2, team: 1 }] },
        { match_id: 2, game_mode_parsed: 'KECitadelGameModeStreetBrawl', match_mode_parsed: 'Unranked', spectators: 99 },
      ],
      heroes,
      600_000,
    )
    expect(s.total).toBe(1)
    expect(s.ranked).toBe(1)
    expect(s.featured[0]).toMatchObject({ id: 1, minutes: 10, team1Share: 0.75, ranked: true })
    expect(s.featured[0].heroes.map((t) => t.map((h) => h.name))).toEqual([['H1'], ['H2']])
  })
})

describe('matches query', () => {
  it('drops the result filter without a hero or player perspective', () => {
    const q = parseMatchesQuery({ result: 'win' })
    expect(hasPerspective(q)).toBe(false)
    expect(matchesHref(q)).toBe('/matches')
    expect(matchesHref(q, { hero: 'h1' })).toBe('/matches?hero=h1&result=win')
  })
})
