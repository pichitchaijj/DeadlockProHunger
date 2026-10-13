import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveRobots } from 'next/dist/build/webpack/loaders/metadata/resolve-route-data'
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
    expect(STATIC_PATHS).toEqual(expect.arrayContaining(['/', '/heroes', '/items', '/patch', '/patch/compare', '/players', '/leaderboard', '/community']))
    expect(STATIC_PATHS).toHaveLength(14)
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

/**
 * robots.txt as Next serves it (the same serializer as the /robots.txt route), parsed back into rules.
 * Matching follows RFC 9309, as Google and Bing do: a rule matches the start of path + query, `*` is any run of
 * characters and a trailing `$` anchors the end; the longest matching rule wins and Allow wins a tie.
 */
const robotsTxt = () => resolveRobots(robotsRules(BASE))

type RobotsRule = { allow: boolean; pattern: string }

function parseRules(txt: string): RobotsRule[] {
  return txt
    .split('\n')
    .map((line) => /^(Allow|Disallow):\s*(.*)$/i.exec(line.trim()))
    .filter((m): m is RegExpExecArray => m !== null && m[2] !== '')
    .map((m) => ({ allow: m[1].toLowerCase() === 'allow', pattern: m[2] }))
}

function allowed(url: string, rules: RobotsRule[] = parseRules(robotsTxt())): boolean {
  let best: { allow: boolean; length: number } | null = null
  for (const { allow, pattern } of rules) {
    const anchored = pattern.endsWith('$')
    const body = (anchored ? pattern.slice(0, -1) : pattern)
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')
    if (!new RegExp(`^${body}${anchored ? '$' : ''}`).test(url)) continue
    if (!best || pattern.length > best.length || (pattern.length === best.length && allow)) best = { allow, length: pattern.length }
  }
  return best?.allow ?? true
}

/** Path + query of an absolute URL, as a crawler matches it against robots.txt. */
const pathOf = (url: string) => {
  const u = new URL(url)
  return `${u.pathname}${u.search}`
}

describe('robots', () => {
  const env = process.env.SITE_URL
  afterEach(() => {
    if (env === undefined) delete process.env.SITE_URL
    else process.env.SITE_URL = env
  })

  it('has exactly these rules: assets and icons allowed; design, player profiles, query strings and API routes disallowed', () => {
    const [rule] = robotsRules(BASE).rules as { userAgent: string; allow: string[]; disallow: string[] }[]
    expect(rule.userAgent).toBe('*')
    expect(rule.allow).toEqual(['/', '/_next/', '/icon.png', '/apple-icon.png'])
    expect(rule.disallow).toEqual([
      '/design', '/th/design', '/ja/design', '/ko/design', '/zh-CN/design',
      '/players/', '/th/players/', '/ja/players/', '/ko/players/', '/zh-CN/players/',
      '/*?',
      '/api/',
    ])
    // The served text, exactly as Next serializes it: one line per rule, in this order. (Order doesn't change
    // RFC 9309 matching, where the longest rule wins, but a diff here shows any change to the file.)
    expect(robotsTxt()).toBe(
      [
        'User-Agent: *',
        'Allow: /',
        'Allow: /_next/',
        'Allow: /icon.png',
        'Allow: /apple-icon.png',
        ...['/design', '/th/design', '/ja/design', '/ko/design', '/zh-CN/design'].map((p) => `Disallow: ${p}`),
        ...['/players/', '/th/players/', '/ja/players/', '/ko/players/', '/zh-CN/players/'].map((p) => `Disallow: ${p}`),
        'Disallow: /*?',
        'Disallow: /api/',
        '',
        `Sitemap: ${ORIGIN}/sitemap.xml`,
        '',
      ].join('\n'),
    )
  })

  it('never blocks a sitemap URL, in any locale', () => {
    const paths = sitemapPaths({ heroes: ['abrams', 'haze'], items: ['vortex-web'], patches: ['2026-10-05'] })
    const entries = sitemapEntries(paths, BASE)
    expect(entries).toHaveLength(paths.length * locales.length)
    for (const { url } of entries) expect(allowed(pathOf(url)), url).toBe(true)
  })

  it('never blocks a canonical URL (canonicals are clean paths)', () => {
    for (const path of [...STATIC_PATHS, '/heroes/haze', '/items/vortex-web', '/builds/haze/278481', '/matches/112305615', '/patch/2026-10-05']) {
      for (const l of locales) {
        const canonical = pageAlternates(path, l, BASE)!.canonical
        expect(canonical, canonical).not.toContain('?')
        expect(allowed(pathOf(canonical)), canonical).toBe(true)
      }
    }
  })

  it('keeps clean match detail URLs crawlable in every locale', () => {
    for (const l of locales) {
      expect(allowed(localizedPath('/matches/112305615', l)), l).toBe(true)
      expect(allowed(localizedPath('/matches', l)), l).toBe(true)
    }
  })

  it('blocks query-string variants of every page in every locale', () => {
    const variants = [
      '/?ref=x',
      '/meta?window=30d&rank=top&sort=winRate&dir=desc',
      '/heroes?role=tank',
      '/heroes/haze?tab=matchups&window=30d',
      '/items?hero=haze&sort=buyRate&dir=asc',
      '/items/vortex-web?hero=haze&rank=high',
      '/builds?category=meta&hero=haze',
      '/builds/haze/278481?rank=top',
      '/matches?player=1871021649&date=7d',
      '/matches/112305615?utm_source=x',
      '/analyze?hero=haze&peers=all',
      '/leaderboard?view=performance&page=3',
      '/players?q=abc',
      '/compare?type=heroes&a=haze&b=abrams',
      '/patch?rank=top',
      '/patch/2026-10-05?hero=haze',
      '/patch/compare?a=2026-09-01&b=2026-10-05',
      '/community?x=1',
    ]
    for (const l of locales) {
      for (const v of variants) {
        const [path, query] = v.split('?')
        const url = `${localizedPath(path, l)}?${query}`
        expect(allowed(url), url).toBe(false)
      }
    }
  })

  it('blocks player profiles but keeps the clean player directory crawlable, in every locale', () => {
    for (const l of locales) {
      expect(allowed(localizedPath('/players', l)), l).toBe(true)
      expect(allowed(localizedPath('/players/1871021649', l)), l).toBe(false)
      expect(allowed(`${localizedPath('/players/1871021649', l)}?page=2`), l).toBe(false)
    }
  })

  it('keeps Next assets and the app icons reachable, query strings included', () => {
    for (const url of [
      '/_next/static/chunks/main-app.js',
      '/_next/static/chunks/app/page-abc123.js?dpl=dpl_123',
      '/_next/static/css/app.css?dpl=dpl_123',
      '/_next/static/media/font.woff2',
      '/_next/',
      '/icon.png',
      '/icon.png?icon.20yokcf9bmev1.png',
      '/apple-icon.png',
      '/apple-icon.png?apple-icon.30jm-h-6n-p-e.png',
      '/brand/logo-primary.webp',
    ]) expect(allowed(url), url).toBe(true)
  })

  it('keeps the Draft Lab protection: query URLs blocked, the empty board crawlable', () => {
    for (const l of locales) {
      const base = localizedPath('/draft', l)
      expect(allowed(base), base).toBe(true)
      expect(allowed(`${base}?allies=haze,abrams&enemies=seven`), l).toBe(false)
      expect(allowed(`${base}?utm_source=x`), l).toBe(false)
    }
    expect(allowed('/ja/draft?side=enemies&window=30d&rank=top')).toBe(false)
  })

  it('still blocks the design showcase and API routes', () => {
    for (const l of locales) expect(allowed(localizedPath('/design', l)), l).toBe(false)
    expect(allowed('/api/search?q=haze')).toBe(false)
    expect(allowed('/api/cron/prewarm')).toBe(false)
  })

  it('matches rules the RFC 9309 way (checks the test matcher itself)', () => {
    const rules = [
      { allow: true, pattern: '/' },
      { allow: false, pattern: '/*?' },
      { allow: true, pattern: '/_next/' },
      { allow: false, pattern: '/x$' },
    ]
    expect(allowed('/a', rules)).toBe(true)
    expect(allowed('/a?b', rules)).toBe(false) // '/*?' (3 chars) beats '/' (1)
    expect(allowed('/_next/a?b', rules)).toBe(true) // '/_next/' (7) beats '/*?' (3)
    expect(allowed('/x', rules)).toBe(false)
    expect(allowed('/xy', rules)).toBe(true) // '$' anchors the end
    expect(allowed('/a', [{ allow: false, pattern: '/a' }, { allow: true, pattern: '/a' }])).toBe(true) // tie: Allow wins
  })

  it('links the sitemap only when SITE_URL is set', () => {
    delete process.env.SITE_URL
    expect(robots().sitemap).toBeUndefined()
    process.env.SITE_URL = `${ORIGIN}/`
    expect(robots().sitemap).toBe(`${ORIGIN}/sitemap.xml`)
  })
})
