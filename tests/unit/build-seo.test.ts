import { createTranslator } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { locales, type Locale } from '@/i18n/config'
import en from '@/i18n/messages/en'
import ja from '@/i18n/messages/ja'
import ko from '@/i18n/messages/ko'
import th from '@/i18n/messages/th'
import zhCN from '@/i18n/messages/zh-CN'
import { DeadlockApiError } from '@/lib/deadlock/apiError'

/*
 * Build detail metadata: real build and hero names in a localized title that never equals the list title,
 * indexable (canonical + hreflang) only when the build renders; missing builds, redirects and failed loads
 * are noindex without alternates, and only an empty build lookup counts as missing (never a rate limit,
 * 503 or timeout).
 */

// The API client, routed by path: the real endpoint functions and getBuildDetail run on top of it.
type Route = (params: Record<string, unknown>) => unknown
const routes = new Map<string, Route>()
const deadlockGet = vi.fn(async (path: string, opts: { params?: Record<string, unknown> } = {}) => {
  const params = opts.params ?? {}
  const key = path === '/v1/builds' && 'build_id' in params ? 'build-by-id' : path
  const route = routes.get(key)
  if (route) return route(params)
  if (path === '/v1/analytics/item-flow-stats') throw new DeadlockApiError('HTTP 404', 404, path)
  return []
})
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => unknown) => fn }))
vi.mock('@/lib/deadlock/client', () => ({ deadlockGet: (path: string, opts: { params?: Record<string, unknown> }) => deadlockGet(path, opts) }))
vi.mock('@/features/meta/scope', () => ({ resolveScope: async () => ({ statsQuery: {}, patches: [], ranks: [], selected: {} }) }))
vi.mock('@/features/meta/loaders', () => ({ getMetaPageData: async () => ({ ok: true, scope: {}, model: { heroes: [] } }) }))
vi.mock('@/features/hero/loaders', () => ({ shopMap: async () => new Map(), abilityNames: async () => new Map() }))

const { buildIndexing, buildMetaName, buildMetaText, metaText, BUILD_NAME_MAX, UNTITLED_BUILD } = await import('@/features/builds/seo')
const { buildLoadStatus, loadBuildDetail } = await import('@/features/builds/loaders')

const ORIGIN = 'https://deadlock-pro-hunger.vercel.app'
const CATALOGS = { en, th, ja, ko, 'zh-CN': zhCN } as const
const metaT = (locale: Locale) => createTranslator({ locale, messages: CATALOGS[locale], namespace: 'builds.meta' })
const tr = (locale: Locale) => {
  const t = metaT(locale)
  return (key: string, values?: Record<string, string | number>) => t(key as 'detailTitle', values as { build: string; hero: string })
}
const text = (locale: Locale, input: Partial<Parameters<typeof buildMetaText>[1]> = {}) =>
  buildMetaText(tr(locale), { buildId: 487722, name: 'Dew', hero: 'Celeste', author: null, ...input })

describe('build detail titles', () => {
  it('use the real build and hero names, localized, and never equal the list title', () => {
    const titles = locales.map((locale) => {
      const { title, description } = text(locale)
      expect(title, locale).toContain('Dew')
      expect(title, locale).toContain('Celeste')
      expect(description, locale).toContain('Dew')
      expect(description, locale).toContain('Celeste')
      expect(title, locale).not.toBe(metaT(locale)('listTitle'))
      expect(description, locale).not.toBe(metaT(locale)('listDescription'))
      return title
    })
    expect(new Set(titles).size).toBe(locales.length)
    expect(text('en').title).toBe('Dew · Celeste build')
    expect(text('th').title).toBe('Dew · บิลด์ Celeste')
  })

  it('keep API hero names exactly (no slug casing)', () => {
    expect(text('en', { hero: 'Mo & Krill' }).title).toBe('Dew · Mo & Krill build')
    expect(text('ja', { hero: 'McGinnis' }).title).toBe('Dew · McGinnis ビルド')
  })

  it('add the author when known, which separates same-named builds; never invent one', () => {
    expect(text('en', { author: 'Alice' }).title).toBe('Dew · Celeste build by Alice')
    expect(text('en', { author: 'Alice' }).description).toContain('by Alice')
    for (const locale of locales) {
      expect(text(locale, { author: 'Alice' }).title, locale).not.toBe(text(locale, { author: 'Bob' }).title)
      expect(text(locale, { author: 'Alice' }).title, locale).toContain('Alice')
      for (const author of [null, '', '   ']) expect(text(locale, { author }).title, locale).toBe(text(locale).title)
    }
  })

  it('name an empty or untitled build with the translated fallback and its id', () => {
    for (const locale of locales) {
      for (const name of [null, '', '   ', UNTITLED_BUILD]) {
        const { title } = text(locale, { name })
        expect(title, locale).toContain(metaT(locale)('untitledBuild', { id: 487722 }))
        expect(title, locale).not.toContain(locale === 'en' ? 'Untitled build ·' : UNTITLED_BUILD)
      }
      expect(text(locale, { name: '', buildId: 1 }).title).not.toBe(text(locale, { name: '', buildId: 2 }).title)
    }
    expect(text('en', { name: '' }).title).toBe('Untitled build #487722 · Celeste build')
  })
})

describe('build names in metadata', () => {
  it('collapse whitespace and trim, without touching the name itself', () => {
    const raw = '  Haze \n\t  late   game\u0007 '
    expect(buildMetaName(raw)).toBe('Haze late game')
    expect(raw).toBe('  Haze \n\t  late   game\u0007 ')
    expect(text('en', { name: raw }).title).toBe('Haze late game · Celeste build')
  })

  it('cut long names at the limit with an ellipsis, without splitting characters', () => {
    const long = 'Spirit '.repeat(20)
    const name = buildMetaName(long)!
    expect(Array.from(name).length).toBeLessThanOrEqual(BUILD_NAME_MAX)
    expect(name.endsWith('…')).toBe(true)
    expect(Array.from(metaText('🔥'.repeat(80), 10)!)).toEqual([...Array(9).fill('🔥'), '…'])
    expect(buildMetaName('x'.repeat(BUILD_NAME_MAX))).toBe('x'.repeat(BUILD_NAME_MAX))
  })

  it('keep same-named builds apart by author, and identical only when nothing distinguishes them', () => {
    const a = text('en', { name: 'zxc | святые губы (t.tv/qtarsis)', author: 'zxc' })
    const b = text('en', { name: 'zxc | святые губы (t.tv/qtarsis)', author: 'other' })
    expect(a.title).not.toBe(b.title)
    expect(a.title).toContain('zxc | святые губы (t.tv/qtarsis)')
    expect(text('en', { buildId: 1 }).title).toBe(text('en', { buildId: 2 }).title)
  })
})

describe('build indexing metadata', () => {
  const env = process.env.SITE_URL
  beforeEach(() => {
    process.env.SITE_URL = ORIGIN
  })
  afterEach(() => {
    if (env === undefined) delete process.env.SITE_URL
    else process.env.SITE_URL = env
  })

  it('a rendered build is indexable with its localized canonical and every alternate', () => {
    const meta = buildIndexing('/builds/celeste/487722', 'ko', 'ok')
    expect(meta.robots).toBeUndefined()
    expect(meta.alternates?.canonical).toBe(`${ORIGIN}/ko/builds/celeste/487722`)
    expect(meta.alternates?.languages).toEqual({
      en: `${ORIGIN}/builds/celeste/487722`,
      th: `${ORIGIN}/th/builds/celeste/487722`,
      ja: `${ORIGIN}/ja/builds/celeste/487722`,
      ko: `${ORIGIN}/ko/builds/celeste/487722`,
      'zh-CN': `${ORIGIN}/zh-CN/builds/celeste/487722`,
      'x-default': `${ORIGIN}/builds/celeste/487722`,
    })
  })

  it('missing, redirected and failed builds are noindex with no canonical or alternates', () => {
    for (const status of ['missing', 'redirect', 'failed'] as const) {
      expect(buildIndexing('/builds/celeste/487722', 'en', status)).toEqual({ robots: { index: false } })
    }
    expect(buildIndexing(null, 'en', 'ok')).toEqual({ robots: { index: false } })
  })
})

describe('build page load outcome', () => {
  const build = (heroId: number, name: string) => ({
    hero_build: { hero_id: heroId, hero_build_id: 487722, name, description: null, version: 3, last_updated_timestamp: 0, author_account_id: 5, details: { mod_categories: [] } },
    num_weekly_favorites: 0,
  })
  const apiError = (status: number | null, message = `HTTP ${status}`) => new DeadlockApiError(message, status, '/v1/builds')
  let quiet: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    routes.clear()
    routes.set('/v1/assets/heroes', () => [
      { id: 1, name: 'Mo & Krill', images: {} },
      { id: 2, name: 'McGinnis', images: {} },
    ])
    routes.set('/v1/players/steam', () => [{ account_id: 5, personaname: 'Alice' }])
    quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    quiet.mockRestore()
  })

  it('a build the source returns renders, with the real hero name, slug and author', async () => {
    routes.set('build-by-id', () => [build(1, '  Dew  ')])
    const load = await loadBuildDetail('mo-and-krill', 487722, '30d', 'all')
    expect(buildLoadStatus(load)).toBe('ok')
    if (load.ok && load.value?.kind === 'build') {
      expect(load.value.hero).toMatchObject({ name: 'Mo & Krill', slug: 'mo-and-krill' })
      expect(load.value.build).toMatchObject({ id: 487722, name: 'Dew', authorName: 'Alice' })
    }
  })

  it('an empty build lookup is a confirmed missing build (the page 404s)', async () => {
    routes.set('build-by-id', () => [])
    expect(buildLoadStatus(await loadBuildDetail('mcginnis', 1, '30d', 'all'))).toBe('missing')
  })

  it('a build under another hero slug is a redirect', async () => {
    routes.set('build-by-id', () => [build(2, 'Turret')])
    expect(buildLoadStatus(await loadBuildDetail('mo-and-krill', 487722, '30d', 'all'))).toBe('redirect')
  })

  it('rate limits, 503 and timeouts are failed loads, never a missing build', async () => {
    for (const error of [apiError(429), apiError(503), apiError(null, 'timeout after 15000ms')]) {
      routes.set('build-by-id', () => {
        throw error
      })
      const load = await loadBuildDetail('mcginnis', 487722, '30d', 'all')
      expect(buildLoadStatus(load), error.message).toBe('failed')
    }
  })
})
