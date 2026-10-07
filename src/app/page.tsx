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

/** Home: "What is happening in Deadlock right now?" Every section streams and fails on its own. */
export default function HomePage() {
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
        <HomeSection id="patch" index="01" kicker="Patch" title="Current patch snapshot">
          <Suspense fallback={<Loading label="Loading the latest patch" className="h-56" />}>
            <PatchBlock />
          </Suspense>
        </HomeSection>

        <HomeSection id="pulse" index="02" kicker="Pulse" title="Deadlock pulse" description="The few numbers that best describe this week. Open “Why?” for the reasoning.">
          <Suspense fallback={<Loading label="Loading this week’s numbers" className="h-52" />}>
            <PulseBlock />
          </Suspense>
        </HomeSection>

        <HomeSection
          id="performance"
          index="03"
          kicker="Performance"
          title="Hero performance"
          description="Top five heroes this week by win rate, pick rate and recorded bans. Heroes with a Low sample never rank."
          actions={viewAll('/meta', 'Full table')}
        >
          <Suspense fallback={<Loading label="Loading hero performance" className="h-80" />}>
            <PerformanceBlock />
          </Suspense>
        </HomeSection>

        <HomeSection
          id="heroes"
          index="04"
          kicker="Heroes"
          title="Who’s moving"
          description="Only changes larger than normal week-to-week variation are called trends. Everything else is “stable” and not listed."
          actions={viewAll('/meta', 'Full meta')}
        >
          <Suspense fallback={<Loading label="Loading hero trends" className="h-80" />}>
            <HeroesBlock />
          </Suspense>
        </HomeSection>

        <HomeSection id="builds" index="05" kicker="Builds" title="Trending builds" description="Most favorited this week. Win rates appear only when enough tracked matches used the build." actions={viewAll('/builds', 'All builds')}>
          <Suspense fallback={<Loading label="Loading builds" className="h-48" />}>
            <BuildsBlock />
          </Suspense>
        </HomeSection>

        <HomeSection id="matches" index="06" kicker="Matches" title="Recent high-rank matches" description="Newest matches in the top rank band from the last 24 hours." actions={viewAll('/matches', 'All matches')}>
          <Suspense fallback={<Loading label="Loading matches" className="h-48" />}>
            <MatchesBlock />
          </Suspense>
        </HomeSection>

        <HomeSection id="explore" index="07" kicker="Explore" title="Go deeper">
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
  const s = await getHomeMeta()
  if (!s.ok) return <DataNotice error={s.error} what="Pulse" />
  const { scope, pulse } = s.data
  if (pulse.length === 0) return <EmptyState title="Not enough data yet" description="No hero has a large enough sample in this window to report." />
  return (
    <div className="flex flex-col gap-4">
      <Meta>
        <ScopeLine scope={scope} />
        <Freshness asOf={s.asOf} stale={s.stale} />
      </Meta>
      <div className="grid gap-4 md:grid-cols-3">
        {pulse.map((stat, i) => (
          <Reveal key={stat.label} index={i}>
            <StatCard
              className="h-full"
              label={stat.label}
              subject={stat.subject}
              value={stat.value}
              format={stat.format}
              featured={stat.featured}
              scope={scope}
              showScope={false}
              delta={stat.trend && <TrendBadge {...stat.trend} comparison="vs previous 7 days" />}
              footer={stat.sparkline && <Sparkline {...stat.sparkline} />}
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
        <HeroTrendColumn list={s.data.trending} tone="primary" />
        <HeroTrendColumn list={s.data.rising} tone="primary" revealOffset={1} />
        <HeroTrendColumn list={s.data.falling} tone="orange" revealOffset={2} />
      </div>
    </div>
  )
}

async function BuildsBlock() {
  const s = await getHomeBuilds()
  if (!s.ok) return <DataNotice error={s.error} what="Builds" />
  if (s.data.length === 0) return <EmptyState title="No builds this week" description="No build was favorited this week yet." />
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
  const s = await getHomeMatches()
  if (!s.ok) return <DataNotice error={s.error} what="Matches" />
  if (s.data.length === 0) return <EmptyState title="No top-band matches in the last 24 hours" description="The data source hasn’t processed any yet." action={<ButtonLink href="/matches" variant="secondary" size="sm">All matches</ButtonLink>} />
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
