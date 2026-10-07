import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { PageContainer } from '@/components/layout/PageContainer'
import { ButtonLink } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { LoadingState } from '@/components/ui/States'
import { HeroHeader, HeroTabs, InsightGrid } from '@/features/hero/components/HeroHeader'
import { AbilitiesTab, BuildsTab, MatchesTab, MatchupsTab, OverviewTab, TrendsTab } from '@/features/hero/components/tabs'
import { getHeroContext, getOverviewData, type HeroContext } from '@/features/hero/loaders'
import { heroHref, parseHeroQuery, type HeroQuery } from '@/features/hero/query'
import { DataNotice } from '@/components/data/DataState'
import { attempt, classifyError } from '@/lib/deadlock/errors'

type Params = Promise<{ hero: string }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { hero } = await params
  const name = hero
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
  return { title: name, description: `${name} in Deadlock: win rate, pick rate, matchups, builds and ability order, from match data.` }
}

export default async function HeroPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { hero: slug } = await params
  const query = parseHeroQuery(await searchParams)

  let ctx: HeroContext | null
  try {
    ctx = await getHeroContext(slug, query)
  } catch (error) {
    console.error('[hero] context failed', error)
    return (
      <PageContainer>
        <h1 className="sr-only">Hero</h1>
        <DataNotice error={classifyError(error)} what="Hero data" action={<ButtonLink href={heroHref(slug, query)} variant="secondary" size="sm">Try again</ButtonLink>} />
      </PageContainer>
    )
  }
  if (!ctx) notFound()

  return (
    <PageContainer className="flex flex-col gap-10">
      <HeroHeader ctx={ctx} query={query} />
      <Suspense fallback={<SectionSkeleton label="Loading insights" />}>
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
  const result = await attempt('[hero] overview failed', getOverviewData(ctx))
  const overview = result.ok ? result.value : null

  return (
    <>
      {overview && ctx.stats && <InsightGrid heroName={ctx.hero.name} tier={ctx.stats.tier} insights={overview.insights} />}
      <div className="flex flex-col gap-6">
        <HeroTabs slug={ctx.hero.slug} query={query} />
        <div id="hero-tab" key={query.tab + query.lane} className="animate-awaken">
          <Suspense fallback={<SectionSkeleton label={`Loading ${query.tab}`} />}>
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
