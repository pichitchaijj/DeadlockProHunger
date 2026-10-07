import 'server-only'
import { badgeRange, rankBand } from '@/lib/analytics/rankBands'
import { getSteamNames } from '@/lib/deadlock/buildEndpoints'
import { getActiveHeroes } from '@/lib/deadlock/endpoints'
import { getActiveMatches, getMatchList, searchPlayers } from '@/lib/deadlock/matchEndpoints'
import { slugify } from '@/features/meta/model'
import { resolveScope } from '@/features/meta/scope'
import { liveSummary, toMatchRow, type HeroLite, type MatchRow } from './model'
import { DURATIONS, type MatchesQuery } from './query'
import { heroIconUrl } from '@/lib/deadlock/heroImages'

const DAY = 86_400
const LIMIT = 40

export type PlayerCandidate = { accountId: number; name: string; matches30d: number | null }

export type MatchesPage = {
  rows: MatchRow[]
  /** Rows before the result filter (it applies after fetching). */
  fetched: number
  heroes: HeroLite[]
  heroFilter: HeroLite | null
  player: { accountId: number; name: string | null } | null
  /** When `player` was a name: matching profiles to choose from (the list isn't player-filtered yet). */
  candidates: PlayerCandidate[] | null
  rankLabel: string
  rankLabels: Record<string, string>
  dateFrom: number // unix ms
  /** Render time (unix ms), so server and client format relative times identically. */
  now: number
}

export async function getMatchesPage(query: MatchesQuery): Promise<MatchesPage> {
  const nowSec = Math.floor(Date.now() / 1000)
  const minute = Math.floor(nowSec / 60) * 60 // minute-rounded so identical filters share cache entries
  const [apiHeroes, scope] = await Promise.all([getActiveHeroes(), resolveScope({ window: '7d', rank: query.rank, mode: 'all' })])
  const heroes = new Map<number, HeroLite>(apiHeroes.map((h) => [h.id, { id: h.id, name: h.name, slug: slugify(h.name), iconUrl: heroIconUrl(h.images) }]))
  const heroFilter = query.hero === 'all' ? null : ([...heroes.values()].find((h) => h.slug === query.hero) ?? null)

  // Player: digits = SteamID3; anything else is a name to search.
  let player: MatchesPage['player'] = null
  let candidates: PlayerCandidate[] | null = null
  if (/^\d{1,10}$/.test(query.player)) {
    const accountId = Number(query.player)
    const names = await getSteamNames([accountId]).catch(() => [])
    player = { accountId, name: names[0]?.personaname ?? null }
  } else if (query.player) {
    const found = await searchPlayers(query.player).catch(() => [])
    candidates = found.map((p) => ({ accountId: p.account_id, name: p.personaname, matches30d: p.matches_played_last_30d ?? null }))
  }

  const latestPatch = scope.patches[0]?.day ?? null
  const fromSec = query.date === '24h' ? minute - DAY : query.date === '7d' ? scope.today - 6 * DAY : (latestPatch ?? scope.today - 6 * DAY)
  const badges = badgeRange(rankBand(query.rank))
  const duration = query.duration === 'any' ? null : DURATIONS[query.duration]

  const raw = await getMatchList({
    heroId: heroFilter?.id,
    accountId: player?.accountId,
    minUnix: Math.floor(fromSec / 60) * 60,
    maxUnix: minute,
    minBadge: badges?.min,
    maxBadge: badges?.max,
    minDurationS: duration?.min,
    maxDurationS: duration?.max,
    limit: LIMIT,
  })

  const rows = raw.map((m) =>
    toMatchRow(m, {
      heroes,
      ranks: scope.ranks,
      patches: scope.patches,
      focusHeroId: heroFilter?.id ?? null,
      focusAccountId: player?.accountId ?? null,
      focusLabel: player ? (player.name ?? `Player ${player.accountId}`) : null,
    }),
  )
  const filtered = query.result === 'any' ? rows : rows.filter((r) => r.focus && r.focus.won === (query.result === 'win'))

  return {
    rows: filtered,
    fetched: rows.length,
    heroes: [...heroes.values()].sort((a, b) => a.name.localeCompare(b.name)),
    heroFilter,
    player,
    candidates,
    rankLabel: scope.rankLabels[scope.band.id],
    rankLabels: scope.rankLabels,
    dateFrom: fromSec * 1000,
    now: nowSec * 1000,
  }
}

/** Watch-tab live summary; null when the source is unavailable (the page works without it). */
export async function getLiveSummary() {
  try {
    const [active, apiHeroes] = await Promise.all([getActiveMatches(), getActiveHeroes()])
    const heroes = new Map<number, HeroLite>(apiHeroes.map((h) => [h.id, { id: h.id, name: h.name, slug: slugify(h.name), iconUrl: heroIconUrl(h.images) }]))
    return liveSummary(active, heroes, Date.now())
  } catch (error) {
    console.error('[matches] live summary failed', error)
    return null
  }
}

export const MATCH_LIMIT = LIMIT
