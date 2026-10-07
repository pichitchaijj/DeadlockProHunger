import { describe, expect, it } from 'vitest'
import { buildMatchView, objectiveName } from '@/features/match/model'
import type { MatchDetailRaw } from '@/lib/deadlock/matchDetail'

/* Synthetic match (two players a side is enough for the rules under test). Not real data. */

function tick(t: number, nw: number, kills = 0) {
  return { time_stamp_s: t, net_worth: nw, kills, deaths: 0, assists: 0, player_damage: nw / 2, player_healing: 0, boss_damage: 0, creep_kills: 0, denies: 0, level: 1, player_damage_taken: 0 }
}

function player(slot: number, team: number, heroId: number, nws: number[], extra: Partial<MatchDetailRaw['match_info']['players'][number]> = {}) {
  const times = [180, 540, 900, 1_200, 1_500]
  return {
    account_id: 100 + slot,
    player_slot: slot,
    team,
    hero_id: heroId,
    kills: 0,
    deaths: 0,
    assists: 0,
    net_worth: nws.at(-1)!,
    last_hits: 10,
    denies: 1,
    level: 20,
    assigned_lane: 1,
    items: [],
    death_details: [],
    stats: nws.map((nw, i) => tick(times[i], nw)),
    ...extra,
  }
}

const raw: MatchDetailRaw = {
  match_info: {
    match_id: 9,
    start_time: 1_000,
    duration_s: 1_500,
    match_outcome: 0,
    winning_team: 1,
    game_mode: 1,
    match_mode: 4,
    average_badge_team0: 0,
    average_badge_team1: 84,
    objectives: [
      { team_objective_id: 1, team: 0, destroyed_time_s: 400 }, // Team 2 destroyed Team 1's lane-1 tier 1 (early)
      { team_objective_id: 5, team: 1, destroyed_time_s: 0 }, // still standing
      { team_objective_id: 0, team: 0, destroyed_time_s: 1_499 }, // Core, late
    ],
    mid_boss: [{ team_killed: 1, team_claimed: 1, destroyed_time_s: 1_300 }],
    players: [
      player(1, 0, 1, [1_000, 6_000, 12_000, 18_000, 22_000], { items: [{ game_time_s: 120, item_id: 50, sold_time_s: 0 }, { game_time_s: 700, item_id: 60, sold_time_s: 900 }] }),
      player(2, 0, 2, [1_000, 5_000, 9_000, 13_000, 16_000], { death_details: [{ game_time_s: 600, killer_player_slot: 3 }] }),
      player(3, 1, 3, [900, 4_000, 11_000, 20_000, 30_000]),
      player(4, 1, 4, [900, 4_000, 9_000, 15_000, 21_000], { death_details: [{ game_time_s: 200, killer_player_slot: 1 }] }),
    ],
  },
  hero_build_ids: { '101': 777 },
  pregame_hero_ids: { '102': 4 },
  banned_hero_ids: [],
}

const heroes = new Map([1, 2, 3, 4].map((id) => [id, { id, name: `H${id}`, slug: `h${id}`, iconUrl: null }]))
const items = new Map([
  [50, { id: 50, name: 'Small', slot: 'weapon', tier: 1, icon: null }],
  [60, { id: 60, name: 'Big', slot: 'spirit', tier: 3, icon: null }],
])
const view = buildMatchView(raw, { heroes, items, names: new Map([[101, 'Alice']]) })

describe('buildMatchView', () => {
  it('maps outcome, mode and teams readably', () => {
    expect(view.winner).toBe(1)
    expect(view.mode).toBe('Ranked')
    expect(view.averageBadge).toEqual([null, 84])
  })

  it('credits objectives to the team that destroyed them and skips standing ones', () => {
    const objectives = view.events.filter((e) => e.kind === 'objective')
    expect(objectives.map((e) => e.text)).toEqual(['Team 2 destroyed Team 1’s Tier 1 objective · Lane 1', 'Team 2 destroyed Team 1’s Core'])
    expect(view.teams[1].objectives).toBe(2)
  })

  it('builds kill events from death records with the killer’s team', () => {
    const kills = view.events.filter((e) => e.kind === 'kill')
    expect(kills.map((e) => [e.t, e.text, e.side])).toEqual([
      [200, 'H1 killed H4', 0],
      [600, 'H3 killed H2', 1],
    ])
  })

  it('lists only tier 3+ purchases as shared events, keeps all in the player', () => {
    expect(view.events.filter((e) => e.kind === 'purchase').map((e) => e.text)).toEqual(['H1 bought Big'])
    const alice = view.players.find((p) => p.name === 'Alice')!
    expect(alice.purchases.map((b) => [b.item.name, b.soldAt])).toEqual([
      ['Small', null],
      ['Big', 900],
    ])
    expect(alice.buildId).toBe(777)
  })

  it('records a pregame swap only when the hero changed', () => {
    expect(view.players.find((p) => p.accountId === 102)?.pregameHero?.name).toBe('H4')
  })

  it('computes the souls lead, lead changes and the biggest swing from ticks', () => {
    expect(view.times).toEqual([0, 180, 540, 900, 1_200, 1_500])
    expect(view.lead).toEqual([0, 200, 3_000, 1_000, -4_000, -13_000])
    expect(view.leadChanges).toEqual([{ t: 1_200, to: 1 }])
    expect(view.biggestSwing).toEqual({ from: 1_200, to: 1_500, side: 1, amount: 9_000 })
  })

  it('tells the story per phase with counts only', () => {
    expect(view.story.map((s) => s.label)).toEqual(['Early game', 'Mid game', 'Late game'])
    const [early, mid, late] = view.story
    expect(early.kills).toEqual([1, 0])
    expect(early.facts).toContain('Objectives destroyed: Team 2 1 (Tier 1 objective · Lane 1).')
    expect(early.facts.at(-1)).toBe('Souls lead: even at 0:00 → Team 1 +3K at 9:00 (Team 1 gained 3K).')
    expect(mid.facts).toContain('No objectives destroyed.')
    expect(late.midBoss).toBe('Team 2 killed and claimed the Mid-Boss')
  })
})

describe('objectiveName', () => {
  it('maps the enum readably', () => {
    expect(objectiveName(0)).toBe('Core')
    expect(objectiveName(6)).toBe('Tier 2 objective · Lane 2')
    expect(objectiveName(13)).toBe('Barracks objective · Lane 2')
  })
})
