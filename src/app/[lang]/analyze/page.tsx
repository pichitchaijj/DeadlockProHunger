import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { useLocale, useTranslations } from 'next-intl'
import { Suspense } from 'react'
import { OG_LOCALE } from '@/i18n/config'
import { WinRate } from '@/components/cards/WinRate'
import { ConfidenceBadge } from '@/components/data/ConfidenceBadge'
import { DataNotice } from '@/components/data/DataState'
import { ScopeLine } from '@/components/data/ScopeLine'
import { PageContainer } from '@/components/layout/PageContainer'
import { ButtonLink } from '@/components/ui/Button'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, LoadingState } from '@/components/ui/States'
import { attempt } from '@/lib/deadlock/errors'
import { formatInteger } from '@/lib/format'
import type { StatScope } from '@/lib/analytics/scope'
import { capitalize, type RoleStat } from '@/features/meta/model'
import { Controls } from '@/features/analyze/components/Controls'
import { Block, BuildsSection, ComparisonSection, DataContext, HeroSummary, InsightsSection, MatchupsSection, TrendsSection } from '@/features/analyze/components/Sections'
import { getAnalyzeHero, getAnalyzeMeta, getPickerHeroes } from '@/features/analyze/loaders'
import { peerComparison } from '@/features/analyze/model'
import { analyzeHref, parseAnalyzeQuery } from '@/features/analyze/query'
import { getScopeWording } from '@/components/data/scopeWording'

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations('analyze.meta'), getLocale()])
  return {
    title: t('title'),
    description: t('description'),
    openGraph: { title: t('title'), description: t('description'), locale: OG_LOCALE[locale], type: 'website' },
  }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function AnalyzePage({ searchParams }: { searchParams: SearchParams }) {
  const query = parseAnalyzeQuery(await searchParams)
  const [meta, heroResult, pickerResult, t, common] = await Promise.all([
    getAnalyzeMeta(query),
    attempt('[analyze] hero context failed', getAnalyzeHero(query)),
    attempt('[analyze] hero list failed', getPickerHeroes()),
    getTranslations('analyze'),
    getTranslations('common'),
  ])
  const scopeWords = await getScopeWording()

  const header = <SectionHeader as="h1" eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />

  if (!meta.ok) {
    return (
      <PageContainer className="flex flex-col gap-8">
        {header}
        <DataNotice error={meta.kind} what="Hero statistics" action={<ButtonLink href={analyzeHref(query)} variant="secondary" size="sm">{common('tryAgain')}</ButtonLink>} />
      </PageContainer>
    )
  }

  const ctx = heroResult.ok ? heroResult.value : null
  const unknownHero = query.hero !== null && heroResult.ok && !ctx
  const comparison = ctx ? peerComparison(meta.model.heroes, ctx.hero.id, query.peers) : null

  return (
    <PageContainer className="flex flex-col gap-(--spacing-section)">
      <div className="flex flex-col gap-6">
        {header}
        <Controls query={query} heroes={pickerResult.ok ? pickerResult.value : meta.model.heroes} rankLabels={scopeWords.rankLabels(meta.rankRefs)} ranks={meta.ranks} windowLabels={scopeWords.windowLabels(meta.windows)} selectedName={ctx?.hero.name ?? null} />
      </div>

      {!heroResult.ok ? (
        <DataNotice error={heroResult.kind} what="Hero analysis" action={<ButtonLink href={analyzeHref(query)} variant="secondary" size="sm">{common('tryAgain')}</ButtonLink>} />
      ) : unknownHero ? (
        <EmptyState title={t('unknownHeroTitle')} description={t('unknownHeroDescription')} />
      ) : !ctx ? (
        <RoleOverview roles={meta.model.summary.roles} clear={meta.model.summary.roleLeaderIsClear} scope={meta.scope} />
      ) : (
        <>
          <HeroSummary ctx={ctx} query={query} />
          <Suspense fallback={<SectionSkeleton label={t('loading.insights')} cards={4} />}>
            <InsightsSection ctx={ctx} />
          </Suspense>
          <Suspense fallback={<SectionSkeleton label={t('loading.trends')} cards={2} />}>
            <TrendsSection ctx={ctx} query={query} />
          </Suspense>
          {comparison && <ComparisonSection comparison={comparison} query={query} heroName={ctx.hero.name} />}
          <Suspense fallback={<SectionSkeleton label={t('loading.builds')} cards={3} />}>
            <BuildsSection ctx={ctx} query={query} />
          </Suspense>
          <Suspense fallback={<SectionSkeleton label={t('loading.matchups')} cards={2} />}>
            <MatchupsSection ctx={ctx} query={query} />
          </Suspense>
          <DataContext />
        </>
      )}
    </PageContainer>
  )
}

/** Before a hero is chosen: each role's pooled win rate in the scope, as a starting point. */
function RoleOverview({ roles, clear, scope }: { roles: RoleStat[]; clear: boolean; scope: StatScope }) {
  const t = useTranslations('analyze.roles')
  return (
    <Block id="analyze-roles" title={t('title')} description={t('description')}>
      <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-(--spacing-card) shadow-card">
        <ScopeLine scope={scope} />
        <RoleRows roles={roles} />
        <p className="text-caption text-text-muted">
          {clear ? t('clear') : t('overlap')} {t('source')}
        </p>
      </div>
    </Block>
  )
}

function RoleRows({ roles }: { roles: RoleStat[] }) {
  const t = useTranslations('analyze.roles')
  const heroes = useTranslations('heroes.trendChart')
  const locale = useLocale()
  if (roles.length === 0) return <p className="text-sm text-text-muted">{t('none')}</p>
  return (
    <ul className="flex flex-col divide-y divide-border">
      {roles.map((r) => (
        <li key={r.role} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
          <span className="min-w-0 flex-1 font-ui text-sm font-semibold text-text">
            {capitalize(r.role)} <span className="font-normal text-text-muted">· {t('heroCount', { count: r.heroes })}</span>
          </span>
          <span className="text-caption text-text-muted tabular">
            {t('record', { wins: formatInteger(r.wins, locale), matches: formatInteger(r.matches, locale) })}
          </span>
          <span className="sr-only">{heroes('winRate')}</span>
          <WinRate value={r.winRate} className="w-28 shrink-0" />
          <ConfidenceBadge sampleSize={r.matches} interval={r.interval} />
        </li>
      ))}
    </ul>
  )
}

function SectionSkeleton({ label, cards }: { label: string; cards: number }) {
  return (
    <LoadingState label={label}>
      <div className="flex flex-col gap-4">
        <Skeleton shape="text" className="w-1/3" />
        <div className={cards >= 3 ? 'grid gap-4 lg:grid-cols-3' : 'grid gap-4 lg:grid-cols-2'}>
          {Array.from({ length: cards }, (_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      </div>
    </LoadingState>
  )
}
