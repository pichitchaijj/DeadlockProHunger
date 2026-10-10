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
 * Hero detail metadata: the API hero name (never rebuilt from the slug) in a localized title with Deadlock
 * context, indexable (canonical + hreflang) only when the hero renders; a missing hero (404) and a failed
 * load are noindex without alternates, and only a hero list without the slug counts as missing (never a
 * rate limit, 503 or timeout).
 */

// The API client, routed by path: the real endpoint functions and getHeroContext run on top of it.
const routes = new Map<string, () => unknown>()
const deadlockGet = vi.fn(async (path: string) => {
  const route = routes.get(path)
  if (route) return route()
  return []
})
const meta = { ok: true as boolean }
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => unknown) => fn }))
vi.mock('@/lib/deadlock/client', () => ({ deadlockGet: (path: string) => deadlockGet(path) }))
vi.mock('@/features/meta/scope', () => ({ resolveScope: async () => ({ statsQuery: {}, patches: [], ranks: [], selected: {} }) }))
vi.mock('@/features/meta/loaders', () => ({
  getMetaPageData: async () => (meta.ok ? { ok: true, scope: {}, model: { heroes: [] } } : { ok: false, kind: 'rate-limit', message: 'meta failed' }),
}))

const { heroIndexing, heroMetaText } = await import('@/features/hero/seo')
const { heroLoadStatus, loadHeroContext } = await import('@/features/hero/loaders')

const ORIGIN = 'https://deadlock-pro-hunger.vercel.app'
const CATALOGS = { en, th, ja, ko, 'zh-CN': zhCN } as const
const metaT = (locale: Locale) => createTranslator({ locale, messages: CATALOGS[locale], namespace: 'heroes.meta' })
const text = (locale: Locale, hero: string) => {
  const t = metaT(locale)
  return heroMetaText((key, values) => t(key as 'detailTitle', values as { hero: string }), hero)
}

describe('hero detail titles', () => {
  it('carry the hero name and Deadlock, localized, and never equal the list title', () => {
    const titles = locales.map((locale) => {
      const { title, description } = text(locale, 'Abrams')
      expect(title, locale).toContain('Abrams')
      expect(title, locale).toContain('Deadlock')
      expect(description, locale).toContain('Abrams')
      expect(title, locale).not.toBe(metaT(locale)('listTitle'))
      expect(description, locale).not.toBe(metaT(locale)('listDescription'))
      return title
    })
    expect(new Set(titles).size).toBe(locales.length)
    expect(text('en', 'Abrams').title).toBe('Abrams: Deadlock stats, builds & matchups')
  })

  it('keep API hero names exactly: "McGinnis" and "Mo & Krill", never slug casing', () => {
    for (const locale of locales) {
      for (const hero of ['McGinnis', 'Mo & Krill']) {
        const { title, description } = text(locale, hero)
        expect(title, locale).toContain(hero)
        expect(description, locale).toContain(hero)
      }
      expect(text(locale, 'McGinnis').title).not.toContain('Mcginnis')
      expect(text(locale, 'Mo & Krill').title).not.toContain('Mo And Krill')
    }
    expect(text('en', 'Mo & Krill').title).toBe('Mo & Krill: Deadlock stats, builds & matchups')
  })

  it('differ per hero', () => {
    for (const locale of locales) expect(text(locale, 'McGinnis').title).not.toBe(text(locale, 'Mo & Krill').title)
  })
})

describe('hero indexing metadata', () => {
  const env = process.env.SITE_URL
  beforeEach(() => {
    process.env.SITE_URL = ORIGIN
  })
  afterEach(() => {
    if (env === undefined) delete process.env.SITE_URL
    else process.env.SITE_URL = env
  })

  it('a rendered hero is indexable with its localized canonical and every alternate', () => {
    const meta = heroIndexing('/heroes/mo-and-krill', 'zh-CN', 'ok')
    expect(meta.robots).toBeUndefined()
    expect(meta.alternates?.canonical).toBe(`${ORIGIN}/zh-CN/heroes/mo-and-krill`)
    expect(meta.alternates?.languages).toEqual({
      en: `${ORIGIN}/heroes/mo-and-krill`,
      th: `${ORIGIN}/th/heroes/mo-and-krill`,
      ja: `${ORIGIN}/ja/heroes/mo-and-krill`,
      ko: `${ORIGIN}/ko/heroes/mo-and-krill`,
      'zh-CN': `${ORIGIN}/zh-CN/heroes/mo-and-krill`,
      'x-default': `${ORIGIN}/heroes/mo-and-krill`,
    })
  })

  it('missing and failed heroes are noindex with no canonical or alternates', () => {
    for (const status of ['missing', 'failed'] as const) {
      expect(heroIndexing('/heroes/mcginnis', 'en', status)).toEqual({ robots: { index: false } })
    }
    expect(heroIndexing(null, 'en', 'ok')).toEqual({ robots: { index: false } })
  })
})

describe('hero page load outcome', () => {
  const apiError = (status: number | null, message = `HTTP ${status}`) => new DeadlockApiError(message, status, '/v1/assets/heroes')
  let quiet: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    routes.clear()
    meta.ok = true
    routes.set('/v1/assets/heroes', () => [
      { id: 8, name: 'McGinnis', images: {} },
      { id: 18, name: 'Mo & Krill', images: {} },
    ])
    quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    quiet.mockRestore()
  })

  it('a known slug renders with the exact API name and slug', async () => {
    for (const [slug, name] of [['mcginnis', 'McGinnis'], ['mo-and-krill', 'Mo & Krill']] as const) {
      const load = await loadHeroContext(slug, '7d', 'all')
      expect(heroLoadStatus(load)).toBe('ok')
      if (load.ok) expect(load.value?.hero).toMatchObject({ name, slug })
    }
  })

  it('an unknown slug is a confirmed missing hero (404), even while the stats are down', async () => {
    expect(heroLoadStatus(await loadHeroContext('not-a-hero', '7d', 'all'))).toBe('missing')
    meta.ok = false
    expect(heroLoadStatus(await loadHeroContext('not-a-hero', '7d', 'all'))).toBe('missing')
  })

  it('rate limits, 503 and timeouts from the hero feed are failed loads, never a missing hero', async () => {
    for (const error of [apiError(429), apiError(503), apiError(null, 'timeout after 15000ms')]) {
      routes.set('/v1/assets/heroes', () => {
        throw error
      })
      expect(heroLoadStatus(await loadHeroContext('mcginnis', '7d', 'all')), error.message).toBe('failed')
      expect(heroLoadStatus(await loadHeroContext('not-a-hero', '7d', 'all')), error.message).toBe('failed')
    }
  })

  it('a known hero whose stats fail to load is a failed load, not missing', async () => {
    meta.ok = false
    expect(heroLoadStatus(await loadHeroContext('mcginnis', '7d', 'all'))).toBe('failed')
  })
})
