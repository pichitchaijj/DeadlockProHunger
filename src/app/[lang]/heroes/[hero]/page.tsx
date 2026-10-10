import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { PageContainer } from '@/components/layout/PageContainer'
import { ButtonLink } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { LoadingState } from '@/components/ui/States'
import { getInsightWording } from '@/components/data/insightWording'
import { HeroHeader, HeroTabs, InsightGrid } from '@/features/hero/components/HeroHeader'
import { AbilitiesTab, BuildsTab, MatchesTab, MatchupsTab, OverviewTab, TrendsTab } from '@/features/hero/components/tabs'
import { getOverviewData, heroLoadStatus, loadHeroContext, type HeroContext } from '@/features/hero/loaders'
import { heroIndexing, heroMetaText, type HeroMetaTranslate } from '@/features/hero/seo'
import { heroHref, parseHeroQuery, type HeroQuery } from '@/features/hero/query'
import { DataNotice } from '@/components/data/DataState'
import { attempt } from '@/lib/deadlock/errors'
import { OG_LOCALE } from '@/i18n/config'

type Params = Promise<{ hero: string }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * The API hero name from the shared, request-cached context (no extra fetch), never rebuilt from the slug.
 * Indexable, with canonical and hreflang, only when the hero page renders.
 */
export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }): Promise<Metadata> {
  const { hero: slug } = await params
  const query = parseHeroQuery(await searchParams)
  const [load, t, detailT, locale] = await Promise.all([
    loadHeroContext(slug, query.window, query.rank),
    getTranslations('heroes.meta'),
    getTranslations('heroes.detail'),
    getLocale(),
  ])
  const ctx = load.ok ? load.value : null
  if (!ctx) return { title: detailT('hero'), ...heroIndexing(null, locale, heroLoadStatus(load)) }

  const tr: HeroMetaTranslate = (key, values) => t(key as 'detailTitle', values)
  const { title, description } = heroMetaText(tr, ctx.hero.name)
  return { title, description, ...heroIndexing(`/heroes/${ctx.hero.slug}`, locale, 'ok'), openGraph: { title, description, locale: OG_LOCALE[locale], type: 'website' } }
}

export default async function HeroPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { hero: slug } = await params
  const query = parseHeroQuery(await searchParams)

  const [t, load] = await Promise.all([getTranslations(), loadHeroContext(slug, query.window, query.rank)])
  if (!load.ok) {
    return (
      <PageContainer>
        <h1 className="sr-only">{t('heroes.detail.hero')}</h1>
        <DataNotice error={load.kind} what="Hero data" action={<ButtonLink href={heroHref(slug, query)} variant="secondary" size="sm">{t('common.tryAgain')}</ButtonLink>} />
      </PageContainer>
    )
  }
  const ctx = load.value
  if (!ctx) notFound()

  return (
    <PageContainer className="flex flex-col gap-10">
      <HeroHeader ctx={ctx} query={query} />
      <Suspense fallback={<SectionSkeleton label={t('heroes.detail.loadingInsights')} />}>
        <InsightsAndOverview ctx={ctx} query={query} />
      </Suspense>
    </PageContainer>
  )
}

/**
 * Insights always show; the tab nav and the selected tab follow. Overview reuses the
 * insight data, other tabs stream in on their own.
 */
async function InsightsAndOverview({ ctx, query }: { ctx: HeroContext; query: HeroQuery }) {
  const [result, t, wording] = await Promise.all([attempt('[hero] overview failed', getOverviewData(ctx)), getTranslations('heroes.detail'), getInsightWording()])
  const overview = result.ok ? result.value : null

  return (
    <>
      {overview && ctx.stats && <InsightGrid heroName={ctx.hero.name} tier={ctx.stats.tier} insights={overview.insights} wording={wording} />}
      <div className="flex flex-col gap-6">
        <HeroTabs slug={ctx.hero.slug} query={query} />
        <div id="hero-tab" key={query.tab + query.lane} className="animate-awaken">
          <Suspense fallback={<SectionSkeleton label={t('loadingSection', { section: t(`tabs.${query.tab}`) })} />}>
            {query.tab === 'overview' &&
              (overview ? (
                <OverviewTab ctx={ctx} query={query} data={overview} />
              ) : (
                <DataNotice error={result.ok ? 'unavailable' : result.kind} what="Overview" />
              ))}
            {query.tab === 'builds' && <BuildsTab ctx={ctx} />}
            {query.tab === 'matchups' && <MatchupsTab ctx={ctx} query={query} />}
            {query.tab === 'abilities' && <AbilitiesTab ctx={ctx} />}
            {query.tab === 'trends' && <TrendsTab ctx={ctx} />}
            {query.tab === 'matches' && <MatchesTab ctx={ctx} />}
          </Suspense>
        </div>
      </div>
    </>
  )
}

function SectionSkeleton({ label }: { label: string }) {
  return (
    <LoadingState label={label}>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-56" />
        ))}
      </div>
    </LoadingState>
  )
}
