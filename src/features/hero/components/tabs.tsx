import { getLocale, getTranslations } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { MatchCard } from '@/components/cards/MatchCard'
import { ConfidenceBadge } from '@/components/data/ConfidenceBadge'
import { DataNotice } from '@/components/data/DataState'
import { Filter } from '@/components/ui/Filter'
import { EmptyState } from '@/components/ui/States'
import { attempt } from '@/lib/deadlock/errors'
import { rankFromBadge } from '@/lib/deadlock/rankAssets'
import { cx } from '@/lib/cx'
import { dateFormat, formatInteger, formatPercent, formatPointDelta, formatRelativeTime } from '@/lib/format'
import {
  getAbilitiesData,
  getBuildsData,
  getMatchesData,
  getMatchupsData,
  getTrendsData,
  type HeroContext,
} from '../loaders'
import { ABILITY_PREFIX, CORE_BUY_RATE, type HeroBuild } from '../model'
import { heroHref, type HeroQuery } from '../query'
import { SeeMore } from './HeroHeader'
import { AbilitySequence, BuildItemSequence, BuildStatsLine, ItemProgressionView, PairingList, Panel, SplitBars, type AbilityLabels, type BuildItemLabels, type BuildStatsLabels } from './parts'
import { TrendChart, type TrendChartLabels } from './TrendChart'
import type { getOverviewData } from '../loaders'

type OverviewData = Awaited<ReturnType<typeof getOverviewData>>
const DATE: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }

type HeroesT = ReturnType<typeof useTranslations<'heroes'>>
type PartLabels = { buildItems: BuildItemLabels; buildStats: BuildStatsLabels; ability: AbilityLabels; trend: TrendChartLabels }

/**
 * Heroes' translations for the shared build, ability and trend parts. Those parts default to English
 * because other pages (Analyze, Compare, Build detail) use them before they're localized, so the
 * Heroes pages pass these explicitly.
 */
export function partLabels(t: HeroesT): PartLabels {
  return {
    buildItems: { moreItems: (count) => t('parts.moreItems', { count }), moreSections: (count) => t('parts.moreSections', { count }) },
    buildStats: { noMatches: t('parts.buildNoMatches'), winRate: t('parts.buildWinRate') },
    ability: { region: t('parts.abilityOrder'), upgradeOrder: (steps) => t('parts.upgradeOrder', { steps }), ability: t('parts.ability'), unknownAbility: t('parts.unknownAbility') },
    trend: {
      tooFew: t('trendChart.tooFew'),
      summary: (v) => t('trendChart.summary', v),
      baseline: t('trendChart.baseline'),
      markers: t('trendChart.markers'),
      incomplete: t('trendChart.incomplete'),
      showData: t('trendChart.showData'),
      tableCaption: (metric) => t('trendChart.tableCaption', { metric }),
      day: t('trendChart.day'),
      matches: t('trendChart.matches'),
      patch: t('trendChart.patch'),
    },
  }
}


// ── Overview ─────────────────────────────────────────────────────────

export function OverviewTab({ ctx, query, data }: { ctx: HeroContext; query: HeroQuery; data: OverviewData }) {
  const link = (tab: HeroQuery['tab']) => heroHref(ctx.hero.slug, query, { tab })
  const t = useTranslations('heroes.detail')
  const lengths = useLengthLabels()
  const labels = partLabels(useTranslations('heroes'))
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title={t('bestMatchups')} description={t('bestMatchupsOverview')} actions={<SeeMore href={link('matchups')}>{t('allMatchups')}</SeeMore>}>
        <PairingList items={data.best} tone="positive" empty={t('emptyLane')} />
      </Panel>
      <Panel title={t('worstMatchups')} description={t('worstMatchupsOverview')} actions={<SeeMore href={link('matchups')}>{t('allMatchups')}</SeeMore>}>
        <PairingList items={data.worst} tone="negative" empty={t('emptyLane')} />
      </Panel>
      <Panel title={t('synergies')} description={t('synergiesOverview')} actions={<SeeMore href={link('matchups')}>{t('allSynergies')}</SeeMore>}>
        <PairingList items={data.synergies} tone="positive" empty={t('emptyPartner')} />
      </Panel>
      <Panel title={t('bestBuild')} description={t('bestBuildDescription')} actions={<SeeMore href={link('builds')}>{t('allBuilds')}</SeeMore>}>
        {data.topBuild ? <BuildPreview build={data.topBuild} labels={labels} /> : <p className="text-sm text-text-muted">{t('noBuilds')}</p>}
      </Panel>
      <Panel title={t('opening')} description={t('openingDescription', { count: ABILITY_PREFIX })} actions={<SeeMore href={link('abilities')}>{t('allOpenings')}</SeeMore>}>
        {data.opening ? (
          <div className="flex flex-col gap-3">
            <AbilitySequence order={data.opening} abilities={data.abilities} labels={labels.ability} />
            <OrderStats share={data.opening.share} winRate={data.opening.winRate} matches={data.opening.matches} interval={data.opening.interval} />
          </div>
        ) : (
          <p className="text-sm text-text-muted">{t('noOrderData')}</p>
        )}
      </Panel>
      <Panel title={t('lengthTitle')} description={t('lengthDescription')} actions={<SeeMore href={link('trends')}>{t('trendsLink')}</SeeMore>}>
        <SplitBars comparison={data.length} labels={lengths} />
      </Panel>
    </div>
  )
}

function BuildPreview({ build, labels }: { build: HeroBuild; labels: PartLabels }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-ui text-sm font-semibold text-text">{build.name}</p>
      <BuildStatsLine build={build} labels={labels.buildStats} />
      <BuildItemSequence build={build} maxCategories={2} labels={labels.buildItems} />
    </div>
  )
}

/** Match-length group labels (the model's keys short/standard/long), in the active locale. */
function useLengthLabels(): Record<string, string> {
  const t = useTranslations('heroes.parts.lengths')
  return { short: t('short'), standard: t('standard'), long: t('long') }
}

function OrderStats({ share, winRate, matches, interval }: { share: number; winRate: number; matches: number; interval: { low: number; high: number } }) {
  const t = useTranslations('heroes.detail')
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
      <span>{t.rich('orderStats', { share: formatPercent(share, 0), winRate: formatPercent(winRate), rate: (chunks) => <span className="text-text tabular">{chunks}</span> })}</span>
      <ConfidenceBadge sampleSize={matches} interval={interval} />
    </p>
  )
}

// ── Builds ───────────────────────────────────────────────────────────

export async function BuildsTab({ ctx }: { ctx: HeroContext }) {
  const [result, t, cards, locale, heroes] = await Promise.all([
    attempt('[hero] builds failed', getBuildsData(ctx)),
    getTranslations('heroes.detail'),
    getTranslations('cards'),
    getLocale(),
    getTranslations('heroes'),
  ])
  if (!result.ok) return <DataNotice error={result.kind} what="Builds" />
  const data = result.value
  const labels = partLabels(heroes)
  return (
    <div className="flex flex-col gap-4">
      <Panel title={t('buildsTitle')} description={t('buildsDescription')}>
        {data.builds.length === 0 ? (
          <p className="text-sm text-text-muted">{t('noBuilds')}</p>
        ) : (
          <ol className="grid gap-4 lg:grid-cols-2">
            {data.builds.slice(0, 6).map((build) => (
              <li key={build.id} className="flex flex-col gap-3 rounded-md border border-border bg-surface-sunken p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-ui text-sm font-semibold text-text">{build.name}</p>
                  <p className="text-caption text-text-muted tabular">
                    {[build.weeklyFavorites ? cards('favoritesThisWeek', { count: formatInteger(build.weeklyFavorites, locale) }) : null, build.updatedAt ? cards('updated', { time: formatRelativeTime(build.updatedAt, undefined, locale) }) : null].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <BuildStatsLine build={build} labels={labels.buildStats} />
                <BuildItemSequence build={build} labels={labels.buildItems} />
              </li>
            ))}
          </ol>
        )}
      </Panel>
      <Panel title={t('progressionTitle')} description={t('progressionDescription', { rate: formatPercent(CORE_BUY_RATE, 0) })}>
        <ItemProgressionView phases={data.progression} />
        <p className="mt-4 rounded-sm border border-border bg-surface-sunken px-3 py-2 text-caption text-text-muted">{t('itemCaveat')}</p>
      </Panel>
    </div>
  )
}

// ── Matchups ─────────────────────────────────────────────────────────

export async function MatchupsTab({ ctx, query }: { ctx: HeroContext; query: HeroQuery }) {
  const [result, t] = await Promise.all([attempt('[hero] matchups failed', getMatchupsData(ctx, query.lane)), getTranslations('heroes.detail')])
  if (!result.ok) return <DataNotice error={result.kind} what="Matchups" />
  const data = result.value
  return (
    <div className="flex flex-col gap-4">
      <Filter
        label={t('opponents')}
        value={query.lane}
        options={[
          { value: 'lane', label: t('laneOpponents'), href: heroHref(ctx.hero.slug, query, { lane: 'lane' }) },
          { value: 'any', label: t('anyOpponent'), href: heroHref(ctx.hero.slug, query, { lane: 'any' }) },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('bestMatchups')} description={t(query.lane === 'lane' ? 'bestMatchupsLane' : 'bestMatchupsAny', { count: data.opponents })}>
          <PairingList items={data.best} tone="positive" empty={t('emptyOpponent')} />
        </Panel>
        <Panel title={t('worstMatchups')} description={t('worstMatchupsDescription')}>
          <PairingList items={data.worst} tone="negative" empty={t('emptyOpponent')} />
        </Panel>
      </div>
      <Panel title={t('synergies')} description={t('synergiesDescription')}>
        <PairingList items={data.synergies} tone="positive" empty={t('emptyPartner')} />
      </Panel>
    </div>
  )
}

// ── Abilities ────────────────────────────────────────────────────────

export async function AbilitiesTab({ ctx }: { ctx: HeroContext }) {
  const [result, t, heroes] = await Promise.all([attempt('[hero] abilities failed', getAbilitiesData(ctx)), getTranslations('heroes.detail'), getTranslations('heroes')])
  if (!result.ok) return <DataNotice error={result.kind} what="Ability orders" />
  const data = result.value
  const labels = partLabels(heroes)
  if (data.openings.length === 0) return <EmptyState title={t('abilitiesEmptyTitle')} description={t('abilitiesEmptyDescription')} />
  return (
    <Panel title={t('abilityOrder')} description={t('abilityOrderDescription', { count: ABILITY_PREFIX })}>
      <ol className="flex flex-col gap-6">
        {data.openings.map((order, i) => (
          <li key={order.sequence.join(',')} className={cx('flex flex-col gap-3', i > 0 && 'border-t border-border pt-6')}>
            <p className="font-ui text-sm font-semibold text-text">{t('openingNumber', { n: i + 1 })}</p>
            <AbilitySequence order={order} abilities={data.abilities} labels={labels.ability} />
            <OrderStats share={order.share} winRate={order.winRate} matches={order.matches} interval={order.interval} />
          </li>
        ))}
      </ol>
    </Panel>
  )
}

// ── Trends ───────────────────────────────────────────────────────────

export async function TrendsTab({ ctx }: { ctx: HeroContext }) {
  const [result, t, locale] = await Promise.all([attempt('[hero] trends failed', getTrendsData(ctx)), getTranslations('heroes'), getLocale()])
  if (!result.ok) return <DataNotice error={result.kind} what="Trends" />
  const data = result.value
  const markers = data.patches.map((p) => ({ day: p.day, title: p.title }))
  const { trend } = partLabels(t)
  const lengths = { short: t('parts.lengths.short'), standard: t('parts.lengths.standard'), long: t('parts.lengths.long') }
  const verdict = (v: string) => (v === 'higher' ? t('detail.verdict.higher') : v === 'lower' ? t('detail.verdict.lower') : v === 'no clear change' ? t('detail.verdict.none') : t('detail.verdict.insufficient'))
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={t('detail.winTrendTitle')} description={t('detail.winTrendDescription')}>
          <TrendChart points={data.series} metric="winRate" label={t('trendChart.winRate')} labels={trend} locale={locale} baseline={0.5} markers={markers} />
        </Panel>
        <Panel title={t('detail.pickTrendTitle')} description={t('detail.pickTrendDescription')}>
          <TrendChart points={data.series} metric="pickRate" label={t('trendChart.pickRate')} labels={trend} locale={locale} markers={markers} />
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('detail.rankTitle')} description={t('detail.rankDescription')}>
          <SplitBars comparison={data.rank} />
        </Panel>
        <Panel title={t('detail.lengthTitle')} description={t('detail.lengthDescription')}>
          <SplitBars comparison={data.length} labels={lengths} />
        </Panel>
      </div>
      <Panel title={t('detail.patchTitle')} description={t('detail.patchDescription')}>
        {data.patches.length === 0 ? (
          <p className="text-sm text-text-muted">{t('detail.noPatches')}</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border">
            {data.patches.map((p) => {
              const before = p.before ? p.before.wins / p.before.matches : null
              const after = p.after ? p.after.wins / p.after.matches : null
              return (
                <li key={p.day} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                  <span className="w-28 shrink-0 text-sm text-text-muted">{dateFormat(locale, DATE).format(p.day * 1000)}</span>
                  <span className="min-w-0 flex-1 font-ui text-sm font-semibold text-text">
                    {p.link ? (
                      <a href={p.link} className="hover:text-highlight" rel="noopener noreferrer">
                        {p.title}
                      </a>
                    ) : (
                      p.title
                    )}
                  </span>
                  <span className="text-sm text-text tabular">
                    {before !== null ? formatPercent(before) : '—'} → {after !== null ? formatPercent(after) : '—'}
                    {before !== null && after !== null && <span className="text-text-muted"> ({formatPointDelta(after - before)})</span>}
                  </span>
                  <span
                    className={cx(
                      'rounded-xs border px-1.5 text-caption',
                      p.verdict === 'higher' ? 'border-positive/40 text-positive' : p.verdict === 'lower' ? 'border-orange/40 text-orange' : 'border-border-strong text-text-muted',
                    )}
                  >
                    {verdict(p.verdict)}
                  </span>
                </li>
              )
            })}
          </ol>
        )}
        <p className="mt-3 text-caption text-text-muted">{t('detail.verdictNote')}</p>
      </Panel>
    </div>
  )
}

// ── Matches ──────────────────────────────────────────────────────────

type LoadedTeam = Awaited<ReturnType<typeof getMatchesData>>[number]['teams'][number]
/** Team labels are UI text ("Team 1"), numbered by position; heroes are data. */
const toTeam = (team: LoadedTeam, label: string) => ({ label, won: team.won, heroes: team.heroes.map((h) => ({ name: h.name, imageSrc: h.iconUrl ?? undefined })) })

export async function MatchesTab({ ctx }: { ctx: HeroContext }) {
  const [result, t] = await Promise.all([attempt('[hero] matches failed', getMatchesData(ctx)), getTranslations('heroes.detail')])
  if (!result.ok) return <DataNotice error={result.kind} what="Recent matches" />
  const matches = result.value
  if (matches.length === 0) return <EmptyState title={t('matchesEmptyTitle')} description={t('matchesEmptyDescription')} />
  return (
    <Panel title={t('matchesTitle')} description={t('matchesDescription')}>
      <ul className="grid gap-3 md:grid-cols-2">
        {matches.map((m) => (
          <li key={m.matchId}>
            <MatchCard
              matchId={m.matchId}
              href={`/matches/${m.matchId}`}
              startedAt={m.startedAt}
              durationS={m.durationS}
              averageRank={rankFromBadge(ctx.scope.ranks, m.averageBadge) ?? undefined}
              perspective={m.perspective ? { won: m.perspective.won, heroName: ctx.hero.name, kda: m.perspective.kda } : undefined}
              teams={[toTeam(m.teams[0], t('team', { n: 1 })), toTeam(m.teams[1], t('team', { n: 2 }))]}
              className="h-full"
            />
          </li>
        ))}
      </ul>
    </Panel>
  )
}
