import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { ScopeLine } from '@/components/data/ScopeLine'
import { PageContainer } from '@/components/layout/PageContainer'
import { ButtonLink } from '@/components/ui/Button'
import { SectionHeader } from '@/components/ui/SectionHeader'

import { HeroDirectory } from '@/features/heroes/components/HeroDirectory'
import { getDirectoryData } from '@/features/heroes/loaders'
import { heroesHref, parseScope, parseView } from '@/features/heroes/query'
import { DataNotice } from '@/components/data/DataState'
import { WithClientMessages } from '@/i18n/WithClientMessages'
import { OG_LOCALE } from '@/i18n/config'
import { pageAlternates } from '@/i18n/seo'
import { getScopeWording } from '@/components/data/scopeWording'

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations('heroes.meta'), getLocale()])
  return {
    title: t('listTitle'),
    description: t('listDescription'),
    alternates: pageAlternates('/heroes', locale),
    openGraph: { title: t('listTitle'), description: t('listDescription'), locale: OG_LOCALE[locale], type: 'website' },
  }
}

/** The directory filters and counts in the browser: their messages are sent to this page only. */
const DIRECTORY_MESSAGES = ['heroes.list', 'cards'] as const

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function HeroesPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams
  const scope = parseScope(raw)
  const view = parseView(raw)
  const [data, t, common, scopeWords] = await Promise.all([getDirectoryData(scope), getTranslations('heroes.list'), getTranslations('common'), getScopeWording()])

  return (
    <PageContainer className="flex flex-col gap-8">
      <SectionHeader
        as="h1"
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
      />
      {data.ok ? (
        <>
          <WithClientMessages paths={DIRECTORY_MESSAGES}>
            <HeroDirectory heroes={data.heroes} scope={scope} initialView={view} windowLabels={scopeWords.windowLabels(data.windows)} rankLabels={scopeWords.rankLabels(data.rankRefs)} ranks={data.ranks} />
          </WithClientMessages>
          <ScopeLine scope={data.scope} />
        </>
      ) : (
        <DataNotice error={data.kind} what="Hero directory" action={<ButtonLink href={heroesHref(scope, view)} variant="secondary" size="sm">{common('tryAgain')}</ButtonLink>} />
      )}
    </PageContainer>
  )
}
