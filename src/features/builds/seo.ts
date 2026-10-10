import type { Metadata } from 'next'
import type { Locale } from '@/i18n/config'
import { pageAlternates } from '@/i18n/seo'

/*
 * Build detail metadata: the real build and hero names (data, never translated) in a localized template,
 * and indexing only for a build page that renders. Pure; the page adapts its translator to BuildMetaTranslate.
 */

/** The loaders' display name for a build without one (the page shows it; metadata uses the translated fallback). */
export const UNTITLED_BUILD = 'Untitled build'

export const BUILD_NAME_MAX = 60
export const AUTHOR_NAME_MAX = 32

/** Translator for the builds.meta catalog (key + ICU values). */
export type BuildMetaTranslate = (key: string, values?: Record<string, string | number>) => string

/**
 * User-written text for a title: control characters dropped, whitespace collapsed and trimmed, cut at `max`
 * characters (code points, so no split emoji) with an ellipsis. Empty → null.
 */
export function metaText(raw: string | null | undefined, max: number): string | null {
  // oxlint-disable-next-line no-control-regex -- stripping control characters from user-written names is the point
  const text = (raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return null
  const chars = Array.from(text)
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('').trimEnd()}…`
}

/** A build's name for metadata: sanitized, or null when it has none (empty or the loaders' untitled placeholder). */
export function buildMetaName(name: string | null | undefined): string | null {
  const text = metaText(name, BUILD_NAME_MAX)
  return text && text !== UNTITLED_BUILD ? text : null
}

export type BuildMetaInput = { buildId: number; name: string | null; hero: string; author: string | null }

/**
 * Title and description for a loaded build: "{build} · {hero} build", plus "by {author}" when the author's
 * public name is known (it separates same-named builds; never guessed). An untitled build is named by its id.
 */
export function buildMetaText(t: BuildMetaTranslate, { buildId, name, hero, author }: BuildMetaInput): { title: string; description: string } {
  const build = buildMetaName(name) ?? t('untitledBuild', { id: buildId })
  const by = metaText(author, AUTHOR_NAME_MAX)
  return by
    ? { title: t('detailTitleByAuthor', { build, hero, author: by }), description: t('detailDescriptionByAuthor', { build, hero, author: by }) }
    : { title: t('detailTitle', { build, hero }), description: t('detailDescription', { build, hero }) }
}

/** How a build page load ended: rendered, a confirmed missing build (404), a slug redirect, or a failed load. */
export type BuildLoadStatus = 'ok' | 'missing' | 'redirect' | 'failed'

/**
 * Search indexing for a build page: only a rendered build is indexable, with canonical and hreflang on its
 * own path (`/builds/{hero}/{id}`, from the loaded data, so query strings and odd id spellings drop out).
 * Missing (404), redirect and failed loads are noindex without alternates.
 */
export function buildIndexing(path: string | null, locale: Locale, status: BuildLoadStatus): Pick<Metadata, 'alternates' | 'robots'> {
  if (status !== 'ok' || !path) return { robots: { index: false } }
  return { alternates: pageAlternates(path, locale) }
}
