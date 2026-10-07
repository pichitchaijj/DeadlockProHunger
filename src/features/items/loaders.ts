import 'server-only'
import { cache } from 'react'
import type { StatScope } from '@/lib/analytics/scope'
import { getActiveHeroes, getHeroTotals } from '@/lib/deadlock/endpoints'
import { getShopItems } from '@/lib/deadlock/heroEndpoints'
import { heroIconUrl } from '@/lib/deadlock/heroImages'
import { getItemPhases, getItemStatsByHero, getItemStatsByMinute, getItemTotals } from '@/lib/deadlock/itemEndpoints'
import { slugify } from '@/features/meta/model'
import { resolveScope, type ResolvedScope } from '@/features/meta/scope'
import { heroBreakdown, itemRows, minuteSeries, purchasePhases, standoutPhase, typicalWindow, type HeroRef, type ItemRef, type ItemRow } from './model'
import type { ItemScopeQuery } from './query'

/*
 * Item pages. No data source of their own: the shared scope (features/meta/scope), the cached shop list,
 * and item-stats / item-flow calls that return every item at once, so one cached response per scope
 * serves every item page (lib/deadlock/itemEndpoints.ts). Loaders throw; pages wrap them in `attempt()`.
 */

/** Shop items by id, with URL slugs (names are unique among shop items, verified 2026-10-07). */
export const itemCatalog = cache(async (): Promise<Map<number, ItemRef>> => {
  const shop = await getShopItems()
  return new Map(
    shop
      .filter((i) => i.shopable && i.name)
      .map((i) => [i.id, { id: i.id, slug: slugify(i.name!), name: i.name!, slot: i.slot, tier: i.tier, cost: i.cost, icon: i.icon }]),
  )
})

export const heroCatalog = cache(async (): Promise<Map<number, HeroRef>> => {
  const heroes = await getActiveHeroes()
  return new Map(heroes.map((h) => [h.id, { id: h.id, slug: slugify(h.name), name: h.name, iconUrl: heroIconUrl(h.images) }]))
})

/** Hero select options, by name. Empty if the hero list can't load (the filter then offers "All heroes" only). */
export async function heroOptions(): Promise<Array<{ slug: string; name: string }>> {
  const heroes = await heroCatalog().catch(() => null)
  return heroes ? [...heroes.values()].map((h) => ({ slug: h.slug, name: h.name })).sort((a, b) => a.name.localeCompare(b.name)) : []
}

export async function findItem(slug: string): Promise<ItemRef | null> {
  for (const item of (await itemCatalog()).values()) if (item.slug === slug) return item
  return null
}

export type ItemContext = {
  scope: ResolvedScope
  /** Null = every hero's players. */
  hero: HeroRef | null
  statScope: StatScope
}

/** Scope + hero for a query. `unknown-hero` when the hero slug doesn't match an active hero. */
export const itemContext = cache(async (window: ItemScopeQuery['window'], rank: ItemScopeQuery['rank'], mode: ItemScopeQuery['mode'], heroSlug: string) => {
  const [scope, heroes] = await Promise.all([resolveScope({ window, rank, mode }), heroCatalog()])
  const hero = heroSlug === 'all' ? null : ([...heroes.values()].find((h) => h.slug === heroSlug) ?? undefined)
  if (hero === undefined) return 'unknown-hero' as const
  const statScope: StatScope = {
    windowLabel: scope.windowLabels[scope.window],
    rankLabel: `${scope.rankLabels[scope.band.id]}${scope.modeText}${hero ? ` · ${hero.name} players` : ''}`,
    source: 'live',
  }
  return { scope, hero, statScope } satisfies ItemContext
})

export const getItemContext = (query: ItemScopeQuery) => itemContext(query.window, query.rank, query.mode, query.hero)

/**
 * Buy-rate denominator: all player-matches in scope (Σ hero matches), or the selected hero's matches.
 * Null if hero-stats fails: the page then says buy rate is unavailable instead of failing.
 */
const playerMatches = cache(async (ctx: ItemContext): Promise<number | null> => {
  const totals = await getHeroTotals(ctx.scope.statsQuery).catch(() => null)
  if (!totals) return null
  const n = ctx.hero ? (totals.find((t) => t.hero_id === ctx.hero!.id)?.matches ?? 0) : totals.reduce((sum, t) => sum + t.matches, 0)
  return n > 0 ? n : null
})

/** Every item with stats in scope (shared by the directory and each item's headline numbers). */
export const itemTotals = cache(async (ctx: ItemContext): Promise<ItemRow[]> => {
  const [totals, items, denominator] = await Promise.all([getItemTotals(ctx.scope.statsQuery, ctx.hero?.id), itemCatalog(), playerMatches(ctx)])
  return itemRows(totals, items, denominator)
})

/** Headline numbers for one item; null when it has fewer purchases than the source's minimum in scope. */
export async function getItemPerformance(item: ItemRef, ctx: ItemContext) {
  const rows = await itemTotals(ctx)
  return rows.find((r) => r.id === item.id) ?? null
}

export async function getItemTiming(item: ItemRef, ctx: ItemContext) {
  const [byMinute, phases] = await Promise.all([
    getItemStatsByMinute(ctx.scope.statsQuery, ctx.hero?.id ?? null),
    getItemPhases(ctx.scope.statsQuery, ctx.hero?.id ?? null),
  ])
  const points = minuteSeries(byMinute.filter((r) => r[0] === item.id).map(([, minute, wins, matches]) => ({ minute, wins, matches })))
  const phaseRows = purchasePhases(phases.nodes.filter((n) => n[0] === item.id).map(([, column, wins, matches, adjustedWinRate]) => ({ column, wins, matches, adjustedWinRate })))
  return { points, typical: typicalWindow(points), phases: phaseRows, standout: standoutPhase(phaseRows), reached: phases.reached }
}

/** Heroes whose players buy the item (only for the all-heroes scope). */
export async function getItemHeroes(item: ItemRef, ctx: ItemContext) {
  const [rows, totals, heroes] = await Promise.all([getItemStatsByHero(ctx.scope.statsQuery), getHeroTotals(ctx.scope.statsQuery), heroCatalog()])
  return heroBreakdown(
    rows.filter((r) => r[0] === item.id).map(([, heroId, wins, matches]) => ({ heroId, wins, matches })),
    new Map(totals.map((t) => [t.hero_id, t.matches])),
    heroes,
  )
}
