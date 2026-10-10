import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
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
import { loadMatchPage } from '@/features/match/loaders'
import { matchIndexing, parseMatchId } from '@/features/match/seo'
import { eventText } from '@/features/match/text'
import { DataNotice } from '@/components/data/DataState'
import { OG_LOCALE } from '@/i18n/config'
import { WithClientMessages } from '@/i18n/WithClientMessages'
import { classifyError } from '@/lib/deadlock/errors'

type Params = Promise<{ matchId: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { matchId } = await params
  const [t, locale] = await Promise.all([getTranslations('matches.meta'), getLocale()])
  const title = t('detailTitle', { id: matchId })
  const description = t('detailDescription', { id: matchId })
  // Indexable with canonical + hreflang only when the match loads (shared, request-cached load).
  const id = parseMatchId(matchId)
  const indexing = id === null ? { robots: { index: false } } : matchIndexing(id, locale, (await loadMatchPage(id)).status)
  return { title, description, ...indexing, openGraph: { title, description, locale: OG_LOCALE[locale], type: 'website' } }
}

const SECTIONS = ['story', 'teams', 'players', 'lineup', 'timeline', 'builds', 'performance', 'graphs', 'events', 'advanced'] as const

/** The timeline and events list render in the browser: only their messages are sent, on this page only. */
const TIMELINE_MESSAGES = ['matches.common', 'matches.timeline', 'matches.events.anItem'] as const

export default async function MatchPage({ params }: { params: Params }) {
  const matchId = parseMatchId((await params).matchId)
  if (matchId === null) notFound()
  const [t, common, load] = await Promise.all([getTranslations('matches'), getTranslations('common'), loadMatchPage(matchId)])

  if (load.status === 'failed') {
    console.error('[match] load failed', load.error)
    return (
      <PageContainer>
        <h1 className="sr-only">{t('explorer.match', { id: matchId })}</h1>
        <DataNotice error={classifyError(load.error)} what={`Match ${matchId}`} action={<ButtonLink href={`/matches/${matchId}`} variant="secondary" size="sm">{common('tryAgain')}</ButtonLink>} />
      </PageContainer>
    )
  }
  if (load.status === 'not-available') {
    return (
      <PageContainer>
        <h1 className="sr-only">{t('explorer.match', { id: matchId })}</h1>
        <EmptyState
          title={t('detail.notAvailableTitle')}
          description={t('detail.notAvailableDescription')}
          action={<ButtonLink href="/matches" variant="secondary" size="sm">{t('detail.browse')}</ButtonLink>}
        />
      </PageContainer>
    )
  }

  const { data } = load
  const { view } = data
  // Event sentences are worded here, in the page's locale; hero and item names inside them are match data.
  const events = view.events.map((e) => ({ ...e, text: eventText(t, e.detail) }))
  const timelinePlayers: TimelinePlayer[] = view.players.map((p) => ({
    slot: p.slot,
    side: p.side,
    label: `${p.hero.name}${p.name ? ` (${p.name})` : ''}`,
    purchases: p.purchases.map((b) => ({ t: b.t, name: b.item.name, tier: b.item.tier, slot: b.item.slot, icon: b.item.icon, soldAt: b.soldAt })),
    ticks: p.ticks.map((k) => ({ t: k.t, netWorth: k.netWorth })),
  }))

  return (
    <PageContainer className="flex flex-col gap-12">
      <MatchSummary view={view} patchAt={data.patchAt} rank={data.rank} />

      <nav aria-label={t('detail.sectionsNav')} className="sticky top-16 z-30 -mx-(--spacing-gutter) -my-6 border-b border-border bg-bg/90 px-(--spacing-gutter) backdrop-blur-md">
        <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {SECTIONS.map((id) => (
            <li key={id} className="shrink-0">
              <a href={`#${id}`} className="flex h-11 items-center px-3 font-display text-sm font-semibold tracking-[0.08em] text-text-muted uppercase hover:text-text">
                {t(`detail.sections.${id}`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <MatchStory view={view} />
      <TeamComparison view={view} />
      <PlayersSection view={view} />
      <HeroLineup view={view} />

      <WithClientMessages paths={TIMELINE_MESSAGES}>
        <MatchTimeProvider durationS={view.durationS}>
          <Section id="timeline" title={t('detail.timelineTitle')} description={t('detail.timelineDescription')}>
            <MatchTimeline durationS={view.durationS} times={view.times} lead={view.lead} events={events} players={timelinePlayers} />
          </Section>

          <BuildsSection view={view} />
          <PerformanceSection view={view} />

          <Section id="graphs" title={t('detail.graphsTitle')} description={t('detail.graphsDescription')}>
            <div className="grid gap-4 lg:grid-cols-2">
              <TeamGraph title={t('detail.soulsOverTime')} times={view.times} series={view.teamNetWorth} unit="souls" />
              <TeamGraph title={t('detail.killsOverTime')} times={view.times} series={view.teamKills} unit="kills" />
            </div>
          </Section>

          <Section id="events" title={t('detail.eventsTitle')} description={t('detail.eventsDescription')}>
            <EventsList events={events} />
          </Section>
        </MatchTimeProvider>
      </WithClientMessages>

      <AdvancedData view={view} />
    </PageContainer>
  )
}
