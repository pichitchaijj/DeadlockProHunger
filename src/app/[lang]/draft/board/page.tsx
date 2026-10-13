import type { Metadata } from 'next'
import { PHASE_PRODUCTION_BUILD } from 'next/constants'
import { getLocale, getTranslations } from 'next-intl/server'
import { OG_LOCALE } from '@/i18n/config'
import { DraftView } from '@/features/draft/components/DraftView'
import { getDraftData } from '@/features/draft/loaders'
import { draftIndexing } from '@/features/draft/seo'
import { parseDraftQuery } from '@/features/draft/query'
import { attempt } from '@/lib/deadlock/errors'

/*
 * The empty Draft board, cached (ISR). Requests for `/{lang}/draft` with no Draft parameter (DRAFT_PARAMS) are
 * rewritten here (next.config.ts), so the URL stays `/draft`; this path itself redirects to `/draft` when
 * requested directly. It never reads the query string: every visitor gets the same board.
 *
 * A failed load during a background regeneration throws, so Next keeps serving the last good page and retries
 * on a later request. During `next build` there is no earlier page to keep, so the failure notice is rendered
 * instead of failing the deploy (it is replaced at the first successful regeneration).
 */

export const revalidate = 900

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations('draft.meta'), getLocale()])
  return {
    title: t('title'),
    description: t('description'),
    ...draftIndexing({}, locale),
    openGraph: { title: t('title'), description: t('description'), locale: OG_LOCALE[locale], type: 'website' },
  }
}

export default async function DraftBoardPage() {
  const query = parseDraftQuery({})
  const load = await attempt('[draft] board load failed', getDraftData(query))
  if (!load.ok && process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) throw new Error(`Draft board data unavailable (${load.kind})`)
  return <DraftView query={query} data={load.ok ? load.value : null} failed={load.ok ? 'unavailable' : load.kind} />
}
