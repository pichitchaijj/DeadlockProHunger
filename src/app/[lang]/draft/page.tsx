import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import { OG_LOCALE } from '@/i18n/config'
import { PageContainer } from '@/components/layout/PageContainer'
import { ButtonLink } from '@/components/ui/Button'
import { Filter } from '@/components/ui/Filter'
import { SectionHeader } from '@/components/ui/SectionHeader'

import { rankBandOptions } from '@/features/meta/rankFilter'
import { HeroPicker, TeamSlots } from '@/features/draft/components/Board'
import { Balance, Recommendations, RoleCoverage, WeakPoints } from '@/features/draft/components/Insights'
import { RelationMap } from '@/features/draft/components/RelationMap'
import { getDraftData } from '@/features/draft/loaders'
import { draftHref, parseDraftQuery, TEAM_SIZE } from '@/features/draft/query'
import { DataNotice } from '@/components/data/DataState'
import { attempt } from '@/lib/deadlock/errors'
import { getScopeWording } from '@/components/data/scopeWording'

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations('draft.meta'), getLocale()])
  return {
    title: t('title'),
    description: t('description'),
    openGraph: { title: t('title'), description: t('description'), locale: OG_LOCALE[locale], type: 'website' },
  }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function Panel({ id, title, description, children, className }: { id: string; title: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={`flex flex-col gap-3 rounded-md border border-border bg-surface/60 p-(--spacing-card) ${className ?? ''}`}>
      <div>
        <h2 id={id} className="font-display text-title font-bold text-text uppercase">{title}</h2>
        {description && <p className="text-sm text-text-muted">{description}</p>}
      </div>
      {children}
    </section>
  )
}

export default async function DraftPage({ searchParams }: { searchParams: SearchParams }) {
  const query = parseDraftQuery(await searchParams)
  const [dataLoad, t, common, builds] = await Promise.all([
    attempt('[draft] load failed', getDraftData(query)),
    getTranslations('draft'),
    getTranslations('common'),
    getTranslations('builds'),
  ])
  const scopeWords = await getScopeWording()
  const data = dataLoad.ok ? dataLoad.value : null
  const failed = dataLoad.ok ? 'unavailable' : dataLoad.kind

  return (
    <PageContainer className="flex flex-col gap-6">
      <SectionHeader as="h1" eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      {!data ? (
        <DataNotice error={failed} what="Draft data" action={<ButtonLink href={draftHref(query)} variant="secondary" size="sm">{common('tryAgain')}</ButtonLink>} />
      ) : (
        <>
          <div className="grid gap-4 rounded-md border border-border bg-surface/60 p-(--spacing-card) md:grid-cols-2">
            <Filter label={builds('detail.window')} value={query.window} options={(['patch', '7d', '30d'] as const).map((w) => ({ value: w, label: scopeWords.window(data.windows[w], { short: true }), href: draftHref(query, { window: w }) }))} />
            <Filter label={builds('list.rank')} value={query.rank} options={rankBandOptions(scopeWords.rankLabels(data.rankRefs), data.ranks, (rank) => draftHref(query, { rank }))} />
          </div>

          <TeamSlots query={query} allies={data.allies} enemies={data.enemies} base={data.baseWinRate} />
          <HeroPicker query={query} heroes={data.heroes} />
          <p className="text-caption text-text-muted">{t('scopeNote', { scope: scopeWords.scope(data.scope) })}</p>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Panel id="relations" title={t('panels.relations')} description={t('panels.relationsDescription')}>
              {data.allies.length + data.enemies.length < 2 ? (
                <p className="text-sm text-text-muted">{t('panels.needTwo')}</p>
              ) : (
                <RelationMap allies={data.allies} enemies={data.enemies} relations={data.relations.clear} checked={data.relations.checked} withData={data.relations.withData} />
              )}
            </Panel>
            <Panel id="recs" title={t('panels.recs')} description={t('panels.recsDescription')}>
              <Recommendations query={query} recs={data.recommendations} heroes={data.heroes} hasPicks={data.allies.length + data.enemies.length > 0} alliesFull={data.allies.length >= TEAM_SIZE} />
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel id="weak" title={t('panels.weak')} description={t('panels.weakDescription')}>
              <WeakPoints points={data.weakPoints} hasAllies={data.allies.length > 0} />
            </Panel>
            <Panel id="roles" title={t('panels.roles')}>
              <RoleCoverage allies={data.allies} enemies={data.enemies} />
            </Panel>
            <Panel id="balance" title={t('panels.balance')}>
              <Balance allies={data.balance.allies} enemies={data.balance.enemies} />
            </Panel>
          </div>

          <p className="text-caption text-text-muted">{t('howItWorks')}</p>
        </>
      )}
    </PageContainer>
  )
}
