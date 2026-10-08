import 'server-only'
import { cache } from 'react'
import type { StatScope } from '@/lib/analytics/scope'
import { getActiveHeroes, getHeroStatsByDay, throughDay } from '@/lib/deadlock/endpoints'
import {
  getAbilityOrderStats,
  getHeroAbilities,
  getHeroBuildStats,
  getHeroCounters,
  getHeroItemStats,
  getHeroStatsByBadge,
  getHeroStatsForDuration,
  getHeroSynergies,
  getRecentHeroMatches,
  getShopItems,
  getTopBuilds,
} from '@/lib/deadlock/heroEndpoints'
import { getMetaPageData } from '@/features/meta/loaders'
import { slugify, type MetaHero } from '@/features/meta/model'
import { DEFAULT_QUERY } from '@/features/meta/query'
import { resolveScope, type ResolvedScope } from '@/features/meta/scope'
import {
  abilityOpenings,
  buildsWithStats,
  byMatchLength,
  byRank,
  dailySeries,
  heroInsights,
  itemProgression,
  MATCH_LENGTHS,
  matchupsFor,
  patchImpacts,
  rankPickBands,
  synergiesFor,
  type HeroRef,
  type ShopItemRef,
} from './model'
import type { HeroQuery } from './query'
import { heroIconUrl, heroCardUrl } from '@/lib/deadlock/heroImages'

const DAY = 86_400

export type HeroIdentity = HeroRef & { role: string | null; complexity: number | null; cardSrc: string | null }

export type HeroContext = {
  hero: HeroIdentity
  heroes: Map<number, HeroRef>
  scope: ResolvedScope
  statScope: StatScope
  /** Same numbers as the Meta page; null when the hero has no matches in scope. */
  stats: MetaHero | null
  heroCount: number
}

/** Hero identity + headline stats. Returns null for an unknown slug (→ 404). Throws on upstream failure. */
export const getHeroContext = cache(async (slug: string, query: HeroQuery): Promise<HeroContext | null> => {
  const [apiHeroes, scope, meta] = await Promise.all([
    getActiveHeroes(),
    resolveScope({ window: query.window, rank: query.rank, mode: 'all' }),
    getMetaPageData({ ...DEFAULT_QUERY, window: query.window, rank: query.rank, showLow: true }),
  ])
  const api = apiHeroes.find((h) => slugify(h.name) === slug)
  if (!api) return null
  if (!meta.ok) throw new Error(meta.message)

  const heroes = new Map<number, HeroRef>(
    apiHeroes.map((h) => [h.id, { id: h.id, name: h.name, slug: slugify(h.name), iconUrl: heroIconUrl(h.images) }]),
  )
  return {
    hero: {
      ...heroes.get(api.id)!,
      role: api.hero_type ?? null,
      complexity: api.complexity ?? null,
      cardSrc: heroCardUrl(api.images),
    },
    heroes,
    scope,
    statScope: meta.scope,
    stats: meta.model.heroes.find((h) => h.id === api.id) ?? null,
    heroCount: meta.model.heroes.length,
  }
})

export const shopMap = cache(async () => new Map<number, ShopItemRef>((await getShopItems()).map((i) => [i.id, i])))

/*
 * Shared inputs, resolved once per request and context. Overview, tabs and the Analyze page all read
 * the same few datasets (counters, synergies, splits, builds, daily rows). Each resolver is wrapped in
 * React `cache` keyed on the HeroContext object, which a page creates once and passes to every section,
 * so a dataset is fetched, parsed and modelled once however many sections use it. A failure is shared
 * the same way (every section that needs it shows its own error), and nothing outlives the request.
 */

/** Hero-vs-enemy matchups, scored (any lane or same lane). */
export const laneMatchups = cache(async (ctx: HeroContext, sameLane: boolean) => matchupsFor(ctx.hero.id, await getHeroCounters(ctx.scope.statsQuery, sameLane), ctx.heroes))

/** Teammate pairs, scored. */
export const heroSynergies = cache(async (ctx: HeroContext) => synergiesFor(ctx.hero.id, await getHeroSynergies(ctx.scope.statsQuery), ctx.heroes))

/** Win rate by match length (one upstream call per range, all heroes per call). */
export const lengthSplit = cache((ctx: HeroContext) =>
  Promise.all(MATCH_LENGTHS.map((r) => getHeroStatsForDuration(ctx.scope.statsQuery, { min: r.min, max: r.max }))).then((rows) => byMatchLength(ctx.hero.id, rows)),
)

/** Per-badge rows (rank filter dropped on purpose): feeds the rank split and rank-pick insight. */
const badgeRows = cache((ctx: HeroContext) => getHeroStatsByBadge(ctx.scope.statsQuery))

const rankSplit = cache(async (ctx: HeroContext) => byRank(ctx.hero.id, await badgeRows(ctx), ctx.scope.tierNames))

/**
 * Per-day rows for the last 60 days (rank-scoped, window-independent). One request feeds the trend
 * charts (sliced to the selected window) and the patch-shift insight. Every window preset fits in it:
 * 7d, 30d, and "patch", which resolveScope caps at 60 days.
 */
export const dayRows = cache(async (ctx: HeroContext) =>
  (await getHeroStatsByDay({ ...ctx.scope.statsQuery, minUnix: ctx.scope.today - 59 * DAY })).map((r) => ({ hero_id: r.hero_id, bucket: r.bucket, wins: r.wins, matches: r.matches })),
)

export const abilityNames = cache(async (heroId: number) =>
  new Map((await getHeroAbilities(heroId)).filter((a) => a.type === 'ability').map((a) => [a.id, { name: a.name ?? 'Ability', icon: a.image ?? null, kind: a.ability_type ?? null }])),
)

/** This week's most-favorited builds joined with their tracked results. */
export const heroBuilds = cache(async (ctx: HeroContext) => {
  const [builds, stats, shop] = await Promise.all([getTopBuilds(ctx.hero.id), getHeroBuildStats(ctx.hero.id, ctx.scope.statsQuery), shopMap()])
  return buildsWithStats(builds, stats, shop)
})

/** Overview: Insight Engine results plus a short preview of each deeper tab. */
export async function getOverviewData(ctx: HeroContext) {
  const { today, hour, statsQuery } = ctx.scope
  // Inputs used only by insights fail soft: a missing one drops its insight, not the overview.
  const [matchups, synergies, length, badges, rank, builds, orders, abilities, days, itemsNow, itemsBefore, shop] = await Promise.all([
    laneMatchups(ctx, true),
    heroSynergies(ctx),
    lengthSplit(ctx),
    badgeRows(ctx),
    rankSplit(ctx),
    heroBuilds(ctx),
    getAbilityOrderStats(ctx.hero.id, statsQuery),
    abilityNames(ctx.hero.id),
    dayRows(ctx).catch(() => null),
    getHeroItemStats(ctx.hero.id, { ...statsQuery, minUnix: today - 6 * DAY, maxUnix: hour }).catch(() => null),
    getHeroItemStats(ctx.hero.id, { ...statsQuery, minUnix: today - 13 * DAY, maxUnix: throughDay(today - 7 * DAY) }).catch(() => null),
    shopMap(),
  ])
  const s = ctx.stats
  return {
    insights: s
      ? heroInsights({
          name: ctx.hero.name,
          winRate: s.winRate,
          scope: ctx.scope.selected,
          weekScope: { window: { kind: 'days', days: 14 }, rank: ctx.scope.selected.rank },
          rankScope: { window: ctx.scope.selected.window, rank: { kind: 'everyBand' } },
          weeks: s.weeks,
          patch: days ? latestPatchShift(ctx, days) : null,
          length,
          rank,
          rankPicks: rankPickBands(ctx.hero.id, badges, ctx.scope.tierNames),
          matchups,
          synergies,
          builds,
          items: s.weeks && itemsNow && itemsBefore ? weeklyItems(itemsNow, itemsBefore, shop, s.weeks) : [],
        })
      : [],
    best: matchups.best.slice(0, 3),
    worst: matchups.worst.slice(0, 3),
    synergies: synergies.slice(0, 3),
    topBuild: builds.find((b) => b.stats) ?? builds[0] ?? null,
    opening: abilityOpenings(orders, 1)[0] ?? null,
    abilities,
    length,
    rank,
  }
}

/** The hero's 7 days either side of the latest patch from the last ~7 weeks (same windows as the Trends tab). */
function latestPatchShift(ctx: HeroContext, rows: Array<{ hero_id: number; bucket: number; wins: number; matches: number }>) {
  const { today, patches } = ctx.scope
  const recent = patches.filter((p) => p.day >= today - 52 * DAY).slice(0, 1)
  const [impact] = patchImpacts(ctx.hero.id, rows, recent, today)
  return impact ? { title: impact.title, before: impact.before, after: impact.after, inWeeks: impact.day >= today - 13 * DAY } : null
}

/** Shop items present in both weeks (upstream lists items with 200+ buyers), with the hero's matches each week. */
function weeklyItems(
  now: Array<{ item_id: number; matches: number }>,
  before: Array<{ item_id: number; matches: number }>,
  shop: Map<number, ShopItemRef>,
  weeks: NonNullable<MetaHero['weeks']>,
) {
  const previous = new Map(before.map((r) => [r.item_id, r.matches]))
  return now.flatMap((r) => {
    const item = shop.get(r.item_id)
    const prev = previous.get(r.item_id)
    if (!item?.name || prev === undefined) return []
    return [{ name: item.name, current: { buyers: r.matches, heroMatches: weeks.current.matches }, previous: { buyers: prev, heroMatches: weeks.previous.matches } }]
  })
}

export async function getBuildsData(ctx: HeroContext) {
  const [builds, itemRows, shop] = await Promise.all([heroBuilds(ctx), getHeroItemStats(ctx.hero.id, ctx.scope.statsQuery), shopMap()])
  return { builds, progression: itemProgression(itemRows, shop, ctx.stats?.matches ?? 0) }
}

export async function getMatchupsData(ctx: HeroContext, lane: 'lane' | 'any') {
  const [matchups, synergies] = await Promise.all([laneMatchups(ctx, lane === 'lane'), heroSynergies(ctx)])
  return { best: matchups.best.slice(0, 8), worst: matchups.worst.slice(0, 8), opponents: matchups.all.length, synergies: synergies.slice(0, 8) }
}

export async function getAbilitiesData(ctx: HeroContext) {
  const [orders, abilities] = await Promise.all([getAbilityOrderStats(ctx.hero.id, ctx.scope.statsQuery), abilityNames(ctx.hero.id)])
  return { openings: abilityOpenings(orders, 5), abilities }
}

/** Last 60 days (rank-scoped, window-independent) for the daily chart and patch comparisons. */
export async function getTrendsData(ctx: HeroContext) {
  const { today } = ctx.scope
  const [rows, length, rank] = await Promise.all([dayRows(ctx), lengthSplit(ctx), rankSplit(ctx)])
  const series = dailySeries(ctx.hero.id, rows).filter((p) => p.day >= today - 29 * DAY)
  const patches = ctx.scope.patches.filter((p) => p.day >= today - 52 * DAY).slice(0, 4)
  return { series, patches: patchImpacts(ctx.hero.id, rows, patches, today), length, rank }
}

export async function getMatchesData(ctx: HeroContext) {
  const minBadge = ctx.scope.statsQuery.minBadge
  const matches = await getRecentHeroMatches(ctx.hero.id, minBadge)
  return matches.map((m) => {
    const me = m.players.find((p) => p.hero_id === ctx.hero.id) ?? null
    const team = (name: string) => m.players.filter((p) => p.team === name).map((p) => ctx.heroes.get(p.hero_id) ?? { id: p.hero_id, name: `Hero ${p.hero_id}`, slug: '', iconUrl: null })
    return {
      matchId: m.match_id,
      startedAt: Date.parse(`${m.start_time.replace(' ', 'T')}Z`),
      durationS: m.duration_s,
      averageBadge: m.average_badge ?? null,
      perspective: me ? { won: me.team === m.winning_team, kda: `${me.kills} / ${me.deaths} / ${me.assists}`, netWorth: me.net_worth } : null,
      teams: [
        { label: 'Team 1', won: m.winning_team === 'Team0', heroes: team('Team0') },
        { label: 'Team 2', won: m.winning_team === 'Team1', heroes: team('Team1') },
      ] as const,
    }
  })
}
