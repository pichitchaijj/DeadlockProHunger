import type { Metadata } from 'next'
import type { Locale } from '@/i18n/config'
import { pageAlternates } from '@/i18n/seo'

/*
 * Item search indexing. The Items list shows only items with Normal-mode stats in its default scope; a
 * catalog item missing from a successful stats response (Street Brawl's tier-5 items: they're never bought
 * in Normal matches) has nothing to show, so it's left out of the sitemap and noindex. A failed stats call
 * proves nothing: the item stays listed and indexable. Pure.
 */

/** Catalog item ids with Normal-mode stats in the Items list's default scope, or null when that call failed. */
export type ItemsWithStats = ReadonlySet<number> | null

/**
 * The catalog items to submit and index: those with stats, in catalog order. The whole catalog when the
 * stats call failed (an outage never drops valid items). Stats ids that aren't catalog items never appear.
 */
export function indexableItems<T extends { id: number }>(catalog: readonly T[], withStats: ItemsWithStats): T[] {
  return withStats ? catalog.filter((item) => withStats.has(item.id)) : [...catalog]
}

/**
 * How an item page's metadata load ended: indexable, confirmed without stats (no stats in a successful
 * response), unknown slug (404), or the item catalog failed.
 */
export type ItemLoadStatus = 'ok' | 'no-stats' | 'missing' | 'failed'

export function itemLoadStatus(catalog: { ok: true; item: { id: number } | null } | { ok: false }, withStats: ItemsWithStats): ItemLoadStatus {
  if (!catalog.ok) return 'failed'
  if (!catalog.item) return 'missing'
  return withStats && !withStats.has(catalog.item.id) ? 'no-stats' : 'ok'
}

/**
 * Search indexing for an item page: indexable, with canonical and hreflang on `/items/{slug}`, unless the item
 * is confirmed without stats, unknown (404) or the catalog failed: then noindex without alternates.
 */
export function itemIndexing(path: string | null, locale: Locale, status: ItemLoadStatus): Pick<Metadata, 'alternates' | 'robots'> {
  if (status !== 'ok' || !path) return { robots: { index: false } }
  return { alternates: pageAlternates(path, locale) }
}
