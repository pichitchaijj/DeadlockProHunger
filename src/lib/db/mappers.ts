/*
 * Pure mappers: validated API shapes → table rows. No I/O, so they're unit-tested directly.
 * Inputs are typed structurally (not imported from the server-only endpoint modules).
 */
import type { abilityOrders, builds, buildItems, heroMatchups, heroStatsSnapshots, heroSynergies, matchEvents, matchHeroes, matchPlayers, matches, patches, playerHeroStats, playerRankSnapshots } from './schema'

type Insert<T extends { $inferInsert: unknown }> = T['$inferInsert']
export type RankBand = 'all' | 'low' | 'mid' | 'high' | 'top'

const fromUnix = (s: number | null | undefined) => (s ? new Date(s * 1000) : null)
/** UTC calendar day ('YYYY-MM-DD') of a unix-seconds timestamp. */
export const utcDay = (unixS: number) => new Date(unixS * 1000).toISOString().slice(0, 10)

// ── Hero analytics ───────────────────────────────────────────────────

export type ApiHeroDay = {
  hero_id: number
  bucket: number
  wins: number
  losses: number
  matches: number
  total_kills: number
  total_deaths: number
  total_assists: number
  total_net_worth: number
  total_player_damage?: number | null
  total_player_damage_taken?: number | null
  total_boss_damage?: number | null
}

export function heroStatsRows(rows: ApiHeroDay[], rankBand: RankBand): Insert<typeof heroStatsSnapshots>[] {
  return rows.map((r) => ({
    day: utcDay(r.bucket),
    heroId: r.hero_id,
    rankBand,
    matches: r.matches,
    wins: r.wins,
    losses: r.losses,
    kills: r.total_kills,
    deaths: r.total_deaths,
    assists: r.total_assists,
    netWorth: r.total_net_worth,
    playerDamage: r.total_player_damage ?? null,
    damageTaken: r.total_player_damage_taken ?? null,
    objectiveDamage: r.total_boss_damage ?? null,
    syncedAt: new Date(),
  }))
}

export function matchupRows(day: string, rankBand: RankBand, sameLane: boolean, rows: Array<{ hero_id: number; enemy_hero_id: number; wins: number; matches_played: number }>): Insert<typeof heroMatchups>[] {
  return rows.map((r) => ({ day, heroId: r.hero_id, enemyHeroId: r.enemy_hero_id, rankBand, sameLane, matches: r.matches_played, wins: r.wins, syncedAt: new Date() }))
}

/** Pairs are stored once with hero_id_1 < hero_id_2; duplicates (either order) are merged by max matches. */
export function synergyRows(day: string, rankBand: RankBand, rows: Array<{ hero_id1: number; hero_id2: number; wins: number; matches_played: number }>): Insert<typeof heroSynergies>[] {
  const byPair = new Map<string, Insert<typeof heroSynergies>>()
  for (const r of rows) {
    if (r.hero_id1 === r.hero_id2) continue
    const [a, b] = r.hero_id1 < r.hero_id2 ? [r.hero_id1, r.hero_id2] : [r.hero_id2, r.hero_id1]
    const key = `${a}:${b}`
    const prev = byPair.get(key)
    if (!prev || r.matches_played > prev.matches) byPair.set(key, { day, heroId1: a, heroId2: b, rankBand, matches: r.matches_played, wins: r.wins, syncedAt: new Date() })
  }
  return [...byPair.values()]
}

/** The `topN` most-played sequences for one hero, over a rolling window. */
export function abilityOrderRows(
  snapshotDay: string,
  heroId: number,
  rankBand: RankBand,
  window: { start: Date; end: Date },
  rows: Array<{ abilities: number[]; wins: number; matches: number }>,
  topN = 10,
): Insert<typeof abilityOrders>[] {
  return [...rows]
    .filter((r) => r.abilities.length > 0)
    .sort((a, b) => b.matches - a.matches)
    .slice(0, topN)
    .map((r) => ({ snapshotDay, heroId, rankBand, sequenceKey: r.abilities.join('-'), abilities: r.abilities, matches: r.matches, wins: r.wins, windowStart: window.start, windowEnd: window.end }))
}

// ── Builds ───────────────────────────────────────────────────────────

export type ApiBuild = {
  hero_build: {
    hero_build_id: number
    hero_id: number
    author_account_id: number
    name: string
    version?: number | null
    language?: number | null
    tags?: number[] | null
    last_updated_timestamp?: number | null
    publish_timestamp?: number | null
    details: { mod_categories?: Array<{ name: string; mods?: Array<{ ability_id: number }> | null }> | null }
  }
  num_weekly_favorites?: number | null
  num_favorites?: number | null
}

export function buildRows(b: ApiBuild): { build: Insert<typeof builds>; items: Insert<typeof buildItems>[] } {
  const hb = b.hero_build
  const items = (hb.details.mod_categories ?? []).flatMap((cat, categoryIndex) =>
    (cat.mods ?? []).map((m, position) => ({ buildId: hb.hero_build_id, categoryIndex, position, itemId: m.ability_id, categoryName: cat.name || null })),
  )
  return {
    build: {
      buildId: hb.hero_build_id,
      version: hb.version ?? 1,
      heroId: hb.hero_id,
      name: hb.name.trim() || 'Untitled build',
      authorAccountId: hb.author_account_id,
      language: hb.language ?? null,
      tags: hb.tags ?? null,
      weeklyFavorites: b.num_weekly_favorites ?? null,
      favorites: b.num_favorites ?? null,
      publishedAt: fromUnix(hb.publish_timestamp),
      updatedAt: fromUnix(hb.last_updated_timestamp),
      syncedAt: new Date(),
    },
    items,
  }
}

// ── Patches ──────────────────────────────────────────────────────────

export function patchRow(p: { guid: string; source: string; title: string; link: string | null; effectiveAtS: number; postedAt: string | null; excerpt: string | null }): Insert<typeof patches> {
  const posted = p.postedAt ? new Date(p.postedAt) : null
  return {
    guid: p.guid,
    source: p.source,
    title: p.title.trim(),
    link: p.link,
    effectiveAt: new Date(p.effectiveAtS * 1000),
    postedAt: posted && Number.isFinite(posted.getTime()) ? posted : null,
    excerpt: p.excerpt,
    syncedAt: new Date(),
  }
}

// ── Players ──────────────────────────────────────────────────────────

export function rankObservation(
  accountId: number,
  rank: { badge: number; rank?: number | null; subrank?: number | null; last_match?: { match_id?: number | null; start_time?: number | null } | null },
  source: 'profile' | 'leaderboard' | 'match',
): Insert<typeof playerRankSnapshots> {
  return {
    accountId,
    badge: rank.badge,
    rankTier: rank.rank ?? null,
    subrank: rank.subrank ?? null,
    lastMatchId: rank.last_match?.match_id ?? null,
    lastMatchAt: fromUnix(rank.last_match?.start_time),
    source,
  }
}

export function playerHeroStatsRows(
  accountId: number,
  rows: Array<{ hero_id: number; matches_played: number; wins: number; kills: number; deaths: number; assists: number; last_played?: number | null }>,
): Insert<typeof playerHeroStats>[] {
  return rows
    .filter((r) => r.matches_played > 0)
    .map((r) => ({ accountId, heroId: r.hero_id, matches: r.matches_played, wins: r.wins, kills: r.kills, deaths: r.deaths, assists: r.assists, lastPlayedAt: fromUnix(r.last_played), fetchedAt: new Date() }))
}

// ── Matches ──────────────────────────────────────────────────────────

export type ApiMatchDetail = {
  match_info: {
    match_id: number
    start_time: number
    duration_s: number
    winning_team: number
    game_mode: number
    match_mode: number
    average_badge_team0?: number | null
    average_badge_team1?: number | null
    not_scored?: boolean | null
    objectives: Array<{ team_objective_id: number; team: number; destroyed_time_s: number }>
    mid_boss?: Array<{ team_killed: number; team_claimed: number; destroyed_time_s: number }> | null
    players: Array<{
      account_id: number
      player_slot: number
      team: number
      hero_id: number
      kills: number
      deaths: number
      assists: number
      net_worth: number
      last_hits: number
      denies: number
      level: number
      assigned_lane?: number | null
      death_details: Array<{ game_time_s: number; killer_player_slot: number }>
    }>
  }
  hero_build_ids?: Record<string, number> | null
  pregame_hero_ids?: Record<string, number> | null
  banned_hero_ids?: number[] | null
}

/**
 * One finished match → its rows. Events: every death (actor = killer slot, target = victim),
 * every destroyed objective (team = the destroyer; upstream `team` is the OWNER), and mid-boss
 * claims. `winning_team` outside 0/1 means no winner (e.g. abandoned) → `won` stays null.
 */
export function matchRows(d: ApiMatchDetail) {
  const info = d.match_info
  const startedAt = new Date(info.start_time * 1000)
  const winner = info.winning_team === 0 || info.winning_team === 1 ? info.winning_team : null
  const slotTeam = new Map(info.players.map((p) => [p.player_slot, p.team]))

  const match: Insert<typeof matches> = {
    matchId: info.match_id,
    startedAt,
    durationS: info.duration_s,
    gameMode: info.game_mode,
    matchMode: info.match_mode,
    winningTeam: winner,
    averageBadgeTeam0: info.average_badge_team0 ?? null,
    averageBadgeTeam1: info.average_badge_team1 ?? null,
    notScored: info.not_scored ?? null,
    detail: d,
  }

  const playerRows: Insert<typeof matchPlayers>[] = info.players.map((p) => ({
    matchId: info.match_id,
    playerSlot: p.player_slot,
    accountId: p.account_id,
    team: p.team,
    heroId: p.hero_id,
    won: winner === null ? null : p.team === winner,
    lane: p.assigned_lane ?? null,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    netWorth: p.net_worth,
    lastHits: p.last_hits,
    denies: p.denies,
    level: p.level,
    heroBuildId: d.hero_build_ids?.[String(p.account_id)] ?? null,
    startedAt,
  }))

  const heroes = new Map<string, Insert<typeof matchHeroes>>()
  for (const p of info.players) {
    heroes.set(`${p.hero_id}:picked`, { matchId: info.match_id, heroId: p.hero_id, kind: 'picked', team: p.team, won: winner === null ? null : p.team === winner, startedAt })
    const pre = d.pregame_hero_ids?.[String(p.account_id)]
    if (pre && pre !== p.hero_id) heroes.set(`${pre}:swapped_from`, { matchId: info.match_id, heroId: pre, kind: 'swapped_from', team: p.team, won: null, startedAt })
  }
  for (const h of d.banned_hero_ids ?? []) heroes.set(`${h}:banned`, { matchId: info.match_id, heroId: h, kind: 'banned', team: null, won: null, startedAt })

  const events: Insert<typeof matchEvents>[] = [
    ...info.players.flatMap((p) =>
      p.death_details.map((dd) => ({ matchId: info.match_id, timeS: Math.round(dd.game_time_s), kind: 'kill', team: slotTeam.get(dd.killer_player_slot) ?? null, actorSlot: dd.killer_player_slot, targetSlot: p.player_slot, objectiveId: null })),
    ),
    ...info.objectives
      .filter((o) => o.destroyed_time_s > 0)
      .map((o) => ({ matchId: info.match_id, timeS: Math.round(o.destroyed_time_s), kind: 'objective', team: o.team === 0 ? 1 : o.team === 1 ? 0 : null, actorSlot: null, targetSlot: null, objectiveId: o.team_objective_id })),
    ...(info.mid_boss ?? [])
      .filter((m) => m.destroyed_time_s > 0)
      .map((m) => ({ matchId: info.match_id, timeS: Math.round(m.destroyed_time_s), kind: 'mid_boss', team: m.team_claimed, actorSlot: null, targetSlot: null, objectiveId: null })),
  ].sort((a, b) => a.timeS - b.timeS)

  return { match, players: playerRows, heroes: [...heroes.values()], events }
}

// ── Snapshots ────────────────────────────────────────────────────────

/** Stable key: endpoint + sorted, non-empty params. Same request → same key. */
export function snapshotKey(endpoint: string, params: Record<string, unknown>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : String(v)}`)
  return `${endpoint}?${parts.join('&')}`
}

/** Key of the daily leaderboard snapshot for a region (written by the daily job, read on failure). */
export const leaderboardSnapshotKey = (region: string) => snapshotKey('/v1/leaderboard/{region}', { region })
