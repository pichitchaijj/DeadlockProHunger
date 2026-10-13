import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { OG_LOCALE } from '@/i18n/config'
import { DraftView } from '@/features/draft/components/DraftView'
import { getDraftData } from '@/features/draft/loaders'
import { draftIndexing } from '@/features/draft/seo'
import { parseDraftQuery } from '@/features/draft/query'
import { attempt } from '@/lib/deadlock/errors'

/*
 * Draft Lab with Draft parameters (DRAFT_PARAMS): rendered on request. The empty board, a Draft URL with none of
 * them, is rewritten to the cached route ./board (next.config.ts); this route still renders it when reached
 * directly, e.g. in development.
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
  const query = parseDraftQuery(await searchParams)
  const load = await attempt('[draft] load failed', getDraftData(query))
  return <DraftView query={query} data={load.ok ? load.value : null} failed={load.ok ? 'unavailable' : load.kind} />
}
