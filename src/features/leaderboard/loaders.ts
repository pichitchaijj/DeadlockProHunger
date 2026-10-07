import 'server-only'
import { leaderboardSnapshotKey } from '@/lib/db/mappers'
import { readSnapshot } from '@/lib/db/store'
import { badgeRange, rankBand } from '@/lib/analytics/rankBands'
import { getAccountRanks } from '@/lib/deadlock/buildEndpoints'
import { getActiveHeroes } from '@/lib/deadlock/endpoints'
import { getLeaderboard, getPlayerScoreboard, getPublicProfiles, type Region } from '@/lib/deadlock/playerEndpoints'
import { slugify } from '@/features/meta/model'
import { resolveScope } from '@/features/meta/scope'
import { filterLeaderboard, leaderboardRows, rankLabel, type HeroLite } from '@/features/players/model'
import { rankChange, scoreboardRows, type BoardRow, type RankChange } from './model'
import type { LeaderboardQuery } from './query'
import { heroIconUrl } from '@/lib/deadlock/heroImages'

export const PAGE_SIZE = 50
const REGIONAL_SCOPE = 200
const DAY = 86_400

async function context(query: LeaderboardQuery) {
  const [apiHeroes, scope] = await Promise.all([getActiveHeroes(), resolveScope({ window: '7d', rank: 'all', mode: 'all' }).catch(() => null)])
  const heroes = new Map<number, HeroLite>(
    apiHeroes.map((h) => [h.id, { id: h.id, name: h.name, slug: slugify(h.name), iconUrl: heroIconUrl(h.images), role: h.hero_type ?? null }]),
  )
  const hero = query.hero === 'all' ? null : ([...heroes.values()].find((h) => h.slug === query.hero) ?? null)
  const tierNames = scope?.tierNames ?? new Map<number, string>()
  const tierImages = scope?.tierImages ?? new Map<number, string | null>()
  return {
    heroes,
    hero,
    tierNames,
    rankLabels: scope?.rankLabels ?? null,
    label: (b: number | null) => rankLabel(b, tierNames),
    tier: (b: number | null) => (b ? (tierNames.get(Math.floor(b / 10)) ?? null) : null),
    tierImage: (b: number | null) => (b ? (tierImages.get(Math.floor(b / 10)) ?? null) : null),
  }
}

/** Current badge + latest-match rank change for up to 200 accounts (batch endpoint: 20 req/min per IP, cached 1h). */
async function ranksFor(ids: number[]) {
  const unique = [...new Set(ids)]
  const rows = (await Promise.all([getAccountRanks(unique.slice(0, 100)).catch(() => []), unique.length > 100 ? getAccountRanks(unique.slice(100, 200)).catch(() => []) : []])).flat()
  return {
    badges: new Map(rows.filter((r) => r.badge > 0).map((r) => [r.account_id, r.badge])),
    changes: new Map(rows.flatMap((r): Array<[number, RankChange]> => {
      const c = rankChange(r)
      return c ? [[r.account_id, c]] : []
    })),
  }
}

export type BoardData = {
  rows: BoardRow[]
  page: number
  pages: number
  total: number
  note: string
  heroes: HeroLite[]
  hero: HeroLite | null
  rankLabels: Record<string, string> | null
}

export async function getLeaderboardData(query: LeaderboardQuery): Promise<BoardData> {
  const ctx = await context(query)
  const heroes = [...ctx.heroes.values()].sort((a, b) => a.name.localeCompare(b.name))
  const nowSec = Math.floor(Date.now() / 3600 / 1000) * 3600
  const minUnix = nowSec - (query.view === 'performance' && query.window === '7d' ? 7 : 30) * DAY

  if (query.view === 'ranked' && query.scope !== 'global') {
    // Valve's regional leaderboard.
    let savedAt: Date | null = null
    const board = await getLeaderboard(query.scope as Region, ctx.hero?.id).catch(async (error) => {
      // Hero boards aren't snapshotted; regional ones are saved daily.
      const snap = ctx.hero ? null : await readSnapshot<Awaited<ReturnType<typeof getLeaderboard>>>(leaderboardSnapshotKey(query.scope))
      if (!snap) throw error
      savedAt = snap.fetchedAt
      return snap.payload
    })
    const top = board.entries.slice(0, REGIONAL_SCOPE)
    const single = top.flatMap((e) => (e.possible_account_ids?.length === 1 ? e.possible_account_ids : []))
    const { badges, changes } = await ranksFor(single)
    const filtered = filterLeaderboard(leaderboardRows(top, ctx.heroes, badges), { role: query.role, rank: query.rank })
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
    const page = Math.min(query.page, pages)
    const ambiguous = top.filter((e) => (e.possible_account_ids?.length ?? 0) !== 1).length
    return {
      rows: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => ({
        ...r,
        rankLabel: ctx.label(r.badge),
        tierName: ctx.tier(r.badge),
        tierImage: ctx.tierImage(r.badge),
        change: r.accountId !== null ? (changes.get(r.accountId) ?? null) : null,
        matches: null,
        value: null,
        interval: null,
        sample: null,
      })),
      page,
      pages,
      total: filtered.length,
      note: `${savedAt ? `The live leaderboard didn’t respond, so this is the copy saved ${(savedAt as Date).toUTCString().slice(5, 22)} UTC. ` : ''}Valve’s ${ctx.hero ? `${ctx.hero.name} ` : ''}leaderboard (updated hourly): ${filtered.length} of the top ${top.length} entries shown.${ambiguous ? ` ${ambiguous} entries match several possible accounts, so they aren’t linked and have no current rank.` : ''}`,
      heroes,
      hero: ctx.hero,
      rankLabels: ctx.rankLabels,
    }
  }

  // Global ranked view and the performance view both use the analytics scoreboard.
  const ranked = query.view === 'ranked'
  const badges = ranked ? null : badgeRange(rankBand(query.rank))
  const minMatches = ranked ? 20 : query.min
  const board = await getPlayerScoreboard({
    sortBy: ranked ? 'rank' : query.metric,
    heroId: ctx.hero?.id,
    minMatches,
    minUnix,
    maxUnix: nowSec,
    minBadge: badges?.min,
    maxBadge: badges?.max,
    limit: 100,
  })
  const ids = board.map((r) => r.account_id)
  const [profiles, ranks] = await Promise.all([getPublicProfiles(ids).catch(() => []), ranksFor(ids)])
  const rows = scoreboardRows(board, {
    names: new Map(profiles.map((p) => [p.account_id, p.personaname])),
    changes: ranks.changes,
    badges: ranks.badges,
    label: ctx.label,
    tier: ctx.tier,
    winRate: !ranked && query.metric === 'winrate',
  })
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const page = Math.min(query.page, pages)
  return {
    rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => ({ ...r, tierImage: ctx.tierImage(r.badge) })),
    page,
    pages,
    total: rows.length,
    note: ranked
      ? `Global: players with ${minMatches}+ tracked matches${ctx.hero ? ` on ${ctx.hero.name}` : ''} in the last 30 days, ordered by rank progress from their ranked matches. Built from tracked match data, not Valve’s regional lists.`
      : `Players with ${minMatches}+ tracked matches${ctx.hero ? ` on ${ctx.hero.name}` : ''} in the last ${query.window === '7d' ? '7' : '30'} days. Built from tracked match data; all regions.`,
    heroes,
    hero: ctx.hero,
    rankLabels: ctx.rankLabels,
  }
}
