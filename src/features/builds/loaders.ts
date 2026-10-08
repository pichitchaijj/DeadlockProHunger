import 'server-only'
import { DataError } from '@/lib/deadlock/errors'
import type { StatScope } from '@/lib/analytics/scope'
import { getActiveHeroes } from '@/lib/deadlock/endpoints'
import { rankFromBadge, type RankDisplay } from '@/lib/deadlock/rankAssets'
import { getAccountRanks, getBuildById, getItemFlow, getSteamNames, searchBuilds, type FullBuild } from '@/lib/deadlock/buildEndpoints'
import { getAbilityOrderStats, getHeroBuildStats, getHeroItemStats } from '@/lib/deadlock/heroEndpoints'
import { abilityNames, shopMap } from '@/features/hero/loaders'
import { abilityOpenings, categoryLabel, type HeroRef, type ShopItemRef } from '@/features/hero/model'
import { getMetaPageData } from '@/features/meta/loaders'
import { slugify } from '@/features/meta/model'
import { DEFAULT_QUERY } from '@/features/meta/query'
import { resolveScope, type ResolvedScope } from '@/features/meta/scope'
import {
  abilityPlan,
  buildWhyFacts,
  flowForBuild,
  labelsFor,
  metaOrder,
  patchStatus,
  phaseItems,
  scoreBuild,
  type BuildLabel,
  type BuildStats,
  type PatchStatus,
} from './model'
import { buildDetailHref, type BuildsQuery } from './query'
import { heroIconUrl } from '@/lib/deadlock/heroImages'

/** Lowest rank tier counted as "pro" (Ascendant); the Builds page names this tier and the next from the rank feed. */
export const PRO_MIN_TIER = 10

/** Serializable list row. */
export type BuildRow = {
  id: number
  href: string
  hero: HeroRef
  name: string
  authorName: string | null
  authorRank: RankDisplay | null
  updatedAt: number | null
  weeklyFavorites: number | null
  stats: BuildStats | null
  heroWinRate: number | null
  patch: PatchStatus
  labels: BuildLabel[]
}

type Common = {
  scope: ResolvedScope
  statScope: StatScope
  heroes: Map<number, HeroRef>
  heroWinRates: Map<number, number>
  heroMatches: Map<number, number>
}

async function common(query: Pick<BuildsQuery, 'window' | 'rank'>): Promise<Common> {
  const [scope, apiHeroes, meta] = await Promise.all([
    resolveScope({ window: query.window, rank: query.rank, mode: 'all' }),
    getActiveHeroes(),
    getMetaPageData({ ...DEFAULT_QUERY, window: query.window, rank: query.rank, showLow: true }),
  ])
  if (!meta.ok) throw new DataError(meta.message, meta.kind)
  return {
    scope,
    statScope: meta.scope,
    heroes: new Map(apiHeroes.map((h) => [h.id, { id: h.id, name: h.name, slug: slugify(h.name), iconUrl: heroIconUrl(h.images) }])),
    heroWinRates: new Map(meta.model.heroes.map((h) => [h.id, h.winRate])),
    heroMatches: new Map(meta.model.heroes.map((h) => [h.id, h.matches])),
  }
}

const authorRank = (scope: ResolvedScope, r: { rank: number; subrank: number } | undefined) =>
  r && r.rank > 0 ? rankFromBadge(scope.ranks, r.rank * 10 + r.subrank) : null

/** Tracked build stats per hero for the scope (one call per hero; cached and shared). */
async function trackedStats(heroIds: number[], c: Common) {
  const entries = await Promise.all(
    heroIds.map(async (id) => [id, (await getHeroBuildStats(id, c.scope.statsQuery).catch(() => [])).map((s) => ({ id: s.hero_build_id, stats: scoreBuild(s.wins, s.matches) }))] as const),
  )
  return new Map(entries)
}

export type BuildsListing = { rows: BuildRow[]; statScope: StatScope; heroes: HeroRef[]; heroFilter: HeroRef | null; candidates: number }

export async function getBuildsListing(query: BuildsQuery): Promise<BuildsListing | null> {
  const c = await common(query)
  const heroFilter = query.hero === 'all' ? null : ([...c.heroes.values()].find((h) => h.slug === query.hero) ?? null)
  if (query.hero !== 'all' && !heroFilter) return null

  // Favorites order (also the candidate pool for Community and Pro).
  const favorites = heroFilter
    ? await searchBuilds({ heroId: heroFilter.id, limit: 100 })
    : (await Promise.all([searchBuilds({ limit: 100 }), searchBuilds({ limit: 100, start: 100 })])).flat()
  const favoritesRank = new Map(favorites.map((b, i) => [b.hero_build.hero_build_id, i + 1]))

  let builds: FullBuild[]
  let ranks = new Map<number, { rank: number; subrank: number }>()
  if (query.category === 'community') {
    builds = favorites.slice(0, 30)
  } else if (query.category === 'pro') {
    const authorIds = [...new Set(favorites.map((b) => b.hero_build.author_account_id))]
    const rankRows = (await Promise.all([getAccountRanks(authorIds.slice(0, 100)), authorIds.length > 100 ? getAccountRanks(authorIds.slice(100, 200)) : []])).flat()
    ranks = new Map(rankRows.map((r) => [r.account_id, r]))
    builds = favorites.filter((b) => (ranks.get(b.hero_build.author_account_id)?.rank ?? 0) >= PRO_MIN_TIER).slice(0, 30)
  } else {
    const heroIds = heroFilter ? [heroFilter.id] : [...c.heroes.keys()]
    const stats = await trackedStats(heroIds, c)
    const candidates = metaOrder(
      [...stats.entries()].flatMap(([heroId, list]) => list.map((b) => ({ heroId, id: b.id, stats: b.stats as BuildStats | null, heroWinRate: c.heroWinRates.get(heroId) ?? null }))),
    ).slice(0, 24)
    builds = (await Promise.all(candidates.map((b) => getBuildById(b.id).catch(() => null)))).filter((b): b is FullBuild => b !== null)
  }

  // Stats + authors for whatever ended up in the list.
  const stats = await trackedStats([...new Set(builds.map((b) => b.hero_build.hero_id))], c)
  const authorIds = builds.map((b) => b.hero_build.author_account_id)
  const [names, missingRanks] = await Promise.all([
    getSteamNames(authorIds).catch(() => []),
    ranks.size === 0 ? getAccountRanks(authorIds).catch(() => []) : Promise.resolve([]),
  ])
  for (const r of missingRanks) ranks.set(r.account_id, r)
  const nameById = new Map(names.map((n) => [n.account_id, n.personaname]))
  const patchStart = c.scope.patches[0] ? c.scope.patches[0].day * 1000 : null

  const rows: BuildRow[] = builds
    .filter((b) => c.heroes.has(b.hero_build.hero_id))
    .map((b) => {
      const hb = b.hero_build
      const heroStats = stats.get(hb.hero_id) ?? []
      const own = heroStats.find((s) => s.id === hb.hero_build_id)?.stats ?? null
      const heroWinRate = c.heroWinRates.get(hb.hero_id) ?? null
      const updatedAt = hb.last_updated_timestamp ? hb.last_updated_timestamp * 1000 : null
      const hero = c.heroes.get(hb.hero_id)!
      return {
        id: hb.hero_build_id,
        href: buildDetailHref(hero.slug, hb.hero_build_id, query),
        hero,
        name: hb.name.trim() || 'Untitled build',
        authorName: nameById.get(hb.author_account_id) ?? null,
        authorRank: authorRank(c.scope, ranks.get(hb.author_account_id)),
        updatedAt,
        weeklyFavorites: b.num_weekly_favorites || null,
        stats: own,
        heroWinRate,
        patch: patchStatus(updatedAt, patchStart),
        labels: labelsFor({ stats: own, heroWinRate, heroBuildStats: heroStats, buildId: hb.hero_build_id, favoritesRank: favoritesRank.get(hb.hero_build_id) ?? null }),
      }
    })

  return {
    rows,
    statScope: { ...c.statScope, sampleSize: undefined },
    heroes: [...c.heroes.values()].sort((a, b) => a.name.localeCompare(b.name)),
    heroFilter,
    candidates: favorites.length,
  }
}

// ── Detail ───────────────────────────────────────────────────────────

export async function getBuildDetail(heroSlug: string, buildId: number, query: Pick<BuildsQuery, 'window' | 'rank'>) {
  const [c, build] = await Promise.all([common(query), getBuildById(buildId)])
  if (!build) return null
  const hb = build.hero_build
  const hero = c.heroes.get(hb.hero_id)
  if (!hero) return null
  if (hero.slug !== heroSlug) return { kind: 'redirect' as const, href: buildDetailHref(hero.slug, buildId, query) }

  const [heroBuildStatsRaw, shop, itemStats, flow, abilities, orders, heroFavorites, names, ranks] = await Promise.all([
    getHeroBuildStats(hero.id, c.scope.statsQuery),
    shopMap(),
    getHeroItemStats(hero.id, c.scope.statsQuery),
    getItemFlow(hero.id, c.scope.statsQuery).catch(() => null),
    abilityNames(hero.id),
    getAbilityOrderStats(hero.id, c.scope.statsQuery).catch(() => []),
    searchBuilds({ heroId: hero.id, limit: 100 }),
    getSteamNames([hb.author_account_id]).catch(() => []),
    getAccountRanks([hb.author_account_id]).catch(() => []),
  ])

  const heroBuildStats = heroBuildStatsRaw.map((s) => ({ id: s.hero_build_id, stats: scoreBuild(s.wins, s.matches) }))
  const stats = heroBuildStats.find((s) => s.id === buildId)?.stats ?? null
  const heroWinRate = c.heroWinRates.get(hero.id) ?? null
  const heroMatches = c.heroMatches.get(hero.id) ?? 0
  const favRankIndex = heroFavorites.findIndex((b) => b.hero_build.hero_build_id === buildId)
  const favoritesRank = favRankIndex >= 0 ? favRankIndex + 1 : null

  const sections = (hb.details.mod_categories ?? [])
    .map((cat) => ({ name: categoryLabel(cat.name), items: (cat.mods ?? []).map((m) => shop.get(m.ability_id)).filter((i): i is ShopItemRef => Boolean(i)) }))
    .filter((s) => s.items.length > 0)
  const seen = new Set<number>()
  const items = sections.flatMap((s) => s.items).filter((i) => !seen.has(i.id) && seen.add(i.id))

  const phases = phaseItems(items, itemStats, heroMatches)
  const flowView = flow ? flowForBuild(items.map((i) => i.id), flow, shop) : null
  const plan = abilityPlan(hb.details.ability_order?.currency_changes ?? [], new Set(abilities.keys()))
  const updatedAt = hb.last_updated_timestamp ? hb.last_updated_timestamp * 1000 : null

  return {
    kind: 'build' as const,
    hero,
    build: {
      id: buildId,
      name: hb.name.trim() || 'Untitled build',
      description: hb.description?.trim() || null,
      version: hb.version ?? null,
      updatedAt,
      weeklyFavorites: build.num_weekly_favorites || null,
      authorName: names[0]?.personaname ?? null,
      authorRank: authorRank(c.scope, ranks[0]),
      patch: patchStatus(updatedAt, c.scope.patches[0] ? c.scope.patches[0].day * 1000 : null),
      patchTitle: c.scope.patches[0]?.title ?? null,
    },
    stats,
    heroWinRate,
    heroMatches,
    trackedBuilds: heroBuildStats.length,
    labels: labelsFor({ stats, heroWinRate, heroBuildStats, buildId, favoritesRank }),
    sections,
    phases,
    flow: flowView,
    plan,
    abilities,
    opening: abilityOpenings(orders, 1)[0] ?? null,
    why: buildWhyFacts({
      stats,
      heroWinRate,
      trackedCount: heroBuildStats.length,
      weeklyFavorites: build.num_weekly_favorites || null,
      favoritesRank,
      favoritesOf: heroFavorites.length,
      phases,
      flow: flowView,
    }),
    statScope: c.statScope,
    /** The selected window and rank band (the page words it). */
    scopeRef: c.scope.selected,
  }
}
