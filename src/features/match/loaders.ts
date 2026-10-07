import 'server-only'
import { getSteamNames } from '@/lib/deadlock/buildEndpoints'
import { getActiveHeroes } from '@/lib/deadlock/endpoints'
import { getMatchDetail, parseStoredMatchDetail } from '@/lib/deadlock/matchDetail'
import { readStoredMatch, storeMatch } from '@/lib/db/store'
import { shopMap } from '@/features/hero/loaders'
import { patchFor, rankName } from '@/features/matches/model'
import { slugify } from '@/features/meta/model'
import { resolveScope } from '@/features/meta/scope'
import { buildMatchView, type HeroLite, type MatchView } from './model'
import { heroIconUrl } from '@/lib/deadlock/heroImages'

export type MatchPage = {
  view: MatchView
  patch: string | null
  rank: [string | null, string | null]
}

/** Null when the match isn't available. Throws when the source fails. */
export async function getMatchPage(matchId: number): Promise<MatchPage | null> {
  // Finished matches never change: use our stored copy when we have one, otherwise fetch and store it.
  const stored = parseStoredMatchDetail(await readStoredMatch(matchId))
  const raw = stored ?? (await getMatchDetail(matchId))
  if (!raw) return null
  if (!stored) storeMatch(raw)

  const [apiHeroes, shop, names, scope] = await Promise.all([
    getActiveHeroes(),
    shopMap(),
    getSteamNames(raw.match_info.players.map((p) => p.account_id)).catch(() => []),
    resolveScope({ window: '7d', rank: 'all', mode: 'all' }).catch(() => null),
  ])
  const heroes = new Map<number, HeroLite>(apiHeroes.map((h) => [h.id, { id: h.id, name: h.name, slug: slugify(h.name), iconUrl: heroIconUrl(h.images) }]))
  const view = buildMatchView(raw, { heroes, items: shop, names: new Map(names.map((n) => [n.account_id, n.personaname])) })
  const tierNames = scope?.tierNames ?? new Map<number, string>()

  return {
    view,
    patch: scope ? patchFor(view.startedAt, scope.patches) : null,
    rank: [rankName(view.averageBadge[0], tierNames), rankName(view.averageBadge[1], tierNames)],
  }
}
