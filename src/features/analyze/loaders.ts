import 'server-only'
import { getActiveHeroes } from '@/lib/deadlock/endpoints'
import { heroIconUrl } from '@/lib/deadlock/heroImages'
import { getMetaPageData } from '@/features/meta/loaders'
import { slugify } from '@/features/meta/model'
import { DEFAULT_QUERY } from '@/features/meta/query'
import { dailySeries } from '@/features/hero/model'
import { dayRows, getHeroContext, type HeroContext } from '@/features/hero/loaders'
import { DEFAULT_HERO_QUERY, type HeroQuery } from '@/features/hero/query'
import { trendRange, type PickerHero } from './model'
import type { AnalyzeQuery } from './query'

/*
 * The Analyze workspace adds no data source of its own. It reads the same loaders as the Meta page
 * (every hero's totals in the scope) and Hero Detail (the selected hero's context, trends, builds,
 * matchups and insights), so its numbers always match those pages. Upstream calls are shared through
 * the data cache.
 */

/** Every hero in the scope, Low sample included (the picker and peer comparison need them all). */
export function getAnalyzeMeta(query: AnalyzeQuery) {
  return getMetaPageData({ ...DEFAULT_QUERY, window: query.window, rank: query.rank, showLow: true })
}

/**
 * Every active hero, for the picker. Not the Meta model's list: that one only holds heroes with
 * matches in the scope, and a hero with none must still be selectable (its page then says so).
 */
export async function getPickerHeroes(): Promise<PickerHero[]> {
  return (await getActiveHeroes()).map((h) => ({ id: h.id, slug: slugify(h.name), name: h.name, role: h.hero_type ?? null, iconUrl: heroIconUrl(h.images) }))
}

/** The Hero Detail query for the same scope (used for its loaders and for links into its tabs). */
export function heroQueryFor(query: AnalyzeQuery, changes: Partial<HeroQuery> = {}): HeroQuery {
  return { ...DEFAULT_HERO_QUERY, window: query.window, rank: query.rank, ...changes }
}

/**
 * Daily trend for the selected window (the filter is the source of truth), cut from the hero's shared
 * 60-day daily rows: the same request the insights use, so the trend section adds no upstream call.
 * Patch markers are the patches inside the window.
 */
export async function getAnalyzeTrends(ctx: HeroContext) {
  const range = trendRange(dailySeries(ctx.hero.id, await dayRows(ctx)), ctx.scope.windowStart, ctx.scope.today)
  return { ...range, patches: ctx.scope.patches.filter((p) => p.day >= range.from && p.day <= range.to) }
}

/** The selected hero's context; null for an unknown slug. Throws on upstream failure. */
export function getAnalyzeHero(query: AnalyzeQuery) {
  return query.hero ? getHeroContext(query.hero, heroQueryFor(query)) : Promise.resolve(null)
}
