import { createNavigation } from 'next-intl/navigation'
import { publicAppPath } from '@/features/draft/routing'
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

/**
 * A pathname split into its locale and the app path: '/th/heroes' → { th, '/heroes' }. English is unprefixed in
 * the browser, but a page prerendered for English sees its internal path ('/en/heroes') while rendering on the
 * server, so an '/en' first segment is read as English too.
 */
export function splitLocalePath(pathname: string): { locale: Locale; path: string } {
  const [, first = ''] = pathname.split('/')
  const locale = locales.find((l) => l === first)
  return locale ? { locale, path: pathname.slice(locale.length + 1) || '/' } : { locale: defaultLocale, path: pathname }
}

/**
 * The current page in another locale (the language switcher): same path, route params and query.
 * `pathname` is the browser pathname (with or without a locale prefix; internal rewrite targets map to their
 * public path), `search` the query string.
 * English stays unprefixed: '/th/heroes?window=30d' → 'en' → '/heroes?window=30d'.
 */
export function switchLocaleHref(pathname: string, search: string, locale: Locale): string {
  // A cached page reached through a rewrite (the empty Draft board) sees its internal path while prerendering.
  const path = publicAppPath(splitLocalePath(pathname).path)
  const query = search.replace(/^\?/, '')
  return getPathname({ href: query ? `${path}?${query}` : path, locale })
}

/**
 * `rel` for a language-switch link: "nofollow" when it carries the page's query string (filter or Draft state,
 * a near-unbounded set of URLs), none for a plain page. `search` is the query string, with or without '?'.
 */
export function switchLocaleRel(search: string): 'nofollow' | undefined {
  return search.replace(/^\?/, '') ? 'nofollow' : undefined
}
