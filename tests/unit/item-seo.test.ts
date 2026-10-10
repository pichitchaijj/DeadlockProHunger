import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeadlockApiError } from '@/lib/deadlock/apiError'

/*
 * Item indexing and sitemap selection: an item with Normal-mode stats in the Items list's default scope is
 * listed and indexable; one confirmed without stats (a successful stats response that lacks it) is left out
 * and noindex; a failed stats call proves nothing (listed, indexable); a failed catalog is noindex; unknown
 * slugs stay 404s.
 */

// The API client, routed by path: the real item loaders and sitemap run on top of it.
const routes = new Map<string, () => unknown>()
const deadlockGet = vi.fn(async (path: string) => {
  const route = routes.get(path)
  if (route) return route()
  return []
})
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => unknown) => fn }))
vi.mock('@/lib/deadlock/client', () => ({ deadlockGet: (path: string) => deadlockGet(path) }))
vi.mock('@/features/meta/scope', () => ({ resolveScope: async () => ({ statsQuery: {}, patches: [], ranks: [], rankRefs: [], selected: {}, ranked: false }) }))
vi.mock('@/features/patches/loaders', () => ({ patchList: async () => Array.from({ length: 22 }, (_, i) => ({ id: `2026-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}` })) }))

const { indexableItems, itemIndexing, itemLoadStatus } = await import('@/features/items/seo')
const { itemsWithStats, loadItem, sitemapItemSlugs } = await import('@/features/items/loaders')
const { default: sitemap } = await import('@/app/sitemap')

const ORIGIN = 'https://deadlock-pro-hunger.vercel.app'
const apiError = (status: number | null, message = `HTTP ${status}`) => new DeadlockApiError(message, status, '/v1/analytics/item-stats')

// Live-sized fixture (2026-10-10): 41 heroes, 173 shop items of which 17 are tier-5 Street Brawl items with no
// Normal-mode purchases, 22 patches. Item ids 1–156 have stats; 157–173 don't; 9999 has stats but isn't a shop item.
const heroes = Array.from({ length: 41 }, (_, i) => ({ id: i + 1, name: `Hero ${i + 1}`, images: {} }))
const shop = [
  ...Array.from({ length: 156 }, (_, i) => ({ id: i + 1, name: `Normal Item ${i + 1}`, shopable: true, item_slot_type: 'spirit', item_tier: (i % 4) + 1, cost: 800 })),
  ...Array.from({ length: 17 }, (_, i) => ({ id: 157 + i, name: `Brawl Item ${i + 1}`, shopable: true, item_slot_type: 'vitality', item_tier: 5, cost: 9999 })),
  { id: 500, name: 'Not In Shop', shopable: false, item_slot_type: 'weapon', item_tier: 1, cost: 500 },
]
const stats = [...Array.from({ length: 156 }, (_, i) => ({ item_id: i + 1, wins: 300, losses: 300, matches: 600, players: 600, avg_buy_time_s: 600 })), { item_id: 9999, wins: 1, losses: 1, matches: 900, players: 900, avg_buy_time_s: 1 }]

const env = process.env.SITE_URL
let quiet: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  process.env.SITE_URL = ORIGIN
  routes.clear()
  routes.set('/v1/assets/heroes', () => heroes)
  routes.set('/v1/assets/items/by-type/upgrade', () => shop)
  routes.set('/v1/analytics/item-stats', () => stats)
  quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  quiet.mockRestore()
  if (env === undefined) delete process.env.SITE_URL
  else process.env.SITE_URL = env
})
const failStats = (error: Error) =>
  routes.set('/v1/analytics/item-stats', () => {
    throw error
  })
const TRANSIENT = [apiError(429), apiError(503), apiError(null, 'timeout after 15000ms')]

describe('indexable items (pure)', () => {
  const catalog = [{ id: 1 }, { id: 2 }, { id: 3 }]

  it('keeps catalog items with stats, in catalog order, and ignores stats ids absent from the catalog', () => {
    expect(indexableItems(catalog, new Set([3, 1, 99]))).toEqual([{ id: 1 }, { id: 3 }])
  })

  it('keeps the whole catalog when the stats call failed', () => {
    expect(indexableItems(catalog, null)).toEqual(catalog)
  })

  it('maps loads to statuses: stats → ok, confirmed without → no-stats, failed stats → ok, unknown → missing, catalog failure → failed', () => {
    expect(itemLoadStatus({ ok: true, item: { id: 1 } }, new Set([1]))).toBe('ok')
    expect(itemLoadStatus({ ok: true, item: { id: 2 } }, new Set([1]))).toBe('no-stats')
    expect(itemLoadStatus({ ok: true, item: { id: 2 } }, null)).toBe('ok')
    expect(itemLoadStatus({ ok: true, item: null }, new Set([1]))).toBe('missing')
    expect(itemLoadStatus({ ok: false }, new Set([1]))).toBe('failed')
    expect(itemLoadStatus({ ok: false }, null)).toBe('failed')
  })

  it('indexable items get their localized canonical and every alternate; the rest noindex without alternates', () => {
    const meta = itemIndexing('/items/extra-spirit', 'ja', 'ok')
    expect(meta.robots).toBeUndefined()
    expect(meta.alternates?.canonical).toBe(`${ORIGIN}/ja/items/extra-spirit`)
    expect(Object.keys(meta.alternates?.languages ?? {})).toEqual(['en', 'th', 'ja', 'ko', 'zh-CN', 'x-default'])
    for (const status of ['no-stats', 'missing', 'failed'] as const) expect(itemIndexing('/items/shrink-ray', 'en', status)).toEqual({ robots: { index: false } })
    expect(itemIndexing(null, 'en', 'ok')).toEqual({ robots: { index: false } })
  })
})

describe('item page metadata status (real loaders)', () => {
  const status = async (slug: string) => {
    const [load, withStats] = await Promise.all([loadItem(slug), itemsWithStats()])
    return itemLoadStatus(load.ok ? { ok: true, item: load.value } : { ok: false }, withStats)
  }

  it('an item with stats is indexable', async () => {
    expect(await status('normal-item-1')).toBe('ok')
  })

  it('an item confirmed without Normal-mode stats is noindex', async () => {
    expect(await status('brawl-item-1')).toBe('no-stats')
  })

  it('a failed stats call (429, 503, timeout) never reads as "no stats": the item stays indexable', async () => {
    for (const error of TRANSIENT) {
      failStats(error)
      expect(await itemsWithStats(), error.message).toBeNull()
      expect(await status('brawl-item-1'), error.message).toBe('ok')
      expect(await status('normal-item-1'), error.message).toBe('ok')
    }
  })

  it('a failed catalog is noindex, never a 404', async () => {
    routes.set('/v1/assets/items/by-type/upgrade', () => {
      throw apiError(503)
    })
    expect((await loadItem('normal-item-1')).ok).toBe(false)
    expect(await status('normal-item-1')).toBe('failed')
  })

  it('an unknown slug is missing (the page 404s), including items that are not in the shop', async () => {
    expect(await status('no-such-item')).toBe('missing')
    expect(await status('not-in-shop')).toBe('missing')
    const load = await loadItem('no-such-item')
    expect(load.ok && load.value).toBeNull()
  })
})

describe('sitemap item selection (real loaders and sitemap)', () => {
  const itemUrls = (urls: string[]) => urls.filter((u) => /\/items\/[^/]+$/.test(u))

  it('lists only items with stats: 1,160 URLs = (13 static + 41 heroes + 156 items + 22 patches) × 5 locales', async () => {
    const slugs = await sitemapItemSlugs()
    expect(slugs).toHaveLength(156)
    expect(slugs.some((s) => s.startsWith('brawl-item'))).toBe(false)
    expect(slugs).not.toContain('not-in-shop')
    const urls = (await sitemap()).map((e) => e.url)
    expect(urls).toHaveLength((13 + 41 + 156 + 22) * 5)
    expect(urls).toHaveLength(1160)
    expect(itemUrls(urls)).toHaveLength(156 * 5)
    expect(urls.some((u) => u.includes('/items/brawl-item'))).toBe(false)
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('keeps every catalog item when the stats call fails: 1,245 URLs = (13 + 41 + 173 + 22) × 5', async () => {
    for (const error of TRANSIENT) {
      failStats(error)
      expect(await sitemapItemSlugs(), error.message).toHaveLength(173)
      const urls = (await sitemap()).map((e) => e.url)
      expect(urls, error.message).toHaveLength(1245)
      expect(itemUrls(urls)).toHaveLength(173 * 5)
    }
  })

  it('treats an empty stats response as unreliable, not as "no item has stats": falls back to the catalog', async () => {
    routes.set('/v1/analytics/item-stats', () => [])
    expect(await itemsWithStats()).toBeNull()
    expect(await sitemapItemSlugs()).toHaveLength(173)
    expect((await sitemap()).length).toBe(1245)
  })

  it('drops items (not the rest) when the catalog itself fails: (13 + 41 + 22) × 5', async () => {
    routes.set('/v1/assets/items/by-type/upgrade', () => {
      throw apiError(503)
    })
    const urls = (await sitemap()).map((e) => e.url)
    expect(urls).toHaveLength((13 + 41 + 22) * 5)
    expect(itemUrls(urls)).toHaveLength(0)
  })

  it('leaves static, hero and patch paths unchanged', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    expect(urls).toContain(ORIGIN)
    expect(urls).toContain(`${ORIGIN}/th/heroes/hero-1`)
    expect(urls).toContain(`${ORIGIN}/zh-CN/patch/2026-01-01`)
    expect(urls).toContain(`${ORIGIN}/ko/items/normal-item-1`)
    expect(urls).toContain(`${ORIGIN}/items`)
  })
})
