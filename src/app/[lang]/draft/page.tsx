import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { OG_LOCALE } from '@/i18n/config'
import { localePath } from '@/i18n/server'
import { DraftView } from '@/features/draft/components/DraftView'
import { getDraftData } from '@/features/draft/loaders'
import { draftIndexing } from '@/features/draft/seo'
import { canonicalDraftHref, parseDraftQuery } from '@/features/draft/query'
import { attempt } from '@/lib/deadlock/errors'

/*
 * Draft Lab with Draft parameters (DRAFT_PARAMS): rendered on request. The empty board, a Draft URL with none of
 * them, is rewritten to the cached route ./board (next.config.ts); this route still renders it when reached
 * directly, e.g. in development. Non-canonical Draft parameters redirect (307) to the canonical URL
 * (canonicalDraftHref); no loading.tsx here, so the redirect is a real status, not a streamed one.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const [t, locale, params] = await Promise.all([getTranslations('draft.meta'), getLocale(), searchParams])
  return {
    title: t('title'),
    description: t('description'),
    ...draftIndexing(params, locale),
    openGraph: { title: t('title'), description: t('description'), locale: OG_LOCALE[locale], type: 'website' },
  }
}

export default async function DraftPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams
  const query = parseDraftQuery(raw)
  const load = await attempt('[draft] load failed', getDraftData(query))
  if (load.ok) {
    // A non-canonical Draft URL (defaults, duplicates, unknown heroes...) redirects to the one URL for the board it
    // shows. Only after a successful load: unknown heroes can't be told from valid ones without the hero list.
    const shown = { ...query, allies: load.value.allies.map((h) => h.slug), enemies: load.value.enemies.map((h) => h.slug) }
    const canonical = canonicalDraftHref(raw, shown)
    if (canonical) redirect(await localePath(canonical))
  }
  return <DraftView query={query} data={load.ok ? load.value : null} failed={load.ok ? 'unavailable' : load.kind} />
}
