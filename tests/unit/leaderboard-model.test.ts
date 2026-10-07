import { describe, expect, it } from 'vitest'
import { rankChange, scoreboardRows } from '@/features/leaderboard/model'
import { leaderboardHref, parseLeaderboardQuery } from '@/features/leaderboard/query'

/* Synthetic inputs only. */

describe('rankChange', () => {
  it('reports progress and a promotion when the badge moved', () => {
    expect(rankChange({ badge: 106, last_match: { start_time: 10, player_rank_initial_display_rank: 105, player_rank_desired_progress_change: 410 } })).toEqual({ delta: 410, badgeMove: 'up', at: 10_000 })
  })

  it('reports progress without a badge move', () => {
    expect(rankChange({ badge: 103, last_match: { start_time: 1, player_rank_initial_display_rank: 103, player_rank_desired_progress_change: -300 } })?.badgeMove).toBeNull()
  })

  it('returns null without a ranked match or for unranked players', () => {
    expect(rankChange({ badge: 0, last_match: { start_time: 1, player_rank_desired_progress_change: 5 } })).toBeNull()
    expect(rankChange({ badge: 90, last_match: null })).toBeNull()
  })
})

describe('scoreboardRows', () => {
  const ctx = {
    names: new Map([[7, 'Ann']]),
    changes: new Map(),
    badges: new Map([[8, 95]]),
    label: (b: number | null) => (b ? `B${b}` : null),
    tier: (b: number | null) => (b ? `T${Math.floor(b / 10)}` : null),
    winRate: true,
  }

  it('maps positions, names, badges and win-rate intervals', () => {
    const rows = scoreboardRows(
      [
        { rank: 0, account_id: 7, value: 0.9, matches: 50, badge: 116 },
        { rank: 1, account_id: 8, value: 0.6, matches: 200 },
      ],
      ctx,
    )
    expect(rows.map((r) => [r.position, r.name, r.badge, r.tierName])).toEqual([
      [1, 'Ann', 116, 'T11'],
      [2, 'Player 8', 95, 'T9'],
    ])
    expect(rows[0].interval!.low).toBeLessThan(0.9)
    expect(rows[0].sample).toBe('moderate')
    expect(rows[1].sample).toBe('high')
  })
})

describe('leaderboard query', () => {
  it('validates input and never allows the rank metric in the performance view', () => {
    const q = parseLeaderboardQuery({ view: 'performance', metric: 'rank', scope: 'Mars', min: '7' })
    expect(q).toMatchObject({ view: 'performance', metric: 'winrate', scope: 'global', min: 50 })
  })

  it('omits defaults and resets the page on filter changes', () => {
    const q = parseLeaderboardQuery({ scope: 'Europe', page: '3' })
    expect(leaderboardHref(q, { role: 'mystic' })).toBe('/leaderboard?scope=Europe&role=mystic')
    expect(leaderboardHref(q, { page: 2 })).toBe('/leaderboard?scope=Europe&page=2')
  })
})
