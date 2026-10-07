import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'
import { BuildCard } from '@/components/cards/BuildCard'
import { MatchCard } from '@/components/cards/MatchCard'
import { DataNotice, Freshness } from '@/components/data/DataState'
import { ScopeLine } from '@/components/data/ScopeLine'
import { Sparkline } from '@/components/data/Sparkline'
import { StatCard } from '@/components/data/StatCard'
import { TrendBadge } from '@/components/data/TrendBadge'
import { Reveal } from '@/components/motion/Reveal'
import { ButtonLink } from '@/components/ui/Button'
import { ArrowRightIcon } from '@/components/ui/icons'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/States'
import { getHomeBuilds, getHomeMatches, getHomeMeta, getHomePatch, getHomePerformance, getHomeSource } from '@/features/home/loaders'
import { HeroPerformance } from '@/features/home/components/HeroPerformance'
import { HeroTrendColumn } from '@/features/home/components/HeroTrendColumn'
import { HeroStats, HeroStatsSkeleton, HomeHero } from '@/features/home/components/HomeHero'
import { HomeSection } from '@/features/home/components/HomeSection'
import { PatchSnapshotCard } from '@/features/home/components/PatchSnapshotCard'
import { QuickEntry } from '@/features/home/components/QuickEntry'

/** Re-render at most every 5 minutes; each section's data has its own server cache and freshness budget. */
export const revalidate = 300

/** Open Graph locale per site locale. */
const OG_LOCALE = { en: 'en_US', th: 'th_TH', ja: 'ja_JP', ko: 'ko_KR', 'zh-CN': 'zh_CN' } as const

/**
 * Home's own title and description in the active locale (other pages keep the layout default for now).
 * The locale comes from the [lang] root param, so the page stays statically rendered per locale.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations('home.meta'), getLocale()])
  return {
    title: { absolute: t('title') },
    description: t('description'),
    openGraph: { title: t('title'), description: t('description'), siteName: 'Deadlockprohunger', locale: OG_LOCALE[locale], type: 'website' },
  }
}

/** Home: "What is happening in Deadlock right now?" Every section streams and fails on its own. */
export default function HomePage() {
  const t = useTranslations('home')
  const viewAll = (href: string, label: string) => (
    <ButtonLink href={href} variant="ghost" size="sm" trailingIcon={<ArrowRightIcon size={16} />}>
      {label}
    </ButtonLink>
  )

  return (
    <>
      <HomeHero
        stats={
          <Suspense fallback={<HeroStatsSkeleton />}>
            <HeroStatsBlock />
          </Suspense>
        }
      />

      <div className="flex flex-col gap-(--spacing-section) pt-(--spacing-section) lg:gap-20">
        <HomeSection id="patch" index="01" kicker={t('sections.patch.kicker')} title={t('sections.patch.title')}>
          <Suspense fallback={<Loading label={t('loading.patch')} className="h-56" />}>
            <PatchBlock />
          </Suspense>
        </HomeSection>

        <HomeSection id="pulse" index="02" kicker={t('sections.pulse.kicker')} title={t('sections.pulse.title')} description={t('sections.pulse.description')}>
          <Suspense fallback={<Loading label={t('loading.pulse')} className="h-52" />}>
            <PulseBlock />
          </Suspense>
        </HomeSection>

        <HomeSection
          id="performance"
          index="03"
          kicker={t('sections.performance.kicker')}
          title={t('sections.performance.title')}
          description={t('sections.performance.description')}
          actions={viewAll('/meta', t('sections.performance.action'))}
        >
          <Suspense fallback={<Loading label={t('loading.performance')} className="h-80" />}>
            <PerformanceBlock />
          </Suspense>
        </HomeSection>

        <HomeSection
          id="heroes"
          index="04"
          kicker={t('sections.heroes.kicker')}
          title={t('sections.heroes.title')}
          description={t('sections.heroes.description')}
          actions={viewAll('/meta', t('sections.heroes.action'))}
        >
          <Suspense fallback={<Loading label={t('loading.heroes')} className="h-80" />}>
            <HeroesBlock />
          </Suspense>
        </HomeSection>

        <HomeSection id="builds" index="05" kicker={t('sections.builds.kicker')} title={t('sections.builds.title')} description={t('sections.builds.description')} actions={viewAll('/builds', t('sections.builds.action'))}>
          <Suspense fallback={<Loading label={t('loading.builds')} className="h-48" />}>
            <BuildsBlock />
          </Suspense>
        </HomeSection>

        <HomeSection id="matches" index="06" kicker={t('sections.matches.kicker')} title={t('sections.matches.title')} description={t('sections.matches.description')} actions={viewAll('/matches', t('sections.matches.action'))}>
          <Suspense fallback={<Loading label={t('loading.matches')} className="h-48" />}>
            <MatchesBlock />
          </Suspense>
        </HomeSection>

        <HomeSection id="explore" index="07" kicker={t('sections.explore.kicker')} title={t('sections.explore.title')}>
          <QuickEntry />
        </HomeSection>
      </div>
    </>
  )
}

function Loading({ label, className }: { label: string; className: string }) {
  return (
    <div role="status">
      <span className="sr-only">{label}</span>
      <Skeleton className={className} />
    </div>
  )
}

function Meta({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">{children}</div>
}

async function HeroStatsBlock() {
  const [s, source] = await Promise.all([getHomeMeta(), getHomeSource()])
  if (!s.ok) return <DataNotice error={s.error} what="Summary" />
  // The source counters are optional: without them the strip shows dashes, the rest still loads.
  return <HeroStats summary={s.data.summary} source={source.ok ? source.data : null} footer={<Freshness asOf={s.asOf} stale={s.stale} />} />
}

async function PerformanceBlock() {
  const [s, meta] = await Promise.all([getHomePerformance(), getHomeMeta()])
  if (!s.ok) return <DataNotice error={s.error} what="Hero performance" />
  return (
    <div className="flex flex-col gap-4">
      <Meta>
        {meta.ok && <ScopeLine scope={meta.data.scope} />}
        <Freshness asOf={s.asOf} stale={s.stale} />
      </Meta>
      <HeroPerformance data={s.data} />
    </div>
  )
}

async function PatchBlock() {
  const s = await getHomePatch()
  // A failed feed is treated like an undated patch: statistics still work, without a patch boundary.
  if (!s.ok) return <PatchSnapshotCard patch={null} />
  return <PatchSnapshotCard patch={s.data} />
}

async function PulseBlock() {
  const [s, t] = await Promise.all([getHomeMeta(), getTranslations('home')])
  if (!s.ok) return <DataNotice error={s.error} what="Pulse" />
  const { scope, pulse } = s.data
  if (pulse.length === 0) return <EmptyState title={t('empty.pulseTitle')} description={t('empty.pulseDescription')} />
  return (
    <div className="flex flex-col gap-4">
      <Meta>
        <ScopeLine scope={scope} />
        <Freshness asOf={s.asOf} stale={s.stale} />
      </Meta>
      <div className="grid gap-4 md:grid-cols-3">
        {pulse.map((stat, i) => (
          <Reveal key={stat.kind} index={i}>
            <StatCard
              className="h-full"
              label={t(`pulse.${stat.kind}`)}
              subject={stat.subject}
              value={stat.value}
              format={stat.format}
              featured={stat.featured}
              scope={scope}
              showScope={false}
              delta={stat.trend && <TrendBadge {...stat.trend} comparison={t('comparison')} />}
              footer={stat.sparkline && <Sparkline {...stat.sparkline} summary={t('pulse.sparkline', { hero: stat.subject ?? '' })} />}
              why={stat.why}
            />
          </Reveal>
        ))}
      </div>
    </div>
  )
}

async function HeroesBlock() {
  const s = await getHomeMeta()
  if (!s.ok) return <DataNotice error={s.error} what="Hero trends" />
  return (
    <div className="flex flex-col gap-4">
      <Meta>
        <ScopeLine scope={s.data.scope} />
        <Freshness asOf={s.asOf} stale={s.stale} />
      </Meta>
      <div className="grid gap-4 lg:grid-cols-3">
        <HeroTrendColumn kind="trending" list={s.data.trending} tone="primary" />
        <HeroTrendColumn kind="rising" list={s.data.rising} tone="primary" revealOffset={1} />
        <HeroTrendColumn kind="falling" list={s.data.falling} tone="orange" revealOffset={2} />
      </div>
    </div>
  )
}

async function BuildsBlock() {
  const [s, t] = await Promise.all([getHomeBuilds(), getTranslations('home.empty')])
  if (!s.ok) return <DataNotice error={s.error} what="Builds" />
  if (s.data.length === 0) return <EmptyState title={t('buildsTitle')} description={t('buildsDescription')} />
  return (
    <div className="flex flex-col gap-4">
      <ul className="-mx-(--spacing-gutter) flex snap-x snap-mandatory gap-4 overflow-x-auto px-(--spacing-gutter) pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0">
        {s.data.map((build, i) => (
          <Reveal as="li" key={build.href} index={i} className="w-[85%] shrink-0 snap-start sm:w-[60%] md:w-auto">
            <BuildCard {...build} className="h-full" />
          </Reveal>
        ))}
      </ul>
      <Freshness asOf={s.asOf} stale={s.stale} />
    </div>
  )
}

async function MatchesBlock() {
  const [s, t] = await Promise.all([getHomeMatches(), getTranslations('home')])
  if (!s.ok) return <DataNotice error={s.error} what="Matches" />
  if (s.data.length === 0) return <EmptyState title={t('empty.matchesTitle')} description={t('empty.matchesDescription')} action={<ButtonLink href="/matches" variant="secondary" size="sm">{t('sections.matches.action')}</ButtonLink>} />
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {s.data.map((match, i) => (
          <Reveal as="li" key={match.matchId} index={i}>
            <MatchCard {...match} className="h-full" />
          </Reveal>
        ))}
      </ul>
      <Freshness asOf={s.asOf} stale={s.stale} />
    </div>
  )
}
