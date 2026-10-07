import { createNavigation } from 'next-intl/navigation'
import { defaultLocale, locales, type Locale } from './config'
import { routing } from './routing'

/*
 * Locale-aware navigation: the single source of truth for internal URLs.
 *
 * - `Link` and `useRouter` take app paths ('/heroes/abrams?tab=items') and add the active
 *   locale's prefix (none for English). External URLs, '#hash' and '?query' hrefs pass through untouched.
 * - `usePathname` returns the app path without the locale prefix ('/th/heroes' → '/heroes').
 * - `getPathname({ href, locale })` is the same rule as a function; Server Components use
 *   `localePath(href)` (./server.ts) for form actions and redirects (next/navigation `redirect`).
 *
 * Use these instead of next/link and next/navigation's router/pathname for every internal link.
 */
export const { Link, usePathname, useRouter, getPathname } = createNavigation(routing)

/** A browser pathname split into its locale and the app path: '/th/heroes' → { th, '/heroes' }. */
export function splitLocalePath(pathname: string): { locale: Locale; path: string } {
  const [, first = ''] = pathname.split('/')
  const locale = locales.find((l) => l !== defaultLocale && l === first)
  return locale ? { locale, path: pathname.slice(locale.length + 1) || '/' } : { locale: defaultLocale, path: pathname }
}

/**
 * The current page in another locale (the language switcher): same path, route params and query.
 * `pathname` is the browser pathname (with or without a locale prefix), `search` the query string.
 * English stays unprefixed: '/th/heroes?window=30d' → 'en' → '/heroes?window=30d'.
 */
export function switchLocaleHref(pathname: string, search: string, locale: Locale): string {
  const { path } = splitLocalePath(pathname)
  const query = search.replace(/^\?/, '')
  return getPathname({ href: query ? `${path}?${query}` : path, locale })
}
