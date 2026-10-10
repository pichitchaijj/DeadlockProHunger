import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import robots from '@/app/robots'
import { locales } from '@/i18n/config'
import { localizedPath, pageAlternates, parseSiteUrl, robotsRules, sitemapEntries, sitemapPaths, STATIC_PATHS } from '@/i18n/seo'

const BASE = new URL('https://deadlock-pro-hunger.vercel.app')
const ORIGIN = 'https://deadlock-pro-hunger.vercel.app'

/** The route file an app path renders: dynamic segments map to their [param] directories. */
function routeFile(path: string): string {
  const parts = path.split('/').filter(Boolean)
  const dynamic: Record<string, string> = { heroes: '[hero]', items: '[item]', patch: '[id]' }
  if (parts.length === 2 && dynamic[parts[0]] && !(parts[0] === 'patch' && parts[1] === 'compare')) parts[1] = dynamic[parts[0]]
  return join('src/app/[lang]', ...parts, 'page.tsx')
}

describe('SITE_URL', () => {
  it('accepts an http(s) origin and drops any path or trailing slash', () => {
    expect(parseSiteUrl('https://deadlock-pro-hunger.vercel.app/')?.href).toBe(`${ORIGIN}/`)
    expect(parseSiteUrl(' https://example.com/some/path?q=1 ')?.origin).toBe('https://example.com')
  })

  it('is off when unset, blank, malformed or not http(s)', () => {
    for (const raw of [undefined, '', '   ', 'not a url', 'ftp://example.com', 'javascript:alert(1)']) expect(parseSiteUrl(raw)).toBeNull()
  })
})

describe('localized paths', () => {
  it('keeps English unprefixed and prefixes every other locale once', () => {
    expect(localizedPath('/heroes', 'en')).toBe('/heroes')
    expect(localizedPath('/heroes', 'th')).toBe('/th/heroes')
    expect(localizedPath('/heroes/abrams', 'zh-CN')).toBe('/zh-CN/heroes/abrams')
    expect(localizedPath('/', 'en')).toBe('/')
    expect(localizedPath('/', 'ja')).toBe('/ja')
  })
})

describe('canonical and hreflang', () => {
  it('canonicalizes each locale to itself, never to English', () => {
    expect(pageAlternates('/heroes', 'en', BASE)?.canonical).toBe(`${ORIGIN}/heroes`)
    expect(pageAlternates('/heroes', 'th', BASE)?.canonical).toBe(`${ORIGIN}/th/heroes`)
    expect(pageAlternates('/', 'ko', BASE)?.canonical).toBe(`${ORIGIN}/ko`)
    expect(pageAlternates('/', 'en', BASE)?.canonical).toBe(ORIGIN)
  })

  it('lists every locale plus x-default (English), identically from every locale (reciprocal)', () => {
    const all = locales.map((l) => pageAlternates('/patch/2026-10-05', l, BASE)!.languages)
    expect(all[0]).toEqual({
      en: `${ORIGIN}/patch/2026-10-05`,
      th: `${ORIGIN}/th/patch/2026-10-05`,
      ja: `${ORIGIN}/ja/patch/2026-10-05`,
      ko: `${ORIGIN}/ko/patch/2026-10-05`,
      'zh-CN': `${ORIGIN}/zh-CN/patch/2026-10-05`,
      'x-default': `${ORIGIN}/patch/2026-10-05`,
    })
    for (const languages of all) expect(languages).toEqual(all[0])
    // Each page's canonical is its own entry in the shared map.
    for (const l of locales) expect(pageAlternates('/patch/2026-10-05', l, BASE)!.canonical).toBe(all[0][l])
  })

  it('emits nothing without SITE_URL', () => {
    expect(pageAlternates('/heroes', 'en', null)).toBeUndefined()
  })

  it('takes clean app paths only (filters canonicalize to the base path at the call site)', () => {
    expect(() => pageAlternates('/heroes?role=tank', 'en', BASE)).toThrow()
    expect(() => pageAlternates('heroes', 'en', BASE)).toThrow()
  })
})

describe('sitemap', () => {
  const paths = sitemapPaths({ heroes: ['abrams'], items: ['vortex-web'], patches: ['2026-10-05'] })

  it('lists only routes that exist', () => {
    for (const path of paths) expect(existsSync(routeFile(path)), path).toBe(true)
  })

  it('leaves out noindex, internal, API and unbounded detail routes', () => {
    for (const path of paths) expect(path).not.toMatch(/^\/(design|api|players\/|matches\/|builds\/)/)
    expect(STATIC_PATHS).not.toContain('/design')
    expect(STATIC_PATHS).toEqual(expect.arrayContaining(['/', '/heroes', '/items', '/patch', '/patch/compare', '/players', '/leaderboard']))
  })

  it('has one entry per path and locale, each with the full alternate set', () => {
    const entries = sitemapEntries(paths, BASE)
    expect(entries).toHaveLength(paths.length * locales.length)
    expect(entries.map((e) => e.url)).toContain(`${ORIGIN}/th/heroes/abrams`)
    expect(entries.map((e) => e.url)).toContain(ORIGIN)
    for (const e of entries) {
      expect(e.url).not.toMatch(/\/en(\/|$)/)
      expect(Object.keys(e.alternates!.languages!)).toEqual([...locales, 'x-default'])
      expect(Object.values(e.alternates!.languages!)).toContain(e.url)
    }
  })

  it('is empty without SITE_URL', () => {
    expect(sitemapEntries(paths, null)).toEqual([])
  })
})

describe('robots', () => {
  const env = process.env.SITE_URL
  afterEach(() => {
    if (env === undefined) delete process.env.SITE_URL
    else process.env.SITE_URL = env
  })

  it('disallows the design showcase in every locale and API routes', () => {
    const rules = robotsRules(BASE).rules as { disallow: string[] }[]
    expect(rules[0].disallow).toEqual(['/design', '/th/design', '/ja/design', '/ko/design', '/zh-CN/design', '/api/'])
  })

  it('links the sitemap only when SITE_URL is set', () => {
    delete process.env.SITE_URL
    expect(robots().sitemap).toBeUndefined()
    process.env.SITE_URL = `${ORIGIN}/`
    expect(robots().sitemap).toBe(`${ORIGIN}/sitemap.xml`)
  })
})
