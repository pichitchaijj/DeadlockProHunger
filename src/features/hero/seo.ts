import type { Metadata } from 'next'
import type { Locale } from '@/i18n/config'
import { pageAlternates } from '@/i18n/seo'

/*
 * Hero detail metadata: the API hero name (data, never rebuilt from the URL slug) in a localized template,
 * and indexing only for a hero page that renders. Pure; the page adapts its translator to HeroMetaTranslate.
 */

/** Translator for the heroes.meta catalog (key + ICU values). */
export type HeroMetaTranslate = (key: string, values?: Record<string, string | number>) => string

/** Title and description for a loaded hero: "{hero}: Deadlock stats, builds & matchups" and the localized summary. */
export function heroMetaText(t: HeroMetaTranslate, hero: string): { title: string; description: string } {
  return { title: t('detailTitle', { hero }), description: t('detailDescription', { hero }) }
}

/** How a hero page load ended: rendered, a confirmed missing hero (404), or a failed load. */
export type HeroLoadStatus = 'ok' | 'missing' | 'failed'

/**
 * Search indexing for a hero page: only a rendered hero is indexable, with canonical and hreflang on its own
 * path (`/heroes/{slug}`, from the loaded hero, so query strings drop out). Missing (404) and failed loads are
 * noindex without alternates.
 */
export function heroIndexing(path: string | null, locale: Locale, status: HeroLoadStatus): Pick<Metadata, 'alternates' | 'robots'> {
  if (status !== 'ok' || !path) return { robots: { index: false } }
  return { alternates: pageAlternates(path, locale) }
}
