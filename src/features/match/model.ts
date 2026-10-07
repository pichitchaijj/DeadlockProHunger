import { formatCompact, formatDuration } from '@/lib/format'
import type { MatchDetailRaw } from '@/lib/deadlock/matchDetail'

/*
 * Pure Match Detail model. Every value and sentence comes from measured match data:
 * counts, sums and differences at the times the game recorded them. No narrative is inferred.
 */

export type Side = 0 | 1
export const SIDE_LABEL: Record<Side, string> = { 0: 'Team 1', 1: 'Team 2' }

export type HeroLite = { id: number; name: string; slug: string; iconUrl: string | null }
export type ItemLite = { id: number; name: string | null; slot: string | null; tier: number | null; icon: string | null }

/** Readable names for the objective enum (values from the data-lake column definition). */
export function objectiveName(id: number): string {
  if (id === 0) return 'Core'
  if (id >= 1 && id <= 4) return `Tier 1 objective · Lane ${id}`
  if (id >= 5 && id <= 8) return `Tier 2 objective · Lane ${id - 4}`
  if (id === 9) return 'Titan'
  if (id === 10 || id === 11) return `Titan shield generator ${id - 9}`
  if (id >= 12 && id <= 15) return `Barracks objective · Lane ${id - 11}`
  return 'Objective'
}

export type PlayerView = {
  slot: number
  accountId: number
  name: string | null
  side: Side
  hero: HeroLite
  lane: number | null
  level: number
  kills: number
  deaths: number
  assists: number
  netWorth: number
  lastHits: number
  denies: number
  damage: number
  healing: number
  objectiveDamage: number
  damageTaken: number
  purchases: Array<{ item: ItemLite; t: number; soldAt: number | null }>
  /** Cumulative values at each recorded tick (t in seconds). */
  ticks: Array<{ t: number; netWorth: number; kills: number; deaths: number; damage: number }>
  buildId: number | null
  pregameHero: HeroLite | null
}

export type EventKind = 'kill' | 'objective' | 'midboss' | 'purchase'

export type MatchEvent = {
  id: string
  t: number
  kind: EventKind
  /** Side credited with the event (the killer's team, the team that destroyed the objective…). */
  side: Side | null
  text: string
  slots: number[]
  itemIcon?: ItemLite
}

export type StoryPhase = {
  key: 'early' | 'mid' | 'late'
  label: string
  from: number
  to: number
  kills: [number, number]
  objectives: [string[], string[]]
  midBoss: string | null
  leadStart: number
  leadEnd: number
  facts: string[]
}

export type MatchView = {
  id: number
  startedAt: number
  durationS: number
  mode: 'Ranked' | 'Unranked'
  outcome: 'win' | 'draw' | 'unfinished'
  winner: Side | null
  averageBadge: [number | null, number | null]
  flags: { highSkill: boolean; lowPriority: boolean; newPlayer: boolean; notScored: boolean }
  players: PlayerView[]
  teams: [TeamTotals, TeamTotals]
  events: MatchEvent[]
  /** Tick times, starting at 0. */
  times: number[]
  teamNetWorth: [number[], number[]]
  teamKills: [number[], number[]]
  /** Team 1 souls minus Team 2 souls at each tick. */
  lead: number[]
  leadChanges: Array<{ t: number; to: Side }>
  biggestSwing: { from: number; to: number; side: Side; amount: number } | null
  story: StoryPhase[]
  banned: HeroLite[]
}

export type TeamTotals = {
  side: Side
  kills: number
  deaths: number
  assists: number
  netWorth: number
  lastHits: number
  denies: number
  damage: number
  healing: number
  objectives: number
  midBoss: number
}

type Ctx = {
  heroes: Map<number, HeroLite>
  items: Map<number, ItemLite>
  names: Map<number, string>
}

const unknownHero = (id: number): HeroLite => ({ id, name: 'Unknown hero', slug: '', iconUrl: null })
const toSide = (team: number): Side => (team === 1 ? 1 : 0)

/** Phase boundaries align with the game's stat sampling (ticks at 9:00 and 20:00). */
export const PHASES = [
  { key: 'early', label: 'Early game', from: 0, to: 540 },
  { key: 'mid', label: 'Mid game', from: 540, to: 1_200 },
  { key: 'late', label: 'Late game', from: 1_200, to: Infinity },
] as const

export function buildMatchView(raw: MatchDetailRaw, ctx: Ctx): MatchView {
  const info = raw.match_info
  const bySlot = new Map(info.players.map((p) => [p.player_slot, p]))
  const heroOf = (heroId: number) => ctx.heroes.get(heroId) ?? unknownHero(heroId)

  const players: PlayerView[] = info.players
    .map((p) => {
      const last = p.stats.at(-1)
      const buildId = raw.hero_build_ids?.[String(p.account_id)] ?? null
      const pregame = raw.pregame_hero_ids?.[String(p.account_id)]
      return {
        slot: p.player_slot,
        accountId: p.account_id,
        name: ctx.names.get(p.account_id) ?? null,
        side: toSide(p.team),
        hero: heroOf(p.hero_id),
        lane: p.assigned_lane ?? null,
        level: p.level,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        netWorth: p.net_worth,
        lastHits: p.last_hits,
        denies: p.denies,
        damage: last?.player_damage ?? 0,
        healing: last?.player_healing ?? 0,
        objectiveDamage: last?.boss_damage ?? 0,
        damageTaken: last?.player_damage_taken ?? 0,
        purchases: p.items
          .filter((i) => ctx.items.has(i.item_id))
          .map((i) => ({ item: ctx.items.get(i.item_id)!, t: i.game_time_s, soldAt: i.sold_time_s > 0 ? i.sold_time_s : null }))
          .sort((a, b) => a.t - b.t),
        ticks: p.stats.map((s) => ({ t: s.time_stamp_s, netWorth: s.net_worth, kills: s.kills, deaths: s.deaths, damage: s.player_damage })),
        buildId,
        pregameHero: pregame && pregame !== p.hero_id ? heroOf(pregame) : null,
      }
    })
    .sort((a, b) => a.side - b.side || b.netWorth - a.netWorth)

  // ── Events ──
  const events: MatchEvent[] = []
  for (const p of info.players) {
    for (const [n, d] of p.death_details.entries()) {
      const killer = bySlot.get(d.killer_player_slot)
      const victim = heroOf(p.hero_id).name
      events.push({
        id: `k-${p.player_slot}-${n}`,
        t: d.game_time_s,
        kind: 'kill',
        side: killer ? toSide(killer.team) : toSide(1 - p.team),
        text: killer ? `${heroOf(killer.hero_id).name} killed ${victim}` : `${victim} died`,
        slots: killer ? [killer.player_slot, p.player_slot] : [p.player_slot],
      })
    }
  }
  for (const o of info.objectives) {
    if (o.destroyed_time_s <= 0) continue
    const owner = toSide(o.team)
    events.push({
      id: `o-${o.team}-${o.team_objective_id}`,
      t: o.destroyed_time_s,
      kind: 'objective',
      side: owner === 0 ? 1 : 0,
      text: `${SIDE_LABEL[owner === 0 ? 1 : 0]} destroyed ${SIDE_LABEL[owner]}’s ${objectiveName(o.team_objective_id)}`,
      slots: [],
    })
  }
  for (const [n, b] of (info.mid_boss ?? []).entries()) {
    const killed = toSide(b.team_killed)
    const claimed = toSide(b.team_claimed)
    events.push({
      id: `m-${n}`,
      t: b.destroyed_time_s,
      kind: 'midboss',
      side: claimed,
      text: killed === claimed ? `${SIDE_LABEL[killed]} killed and claimed the Mid-Boss` : `${SIDE_LABEL[killed]} killed the Mid-Boss; ${SIDE_LABEL[claimed]} claimed it`,
      slots: [],
    })
  }
  for (const p of players) {
    for (const [n, buy] of p.purchases.entries()) {
      if ((buy.item.tier ?? 0) < 3) continue // tier 3+ only in the shared event list; the timeline shows all for a selected player
      events.push({ id: `p-${p.slot}-${n}`, t: buy.t, kind: 'purchase', side: p.side, text: `${p.hero.name} bought ${buy.item.name ?? 'an item'}`, slots: [p.slot], itemIcon: buy.item })
    }
  }
  events.sort((a, b) => a.t - b.t)

  // ── Series ──
  const tickTimes = [...new Set(info.players.flatMap((p) => p.stats.map((s) => s.time_stamp_s)))].sort((a, b) => a - b)
  const times = [0, ...tickTimes]
  const at = (p: (typeof info.players)[number], t: number) => p.stats.find((s) => s.time_stamp_s === t)
  const sumAt = (side: Side, t: number, key: 'net_worth' | 'kills') =>
    t === 0 ? 0 : info.players.filter((p) => toSide(p.team) === side).reduce((n, p) => n + (at(p, t)?.[key] ?? 0), 0)
  const teamNetWorth: [number[], number[]] = [times.map((t) => sumAt(0, t, 'net_worth')), times.map((t) => sumAt(1, t, 'net_worth'))]
  const teamKills: [number[], number[]] = [times.map((t) => sumAt(0, t, 'kills')), times.map((t) => sumAt(1, t, 'kills'))]
  const lead = times.map((_, i) => teamNetWorth[0][i] - teamNetWorth[1][i])

  const leadChanges: MatchView['leadChanges'] = []
  let current: Side | null = null
  for (const [i, value] of lead.entries()) {
    if (value === 0) continue
    const side: Side = value > 0 ? 0 : 1
    if (current !== null && side !== current) leadChanges.push({ t: times[i], to: side })
    current = side
  }
  let biggestSwing: MatchView['biggestSwing'] = null
  for (let i = 1; i < lead.length; i++) {
    const delta = lead[i] - lead[i - 1]
    if (!biggestSwing || Math.abs(delta) > biggestSwing.amount) biggestSwing = { from: times[i - 1], to: times[i], side: delta >= 0 ? 0 : 1, amount: Math.abs(delta) }
  }

  // ── Totals ──
  const totals = (side: Side): TeamTotals => {
    const ps = players.filter((p) => p.side === side)
    const sum = (k: 'kills' | 'deaths' | 'assists' | 'netWorth' | 'lastHits' | 'denies' | 'damage' | 'healing') => ps.reduce((n, p) => n + p[k], 0)
    return {
      side,
      kills: sum('kills'),
      deaths: sum('deaths'),
      assists: sum('assists'),
      netWorth: sum('netWorth'),
      lastHits: sum('lastHits'),
      denies: sum('denies'),
      damage: sum('damage'),
      healing: sum('healing'),
      objectives: events.filter((e) => e.kind === 'objective' && e.side === side).length,
      midBoss: events.filter((e) => e.kind === 'midboss' && e.side === side).length,
    }
  }

  const durationS = info.duration_s
  return {
    id: info.match_id,
    startedAt: info.start_time * 1000,
    durationS,
    mode: info.match_mode === 4 ? 'Ranked' : 'Unranked',
    outcome: info.match_outcome === 0 ? 'win' : info.match_outcome === 2 ? 'draw' : 'unfinished',
    winner: info.match_outcome === 0 ? toSide(info.winning_team) : null,
    averageBadge: [info.average_badge_team0 || null, info.average_badge_team1 || null],
    flags: {
      highSkill: Boolean(info.is_high_skill_range_parties),
      lowPriority: Boolean(info.low_pri_pool),
      newPlayer: Boolean(info.new_player_pool),
      notScored: Boolean(info.not_scored),
    },
    players,
    teams: [totals(0), totals(1)],
    events,
    times,
    teamNetWorth,
    teamKills,
    lead,
    leadChanges,
    biggestSwing,
    story: matchStory(events, times, lead, durationS),
    banned: (raw.banned_hero_ids ?? []).map(heroOf),
  }
}

/** Lead at the latest tick at or before `t` (ticks are where the game measured). */
function leadAt(times: number[], lead: number[], t: number): { t: number; value: number } {
  let index = 0
  for (const [i, time] of times.entries()) if (time <= t) index = i
  return { t: times[index], value: lead[index] }
}

function leadText(value: number): string {
  if (value === 0) return 'even'
  return `${SIDE_LABEL[value > 0 ? 0 : 1]} +${formatCompact(Math.abs(value))}`
}

/**
 * Early / mid / late facts: kills, objectives, Mid-Boss, and the souls lead at the phase's
 * measured start and end. Phases the match didn't reach are omitted.
 */
export function matchStory(events: MatchEvent[], times: number[], lead: number[], durationS: number): StoryPhase[] {
  return PHASES.filter((phase) => phase.from < durationS).map((phase) => {
    const to = Math.min(phase.to, durationS)
    const inPhase = events.filter((e) => e.t >= phase.from && e.t < (phase.to === Infinity ? Infinity : phase.to))
    const kills: [number, number] = [0, 1].map((s) => inPhase.filter((e) => e.kind === 'kill' && e.side === s).length) as [number, number]
    const objectives: [string[], string[]] = [0, 1].map((s) =>
      inPhase.filter((e) => e.kind === 'objective' && e.side === s).map((e) => e.text.replace(/^Team \d destroyed Team \d’s /, '')),
    ) as [string[], string[]]
    const boss = inPhase.find((e) => e.kind === 'midboss')
    const start = leadAt(times, lead, phase.from)
    const end = leadAt(times, lead, to)
    const change = end.value - start.value

    const facts = [`Kills: Team 1 ${kills[0]}, Team 2 ${kills[1]}.`]
    const objectiveLine = (s: 0 | 1) => (objectives[s].length ? `${SIDE_LABEL[s]} ${objectives[s].length} (${objectives[s].join(', ')})` : null)
    const objectiveParts = [objectiveLine(0), objectiveLine(1)].filter(Boolean)
    facts.push(objectiveParts.length ? `Objectives destroyed: ${objectiveParts.join('; ')}.` : 'No objectives destroyed.')
    if (boss) facts.push(`${boss.text} at ${formatDuration(boss.t)}.`)
    facts.push(
      `Souls lead: ${leadText(start.value)} at ${formatDuration(start.t)} → ${leadText(end.value)} at ${formatDuration(end.t)}` +
        (change === 0 ? '.' : ` (${SIDE_LABEL[change > 0 ? 0 : 1]} gained ${formatCompact(Math.abs(change))}).`),
    )
    return { key: phase.key, label: phase.label, from: phase.from, to, kills, objectives, midBoss: boss?.text ?? null, leadStart: start.value, leadEnd: end.value, facts }
  })
}
