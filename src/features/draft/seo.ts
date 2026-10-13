import type { Metadata } from 'next'
import type { Locale } from '@/i18n/config'
import { pageAlternates } from '@/i18n/seo'

/*
 * Draft Lab indexing. The draft lives in the query string, and every pick order is its own URL, so only the
 * empty board (`/draft`) is indexable. Any query string, valid or not, is noindex + nofollow without
 * alternates; robots.txt also disallows those URLs (QUERY_STRING_RULE in src/i18n/seo.ts). Pure.
 */

type SearchParams = Record<string, string | string[] | undefined>

/** Search indexing for a Draft URL: canonical + hreflang without a query string, noindex + nofollow with one. */
export function draftIndexing(searchParams: SearchParams, locale: Locale): Pick<Metadata, 'alternates' | 'robots'> {
  if (Object.keys(searchParams).length > 0) return { robots: { index: false, follow: false } }
  return { alternates: pageAlternates('/draft', locale) }
}
