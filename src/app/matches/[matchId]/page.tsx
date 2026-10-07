import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageContainer } from '@/components/layout/PageContainer'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/States'
import { EventsList, MatchTimeProvider, MatchTimeline, type TimelinePlayer } from '@/features/match/components/MatchTimeline'
import {
  AdvancedData,
  BuildsSection,
  HeroLineup,
  MatchStory,
  MatchSummary,
  PerformanceSection,
  PlayersSection,
  Section,
  TeamComparison,
} from '@/features/match/components/sections'
import { TeamGraph } from '@/features/match/components/TeamGraph'
import { getMatchPage } from '@/features/match/loaders'
import { DataNotice } from '@/components/data/DataState'
import { classifyError } from '@/lib/deadlock/errors'

type Params = Promise<{ matchId: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { matchId } = await params
  return { title: `Match ${matchId}` }
}

const SECTIONS = [
  ['story', 'Story'],
  ['teams', 'Teams'],
  ['players', 'Players'],
  ['lineup', 'Lineup'],
  ['timeline', 'Timeline'],
  ['builds', 'Builds'],
  ['performance', 'Performance'],
  ['graphs', 'Graphs'],
  ['events', 'Events'],
  ['advanced', 'Advanced'],
] as const

export default async function MatchPage({ params }: { params: Params }) {
  const { matchId: rawId } = await params
  const matchId = Number(rawId)
  if (!/^\d{1,12}$/.test(rawId) || !Number.isSafeInteger(matchId)) notFound()

  let data: Awaited<ReturnType<typeof getMatchPage>>
  try {
    data = await getMatchPage(matchId)
  } catch (error) {
    console.error('[match] load failed', error)
    return (
      <PageContainer>
        <h1 className="sr-only">Match {matchId}</h1>
        <DataNotice error={classifyError(error)} what={`Match ${matchId}`} action={<ButtonLink href={`/matches/${matchId}`} variant="secondary" size="sm">Try again</ButtonLink>} />
      </PageContainer>
    )
  }
  if (!data) {
    return (
      <PageContainer>
        <h1 className="sr-only">Match {matchId}</h1>
        <EmptyState
          title="Match not available yet"
          description="This match isn’t in the data source. Very recent matches can take a while to be processed; older ones may never have been collected."
          action={<ButtonLink href="/matches" variant="secondary" size="sm">Browse recent matches</ButtonLink>}
        />
      </PageContainer>
    )
  }

  const { view } = data
  const timelinePlayers: TimelinePlayer[] = view.players.map((p) => ({
    slot: p.slot,
    side: p.side,
    label: `${p.hero.name}${p.name ? ` (${p.name})` : ''}`,
    purchases: p.purchases.map((b) => ({ t: b.t, name: b.item.name, tier: b.item.tier, slot: b.item.slot, icon: b.item.icon, soldAt: b.soldAt })),
    ticks: p.ticks.map((k) => ({ t: k.t, netWorth: k.netWorth })),
  }))

  return (
    <PageContainer className="flex flex-col gap-12">
      <MatchSummary view={view} patch={data.patch} rank={data.rank} />

      <nav aria-label="Match sections" className="sticky top-16 z-30 -mx-(--spacing-gutter) -my-6 border-b border-border bg-bg/90 px-(--spacing-gutter) backdrop-blur-md">
        <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {SECTIONS.map(([id, label]) => (
            <li key={id} className="shrink-0">
              <a href={`#${id}`} className="flex h-11 items-center px-3 font-display text-sm font-semibold tracking-[0.08em] text-text-muted uppercase hover:text-text">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <MatchStory view={view} />
      <TeamComparison view={view} />
      <PlayersSection view={view} />
      <HeroLineup view={view} />

      <MatchTimeProvider durationS={view.durationS}>
        <Section id="timeline" title="Timeline" description="Objectives, the Mid-Boss, kills and the focused player’s purchases on one time axis. Select a marker or drag the scrubber; the readout shows the state at that moment.">
          <MatchTimeline durationS={view.durationS} times={view.times} lead={view.lead} events={view.events} players={timelinePlayers} />
        </Section>

        <BuildsSection view={view} />
        <PerformanceSection view={view} />

        <Section id="graphs" title="Graphs" description="Team totals at each recorded sample.">
          <div className="grid gap-4 lg:grid-cols-2">
            <TeamGraph title="Souls over time" times={view.times} series={view.teamNetWorth} unit="souls" />
            <TeamGraph title="Kills over time" times={view.times} series={view.teamKills} unit="kills" />
          </div>
        </Section>

        <Section id="events" title="Events" description="Every recorded event in order. Selecting one also focuses it on the timeline.">
          <EventsList events={view.events} />
        </Section>
      </MatchTimeProvider>

      <AdvancedData view={view} />
    </PageContainer>
  )
}
