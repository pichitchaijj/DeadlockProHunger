import 'server-only'
import { storeProfile } from '@/lib/db/store'
import { badgeRange, rankBand } from '@/lib/analytics/rankBands'
import { getActiveHeroes } from '@/lib/deadlock/endpoints'
import {
  getEnemyStats,
  getMatchHistory,
  getMateStats,
  getPlayerHeroStats,
  getPlayerRank,
  getPublicProfiles,
  searchProfiles,
} from '@/lib/deadlock/playerEndpoints'
import { slugify } from '@/features/meta/model'
import { resolveScope } from '@/features/meta/scope'
import { heroPool, peers, profileModel, type HeroLite } from './model'
import type { PlayersQuery } from './query'
import { heroIconUrl } from '@/lib/deadlock/heroImages'
import { rankFromBadge } from '@/lib/deadlock/rankAssets'

export const PAGE_SIZE = 50

async function context() {
  const [apiHeroes, scope] = await Promise.all([getActiveHeroes(), resolveScope({ window: '7d', rank: 'all', mode: 'all' }).catch(() => null)])
  const heroes = new Map<number, HeroLite>(
    apiHeroes.map((h) => [h.id, { id: h.id, name: h.name, slug: slugify(h.name), iconUrl: heroIconUrl(h.images), role: h.hero_type ?? null }]),
  )
  return {
    heroes,
    tierNames: scope?.tierNames ?? new Map<number, string>(),
    ranks: scope?.ranks ?? [],
    rankLabels: scope?.rankLabels ?? null,
  }
}

export async function getSearchView(query: PlayersQuery) {
  const { ranks, rankLabels, heroes } = await context()
  const minBadge = badgeRange(rankBand(query.rank))?.min
  const results = query.q.length >= 2 ? await searchProfiles(query.q, minBadge) : []
  return {
    results: results.map((p) => ({
      accountId: p.account_id,
      name: p.personaname,
      avatar: p.avatarmedium ?? null,
      matches30d: p.matches_played_last_30d ?? null,
      teamRank: rankFromBadge(ranks, p.last_team_avg_badge),
    })),
    rankLabels,
    ranks,
    heroes: [...heroes.values()].sort((a, b) => a.name.localeCompare(b.name)),
  }
}

/** Null when the account has neither a public profile nor stored matches. */
export async function getPlayerProfile(accountId: number) {
  const [{ heroes, tierNames, ranks }, profiles, rank, history, heroStats, mates, enemies] = await Promise.all([
    context(),
    getPublicProfiles([accountId]).catch(() => []),
    getPlayerRank(accountId).catch(() => null),
    getMatchHistory(accountId).catch(() => []),
    getPlayerHeroStats(accountId).catch(() => []),
    getMateStats(accountId).catch(() => []),
    getEnemyStats(accountId).catch(() => []),
  ])
  const profile = profiles[0] ?? null
  if (!profile && history.length === 0) return null
  storeProfile({ accountId, name: profile?.personaname ?? null, avatar: profile?.avatarmedium ?? null, rank, heroStats })

  const mateRows = mates.map((m) => ({ id: m.mate_id, wins: m.wins, matches_played: m.matches_played }))
  const enemyRows = enemies.map((m) => ({ id: m.enemy_id, wins: m.wins, matches_played: m.matches_played }))
  const peerIds = [...mateRows, ...enemyRows].sort((a, b) => b.matches_played - a.matches_played).slice(0, 40).map((p) => p.id)
  const peerNames = new Map((await getPublicProfiles(peerIds).catch(() => [])).map((p) => [p.account_id, p.personaname]))

  return {
    accountId,
    name: profile?.personaname ?? null,
    avatar: profile?.avatarmedium ?? null,
    profileUrl: profile?.profileurl ?? null,
    rank:
      rank && rank.badge > 0
        ? {
            ...rankFromBadge(ranks, rank.badge)!,
            badge: rank.badge,
            at: rank.last_match ? rank.last_match.start_time * 1000 : null,
          }
        : null,
    placements: rank?.last_match?.player_rank_initial_calibration_games ?? null,
    tierNames,
    ranks,
    history: profileModel(history, heroes),
    pool: heroPool(heroStats, heroes),
    mates: peers(mateRows, peerNames),
    enemies: peers(enemyRows, peerNames),
  }
}
