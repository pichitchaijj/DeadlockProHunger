import { describe, expect, it } from 'vitest'
import { filterLeaderboard, heroPool, leaderboardRows, peers, profileModel, rankLabel } from '@/features/players/model'
import { parsePlayersQuery, playersHref } from '@/features/players/query'

/* Synthetic inputs only. */
const heroes = new Map([
  [1, { id: 1, name: 'H1', slug: 'h1', iconUrl: null, role: 'brawler' }],
  [2, { id: 2, name: 'H2', slug: 'h2', iconUrl: null, role: 'mystic' }],
])

describe('leaderboard', () => {
  const rows = leaderboardRows(
    [
      { account_name: 'Solo', possible_account_ids: [10], rank: 1, top_hero_ids: [1, 2] },
      { account_name: 'Ambiguous', possible_account_ids: [11, 12], rank: 2, top_hero_ids: [2] },
      { account_name: ' ', possible_account_ids: [], rank: 3, top_hero_ids: [] },
    ],
    heroes,
    new Map([[10, 106]]),
  )

  it('links only unambiguous identities', () => {
    expect(rows.map((r) => [r.name, r.accountId, r.possibleAccounts])).toEqual([
      ['Solo', 10, 1],
      ['Ambiguous', null, 2],
      ['Unnamed', null, 0],
    ])
    expect(rows[0].badge).toBe(106)
    expect(rows[1].badge).toBeNull()
  })

  it('filters by main role and rank band, excluding unknowns only when filtering', () => {
    expect(filterLeaderboard(rows, { role: 'all', rank: 'all' })).toHaveLength(3)
    expect(filterLeaderboard(rows, { role: 'mystic', rank: 'all' }).map((r) => r.name)).toEqual(['Ambiguous'])
    expect(filterLeaderboard(rows, { role: 'all', rank: 'top' }).map((r) => r.name)).toEqual(['Solo'])
  })
})

describe('profileModel', () => {
  const day = 86_400
  const history = Array.from({ length: 45 }, (_, i) => ({
    match_id: i,
    hero_id: 1,
    start_time: 1_000_000 + i * day,
    game_mode: 1,
    match_mode: i % 3 === 0 ? 4 : 1,
    match_duration_s: 1_800,
    player_kills: 5,
    player_deaths: 3,
    player_assists: 7,
    net_worth: 30_000,
    last_hits: 100,
    // first 20 (oldest) lose, then the rest win; one penalized. Outcome 0 (unset) still counts.
    player_team: 0,
    match_result: i < 20 ? 1 : 0,
    player_match_outcome: i === 44 ? 3 : i % 2 === 0 ? 0 : i < 20 ? 2 : 1,
    ranked_display_badge: i % 3 === 0 ? 80 + (i % 7) : null,
  }))
  history.push({ ...history[0], match_id: 999, game_mode: 4 }) // street brawl: ignored

  const p = profileModel(history, heroes)

  it('counts normal ranked/unranked only and excludes penalized outcomes from win rates', () => {
    expect(p.counted).toBe(45)
    expect(p.excluded).toBe(1)
    expect(p.overall.matches).toBe(44)
    expect(p.overall.wins).toBe(24)
  })

  it('splits history into 20-match blocks and compares the last two by interval', () => {
    expect(p.trend.map((b) => b.wins)).toEqual([0, 20])
    expect(p.trendChange).toBe('higher')
  })

  it('orders matches newest first and keeps ranked badge points chronological', () => {
    expect(p.matches[0].id).toBe(44)
    expect(p.rankPoints[0].t).toBeLessThan(p.rankPoints.at(-1)!.t)
  })
})

describe('heroPool and peers', () => {
  it('sorts by matches with player-scale sample tiers', () => {
    const pool = heroPool(
      [
        { hero_id: 1, matches_played: 10, wins: 6, kills: 50, deaths: 30, assists: 70 },
        { hero_id: 2, matches_played: 150, wins: 80, kills: 750, deaths: 450, assists: 1_050 },
        { hero_id: 9, matches_played: 5, wins: 5, kills: 1, deaths: 1, assists: 1 },
      ],
      heroes,
    )
    expect(pool.map((h) => [h.name, h.sample])).toEqual([
      ['H2', 'high'],
      ['H1', 'low'],
    ])
    expect(pool[0].kda[0]).toBeCloseTo(5)
  })

  it('ranks peers by shared matches', () => {
    const list = peers([{ id: 1, wins: 5, matches_played: 10 }, { id: 2, wins: 30, matches_played: 40 }], new Map([[2, 'Bob']]))
    expect(list.map((x) => [x.name, x.sample])).toEqual([
      ['Bob', 'moderate'],
      [null, 'low'],
    ])
  })
})

describe('helpers', () => {
  it('labels ranks and round-trips the query', () => {
    expect(rankLabel(106, new Map([[10, 'Ascendant']]))).toBe('Ascendant VI')
    expect(rankLabel(0, new Map())).toBeNull()
    const q = parsePlayersQuery({ q: ' abc ', rank: 'nope' })
    expect(q).toEqual({ q: 'abc', rank: 'all' })
    expect(playersHref(q, { rank: 'top' })).toBe('/players?q=abc&rank=top')
  })
})
