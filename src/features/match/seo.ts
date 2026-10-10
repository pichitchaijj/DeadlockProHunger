import type { Metadata } from 'next'
import type { Locale } from '@/i18n/config'
import { pageAlternates } from '@/i18n/seo'

/** A match id from the URL: up to 12 digits and a safe integer. Anything else can't be a match (the page 404s). */
export function parseMatchId(raw: string): number | null {
  if (!/^\d{1,12}$/.test(raw)) return null
  const id = Number(raw)
  return Number.isSafeInteger(id) ? id : null
}

/** How a match page load ended: loaded, not in the data source (unknown id or not processed yet), or failed. */
export type MatchLoadStatus = 'ok' | 'not-available' | 'failed'

/**
 * Search indexing for a match page: only a loaded match is indexable, with canonical and hreflang.
 * The data source can't confirm that a match doesn't exist (a 404 also means "not processed yet", and
 * unknown ids answer 503 "retry later"), so those states aren't 404s: they're noindex without alternates,
 * and a later crawl indexes the match once it loads.
 */
export function matchIndexing(matchId: number, locale: Locale, status: MatchLoadStatus): Pick<Metadata, 'alternates' | 'robots'> {
  if (status !== 'ok') return { robots: { index: false } }
  return { alternates: pageAlternates(`/matches/${matchId}`, locale) }
}
