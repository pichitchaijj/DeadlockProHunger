import { badgeRange, rankBand, type RankBandId } from '@/lib/analytics/rankBands'
import { sampleTier, type SampleTier } from '@/lib/analytics/sampleTier'
import { wilsonInterval, type Interval } from '@/lib/analytics/wilson'

/*
 * Pure Players model. Win rates always carry n and a 95% interval on the per-player scale.
 * Nothing here rates skill: the profile states results, never "good"/"bad" judgments.
 */

const NUMERALS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI']

export type HeroLite = { id: number; name: string; slug: string; iconUrl: string | null; role: string | null }

export function rankLabel(badge: number | null | undefined, tierNames: Map<number, string>): string | null {
  if (!badge) return null
  const tier = Math.floor(badge / 10)
  return `${tierNames.get(tier) ?? `Tier ${tier}`} ${NUMERALS[badge % 10] ?? ''}`.trim()
}

export type Record_ = { wins: number; matches: number; winRate: number; interval: Interval; sample: SampleTier }

export function record(wins: number, matches: number): Record_ {
  return { wins, matches, winRate: matches > 0 ? wins / matches : 0, interval: wilsonInterval(wins, matches), sample: sampleTier(matches, 'player') }
}

// ── Leaderboard ──────────────────────────────────────────────────────

export type LeaderboardRow = {
  position: number
  name: string
  /** Only set when the entry maps to exactly one account; otherwise identity is ambiguous. */
  accountId: number | null
  possibleAccounts: number
  topHeroes: HeroLite[]
  /** Role of the first listed top hero (the leaderboard's own ordering). */
  mainRole: string | null
  badge: number | null
}

type RawEntry = { account_name?: string | null; possible_account_ids?: number[] | null; rank?: number | null; top_hero_ids?: number[] | null }

export function leaderboardRows(entries: RawEntry[], heroes: Map<number, HeroLite>, badges: Map<number, number>): LeaderboardRow[] {
  return entries.map((e, i) => {
    const ids = e.possible_account_ids ?? []
    const accountId = ids.length === 1 ? ids[0] : null
    const topHeroes = (e.top_hero_ids ?? []).map((id) => heroes.get(id)).filter((h): h is HeroLite => Boolean(h))
    return {
      position: e.rank ?? i + 1,
      name: e.account_name?.trim() || 'Unnamed',
      accountId,
      possibleAccounts: ids.length,
      topHeroes,
      mainRole: topHeroes[0]?.role ?? null,
      badge: accountId !== null ? (badges.get(accountId) ?? null) : null,
    }
  })
}

/** Role and rank filters. Rows whose rank or role is unknown are excluded only when that filter is active. */
export function filterLeaderboard(rows: LeaderboardRow[], filters: { role: string; rank: RankBandId }) {
  const range = badgeRange(rankBand(filters.rank))
  return rows.filter((r) => {
    if (filters.role !== 'all' && r.mainRole !== filters.role) return false
    if (range && (r.badge === null || r.badge < range.min || r.badge > range.max)) return false
    return true
  })
}

// ── Profile ──────────────────────────────────────────────────────────

type HistoryRow = {
  match_id: number
  hero_id: number
  start_time: number
  game_mode: number
  match_mode: number
  match_duration_s: number
  player_kills: number
  player_deaths: number
  player_assists: number
  net_worth: number
  last_hits: number
  match_result: number
  player_team: number
  player_match_outcome: number
  ranked_display_badge?: number | null
  ranked_delta?: number | null
}

export type HistoryMatch = {
  id: number
  hero: HeroLite
  startedAt: number
  durationS: number
  ranked: boolean
  result: 'win' | 'loss' | 'other'
  kda: [number, number, number]
  netWorth: number
  lastHits: number
  badgeAfter: number | null
}

export const BLOCK_SIZE = 20

export type TrendBlock = { from: number; to: number } & Record_

/**
 * Profile model from match history. Counts normal-mode ranked and unranked matches;
 * penalized or not-scored outcomes are excluded from win rates (and counted separately).
 */
export function profileModel(history: HistoryRow[], heroes: Map<number, HeroLite>) {
  const normal = history
    .filter((m) => m.game_mode === 1 && (m.match_mode === 1 || m.match_mode === 4))
    .sort((a, b) => b.start_time - a.start_time)
  const matches: HistoryMatch[] = normal.map((m) => ({
    id: m.match_id,
    hero: heroes.get(m.hero_id) ?? { id: m.hero_id, name: 'Unknown hero', slug: '', iconUrl: null, role: null },
    startedAt: m.start_time * 1000,
    durationS: m.match_duration_s,
    ranked: m.match_mode === 4,
    // Outcomes 3–5 = penalized / not scored. Outcome 0 ("invalid") is the default on older matches,
    // so the result comes from the winning team, which is always present.
    result: m.player_match_outcome >= 3 ? 'other' : m.match_result === m.player_team ? 'win' : 'loss',
    kda: [m.player_kills, m.player_deaths, m.player_assists],
    netWorth: m.net_worth,
    lastHits: m.last_hits,
    badgeAfter: m.ranked_display_badge || null,
  }))

  const scored = matches.filter((m) => m.result !== 'other')
  const tally = (list: HistoryMatch[]) => record(list.filter((m) => m.result === 'win').length, list.length)

  // Performance trend: consecutive blocks of 20 scored matches, oldest → newest, last 8 blocks.
  const chronological = [...scored].reverse()
  const blocks: TrendBlock[] = []
  for (let i = 0; i + BLOCK_SIZE <= chronological.length; i += BLOCK_SIZE) {
    const slice = chronological.slice(i, i + BLOCK_SIZE)
    blocks.push({ from: slice[0].startedAt, to: slice.at(-1)!.startedAt, ...tally(slice) })
  }
  const trend = blocks.slice(-8)
  const [prev, last] = trend.slice(-2)
  const trendChange =
    prev && last
      ? last.interval.low > prev.interval.high
        ? 'higher'
        : last.interval.high < prev.interval.low
          ? 'lower'
          : 'no clear change'
      : null

  const rankPoints = matches
    .filter((m) => m.ranked && m.badgeAfter)
    .slice(0, 60)
    .reverse()
    .map((m) => ({ t: m.startedAt, badge: m.badgeAfter! }))

  return {
    total: history.length,
    counted: matches.length,
    excluded: matches.length - scored.length,
    overall: tally(scored),
    recent: tally(scored.slice(0, BLOCK_SIZE)),
    ranked: tally(scored.filter((m) => m.ranked)),
    trend,
    trendChange,
    rankPoints,
    matches,
    firstAt: matches.at(-1)?.startedAt ?? null,
  }
}

export type PoolHero = HeroLite & Record_ & { kda: [number, number, number]; lastPlayed: number | null }

export function heroPool(rows: Array<{ hero_id: number; matches_played: number; wins: number; kills: number; deaths: number; assists: number; last_played?: number | null }>, heroes: Map<number, HeroLite>): PoolHero[] {
  return rows
    .filter((r) => r.matches_played > 0 && heroes.has(r.hero_id))
    .sort((a, b) => b.matches_played - a.matches_played)
    .map((r) => ({
      ...heroes.get(r.hero_id)!,
      ...record(r.wins, r.matches_played),
      kda: [r.kills / r.matches_played, r.deaths / r.matches_played, r.assists / r.matches_played],
      lastPlayed: r.last_played ? r.last_played * 1000 : null,
    }))
}

export type Peer = { accountId: number; name: string | null } & Record_

/** Teammates or opponents with the most shared matches. */
export function peers(rows: Array<{ id: number; wins: number; matches_played: number }>, names: Map<number, string>, limit = 10): Peer[] {
  return rows
    .sort((a, b) => b.matches_played - a.matches_played)
    .slice(0, limit)
    .map((r) => ({ accountId: r.id, name: names.get(r.id) ?? null, ...record(r.wins, r.matches_played) }))
}
