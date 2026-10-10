import type { MetadataRoute } from 'next'
import { heroOptions, sitemapItemSlugs } from '@/features/items/loaders'
import { patchList } from '@/features/patches/loaders'
import { sitemapEntries, sitemapPaths } from '@/i18n/seo'

/**
 * Rendered on request from the cached feeds (each call is a server-cache hit). Prerendering it at build
 * shares those cache entries with the static Patch pages and changed their revalidate times (1h → 1d).
 */
export const dynamic = 'force-dynamic'

/**
 * Indexable pages in every locale (src/i18n/seo.ts). Hero, item and patch details come from the same
 * sources their pages use to tell a valid URL from a 404 (active heroes, shop items, the patch feed); a
 * source that fails is left out rather than failing the sitemap. Items are those with Normal-mode stats, as
 * on the Items list (the whole catalog if the stats fail: features/items/seo.ts).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [heroes, items, patches] = await Promise.all([
    heroOptions(),
    sitemapItemSlugs(),
    patchList()
      .then((list) => list.map((p) => p.id))
      .catch(() => []),
  ])
  return sitemapEntries(sitemapPaths({ heroes: heroes.map((h) => h.slug), items, patches }))
}
