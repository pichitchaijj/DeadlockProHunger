import type { MetadataRoute } from 'next'
import { secondaryNav, primaryNav } from '@/config/navigation'
import { defaultLocale, locales, type Locale } from './config'

/*
 * Search metadata for the locale routing (src/i18n/routing.ts): canonical URLs, hreflang alternates, sitemap
 * entries and robots rules. Pure: no request headers, so static pages stay static.
 *
 * Everything hangs on SITE_URL (the production origin, server-side; .env.example). Unset or invalid, no
 * absolute URL is emitted (no canonical, hreflang, metadataBase or sitemap entries), so local builds and
 * previews never point search engines at a guessed host.
 */

/** The production origin from SITE_URL ("https://example.com", no path), or null when unset or not http(s). */
export function parseSiteUrl(raw: string | undefined): URL | null {
  if (!raw?.trim()) return null
  try {
    const url = new URL(raw.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? new URL(url.origin) : null
  } catch {
    return null
  }
}

export const siteUrl = (): URL | null => parseSiteUrl(process.env.SITE_URL)

/** An app path ('/heroes') in a locale: English unprefixed, others prefixed ('/th/heroes', '/th' for home). */
export function localizedPath(path: string, locale: Locale): string {
  if (locale === defaultLocale) return path
  return path === '/' ? `/${locale}` : `/${locale}${path}`
}

/** Absolute URL; the English home is the bare origin, as Next writes it in <head> (so sitemap and canonical agree). */
const absolute = (path: string, base: URL) => (path === '/' ? base.origin : new URL(path, base).href)

/** hreflang map for an app path: every locale plus x-default (English). */
function languages(path: string, base: URL): Record<string, string> {
  return {
    ...Object.fromEntries(locales.map((l) => [l, absolute(localizedPath(path, l), base)])),
    'x-default': absolute(localizedPath(path, defaultLocale), base),
  }
}

/**
 * `alternates` for a public page: canonical = this locale's clean URL (query strings dropped, never another
 * locale), languages = the same path in every locale. Undefined without SITE_URL.
 * `path` is the app path without locale prefix or query ('/heroes/abrams').
 */
export function pageAlternates(path: string, locale: Locale, base: URL | null = siteUrl()): { canonical: string; languages: Record<string, string> } | undefined {
  if (!base) return undefined
  if (!path.startsWith('/') || /[?#]/.test(path)) throw new Error(`pageAlternates needs a clean app path, got "${path}"`)
  return { canonical: absolute(localizedPath(path, locale), base), languages: languages(path, base) }
}

/**
 * Indexable list pages: every built nav section, plus Patch compare. Player and match details are unbounded
 * (and player profiles are noindex); build details aren't enumerable, so only their list pages are listed.
 */
export const STATIC_PATHS: string[] = [...[...primaryNav, ...secondaryNav].filter((i) => i.built).map((i) => i.href), '/patch/compare']

export type SitemapSources = { heroes: string[]; items: string[]; patches: string[] }

/** App paths for the sitemap: the static pages, then hero, item and patch details from their own route sources. */
export function sitemapPaths({ heroes, items, patches }: SitemapSources): string[] {
  return [...STATIC_PATHS, ...heroes.map((s) => `/heroes/${s}`), ...items.map((s) => `/items/${s}`), ...patches.map((id) => `/patch/${id}`)]
}

/** One entry per path and locale, each listing every alternate. Empty without SITE_URL. */
export function sitemapEntries(paths: string[], base: URL | null = siteUrl()): MetadataRoute.Sitemap {
  if (!base) return []
  return [...new Set(paths)].flatMap((path) => locales.map((locale) => ({ url: absolute(localizedPath(path, locale), base), alternates: { languages: languages(path, base) } })))
}

/** robots.txt: the design showcase (every locale prefix) and API routes are off limits; the sitemap when SITE_URL is set. */
export function robotsRules(base: URL | null = siteUrl()): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: [...locales.map((l) => localizedPath('/design', l)), '/api/'] }],
    ...(base && { sitemap: absolute('/sitemap.xml', base) }),
  }
}
