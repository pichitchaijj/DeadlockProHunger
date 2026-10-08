import { useLocale, useTranslations } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/config'
import type { ReactNode } from 'react'
import { WinRate } from '@/components/cards/WinRate'
import { ConfidenceBadge } from '@/components/data/ConfidenceBadge'
import { ScopeLine } from '@/components/data/ScopeLine'
import { StatCard } from '@/components/data/StatCard'
import { TierBadge } from '@/components/data/TierBadge'
import { TrendBadge } from '@/components/data/TrendBadge'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { Filter } from '@/components/ui/Filter'
import { DataNotice } from '@/components/data/DataState'
import { getInsightWording } from '@/components/data/insightWording'
import { attempt } from '@/lib/deadlock/errors'
import { SAMPLE_TIER_THRESHOLDS } from '@/lib/analytics/sampleTier'
import { cx } from '@/lib/cx'
import { dateFormat, formatInteger, formatPercent, formatPointDelta } from '@/lib/format'
import { capitalize } from '@/features/meta/model'
import { getOverviewData, heroBuilds, laneMatchups, type HeroContext } from '@/features/hero/loaders'
import { heroHref } from '@/features/hero/query'
import { buildsHref, DEFAULT_BUILDS_QUERY } from '@/features/builds/query'
import { compareHref } from '@/features/compare/query'
import { InsightGrid, SeeMore } from '@/features/hero/components/HeroHeader'
import { BuildItemSequence, BuildStatsLine, PairingList, Panel } from '@/features/hero/components/parts'
import { partLabels } from '@/features/hero/components/tabs'
import { TrendChart } from '@/features/hero/components/TrendChart'
import { getAnalyzeTrends, heroQueryFor } from '../loaders'
import { comparisonText, trendRangeText, type PeerComparison, type TrendRange } from '../model'
import { analyzeHref, type AnalyzeQuery } from '../query'
import { getScopeWording, type ScopeWording } from '@/components/data/scopeWording'

/*
 * Analyze sections, worded from the Analyze catalog (analyze.*). The parts shared with Hero Detail get
 * the Heroes catalog's labels (partLabels), so both pages read the same. Hero, build and rank names,
 * roles and every number are data. The insight grid is worded by the Insight Engine (getInsightWording).
 */

/** No space between sentences after a CJK full stop. */
const sentenceGap = (locale: Locale) => (locale === 'ja' || locale === 'zh-CN' ? '' : ' ')

/** Section heading (h2) with an optional action, used by every block on the page. */
export function Block({ id, title, description, actions, children }: { id: string; title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 max-w-3xl">
          <h2 id={id} className="font-display text-heading-xl font-bold text-text uppercase">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

// ── Identity and core metrics ────────────────────────────────────────

export function HeroSummary({ ctx, query }: { ctx: HeroContext; query: AnalyzeQuery }) {
  const t = useTranslations('analyze.summary')
  const heroes = useTranslations('heroes')
  const items = useTranslations('items.performance')
  const locale = useLocale()
  const whyLabels = { show: items('why'), hide: items('hideWhy') }
  const { hero, stats } = ctx
  return (
    <section aria-labelledby="analyze-hero" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4">
        <HeroPortrait name={hero.name} src={hero.iconUrl ?? undefined} size="lg" decorative />
        <div className="min-w-0 flex-1">
          <p className="text-eyebrow">{t('analyzing')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="analyze-hero" className="font-display text-display-lg font-extrabold text-text uppercase">
              {hero.name}
            </h2>
            {stats && <TierBadge tier={stats.tier} size="lg" />}
          </div>
          {hero.role && <p className="text-sm text-text-muted">{capitalize(hero.role)}</p>}
        </div>
        <SeeMore href={heroHref(hero.slug, heroQueryFor(query))}>{t('openHero')}</SeeMore>
      </div>

      <ScopeLine scope={ctx.statScope} />

      {!stats ? (
        <p className="rounded-md border border-border bg-surface p-4 text-sm text-text-muted">
          {t('noMatches', { hero: hero.name })}
        </p>
      ) : (
        <>
          {stats.sample === 'low' && (
            <p role="note" className="rounded-md border border-orange/40 bg-surface p-4 text-sm text-text">
              {t.rich('lowSample', {
                strong: (chunks) => <span className="font-semibold">{chunks}</span>,
                matches: formatInteger(stats.matches, locale),
                threshold: formatInteger(SAMPLE_TIER_THRESHOLDS.moderate, locale),
              })}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label={heroes('trendChart.winRate')}
              value={stats.winRate}
              format="percent"
              interval={stats.interval}
              scope={ctx.statScope}
              showScope={false}
              delta={stats.trend ? <TrendBadge direction={stats.trend.direction} delta={stats.trend.delta} comparison={heroes('list.comparison')} /> : undefined}
              why={t(stats.trend ? 'winWhy' : 'winWhyNoTrend', {
                wins: formatInteger(stats.wins, locale),
                matches: formatInteger(stats.matches, locale),
                low: formatPercent(stats.interval.low),
                high: formatPercent(stats.interval.high),
              })}
              whyLabels={whyLabels}
            />
            <StatCard
              label={heroes('trendChart.pickRate')}
              value={stats.pickRate}
              format="percent"
              scope={ctx.statScope}
              showScope={false}
              why={t('pickWhy', { hero: hero.name, rank: stats.pickRank, count: ctx.heroCount })}
              whyLabels={whyLabels}
            />
            <StatCard label={heroes('trendChart.matches')} value={stats.matches} format="compact" scope={ctx.statScope} showScope={false} />
          </div>
        </>
      )}
    </section>
  )
}

// ── Insights ─────────────────────────────────────────────────────────

export async function InsightsSection({ ctx }: { ctx: HeroContext }) {
  // A loader that fails takes down its own section only, with the classified reason (same as Hero Detail tabs).
  const [result, wording] = await Promise.all([attempt('[analyze] insights failed', getOverviewData(ctx)), getInsightWording()])
  if (!result.ok) return <DataNotice error={result.kind} what="Insights" />
  return <InsightGrid heroName={ctx.hero.name} tier={ctx.stats?.tier ?? null} insights={result.value.insights} wording={wording} />
}

// ── Trends ───────────────────────────────────────────────────────────

export async function TrendsSection({ ctx, query }: { ctx: HeroContext; query: AnalyzeQuery }) {
  const [result, t, heroes, locale, scopeWords] = await Promise.all([
    attempt('[analyze] trends failed', getAnalyzeTrends(ctx)),
    getTranslations('analyze.trends'),
    getTranslations('heroes'),
    getLocale(),
    getScopeWording(),
  ])
  const { trend } = partLabels(heroes)
  const winRate = heroes('trendChart.winRate')
  const pickRate = heroes('trendChart.pickRate')
  return (
    <Block
      id="analyze-trends"
      title={t('title')}
      description={
        result.ok
          ? rangeText(result.value, ctx.statScope, locale, scopeWords, (key, values) => t(key as 'range', values))
          : t('fallback', { window: scopeWords.window(ctx.statScope.window, { inSentence: true }), rank: scopeWords.rankScope(ctx.statScope) })
      }
      actions={<SeeMore href={heroHref(ctx.hero.slug, heroQueryFor(query, { tab: 'trends' }))}>{t('seeMore')}</SeeMore>}
    >
      {!result.ok ? (
        <DataNotice error={result.kind} what="Trends" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title={winRate} description={t('winRateDescription')}>
            <TrendChart points={result.value.points} metric="winRate" label={winRate} labels={trend} locale={locale} baseline={0.5} markers={result.value.patches.map((p) => ({ day: p.day, title: p.title }))} />
          </Panel>
          <Panel title={pickRate} description={t('pickRateDescription')}>
            <TrendChart points={result.value.points} metric="pickRate" label={pickRate} labels={trend} locale={locale} markers={result.value.patches.map((p) => ({ day: p.day, title: p.title }))} />
          </Panel>
        </div>
      )}
    </Block>
  )
}

const DAY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' }

/**
 * States exactly which days the charts cover: the selected window, its dates, and any days the source
 * returned no data for (never filled in). The "current patch" window is capped at 60 days of history.
 */
function rangeText(range: TrendRange, scope: HeroContext['statScope'], locale: Locale, scopeWords: ScopeWording, t: (key: string, values?: Record<string, string | number>) => string) {
  const day = dateFormat(locale, DAY)
  const dates = `${day.format(range.from * 1000)} – ${day.format(range.to * 1000)}`
  return trendRangeText(range, { window: scopeWords.window(scope.window, { inSentence: true }), rank: scopeWords.rankScope(scope), dates }, t, sentenceGap(locale))
}

// ── Peer comparison ──────────────────────────────────────────────────

export function ComparisonSection({ comparison, query, heroName }: { comparison: PeerComparison; query: AnalyzeQuery; heroName: string }) {
  const t = useTranslations('analyze.compare')
  const heroes = useTranslations('heroes')
  const locale = useLocale()
  const groupLabel = comparison.role ? t('groupRole', { role: capitalize(comparison.role) }) : t('groupAll')
  const self = comparison.rows.find((r) => r.selected)
  const sentence = comparisonText(
    comparison,
    { hero: heroName, group: groupLabel, selfWinRate: self?.winRate ?? null },
    (key, values) => t(key as 'standing', values),
    { percent: (x) => formatPercent(x), delta: (x) => formatPointDelta(x) },
    sentenceGap(locale),
  )
  return (
    <Block
      id="analyze-compare"
      title={t('title')}
      description={t('description')}
      // Carries the scope so Compare shows the same numbers as this page.
      actions={<SeeMore href={compareHref({ type: 'heroes', a: query.hero ?? '', b: '', window: query.window, rank: query.rank })}>{t('seeMore')}</SeeMore>}
    >
      <Panel
        title={t('panelTitle', { hero: heroName, group: groupLabel })}
        description={sentence}
        actions={
          <Filter
            label={t('with')}
            // The group actually shown; "Same role" is offered only when the hero has a role.
            value={comparison.group}
            options={[
              ...(comparison.roleAvailable ? [{ value: 'role', label: t('sameRole'), href: analyzeHref(query, { peers: 'role' }) }] : []),
              { value: 'all', label: t('allHeroes'), href: analyzeHref(query, { peers: 'all' }) },
            ]}
          />
        }
      >
        <ol className="flex flex-col divide-y divide-border">
          {comparison.rows.map((row) => {
            const ranked = row.position !== null
            return (
              <li
                key={row.id}
                aria-current={row.selected ? 'true' : undefined}
                className={cx(
                  // Phones: position + name on the first line, numbers on the second. Wider: one row.
                  'grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-2 py-2 sm:flex sm:gap-x-4',
                  row.selected && 'rounded-sm border border-primary/50 bg-surface-raised',
                )}
              >
                <span className="w-8 shrink-0 text-right font-ui text-sm text-text-muted tabular">{row.position ?? '—'}</span>
                <Link
                  href={analyzeHref(query, { hero: row.slug })}
                  className={cx('flex min-h-11 min-w-0 flex-1 items-center gap-2.5 font-ui text-sm font-semibold hover:text-highlight', ranked ? 'text-text' : 'text-text-muted')}
                >
                  <HeroPortrait name={row.name} src={row.iconUrl ?? undefined} size="sm" decorative />
                  <span className="truncate">{row.name}</span>
                  {row.selected && <span className="rounded-xs border border-primary/50 px-1.5 text-caption font-normal text-primary">{t('selected')}</span>}
                </Link>
                <div className="col-start-2 flex flex-wrap items-center gap-x-4 gap-y-1 sm:shrink-0 sm:justify-end">
                  <span className="text-caption text-text-muted tabular sm:w-24 sm:text-right">
                    {formatPercent(row.pickRate)} <span className="sr-only">{t('pickRate')}</span>
                    <span aria-hidden="true"> {t('pick')}</span>
                  </span>
                  <span className="sr-only">{heroes('trendChart.winRate')}</span>
                  <WinRate value={row.winRate} muted={!ranked} className="w-28 shrink-0" />
                  <ConfidenceBadge sampleSize={row.matches} interval={row.interval} />
                </div>
              </li>
            )
          })}
        </ol>
      </Panel>
    </Block>
  )
}

// ── Builds ───────────────────────────────────────────────────────────

export async function BuildsSection({ ctx, query }: { ctx: HeroContext; query: AnalyzeQuery }) {
  // Only the builds list: item progression (Hero Detail's builds tab) isn't shown here, so it isn't loaded.
  const [result, t, heroes] = await Promise.all([attempt('[analyze] builds failed', heroBuilds(ctx)), getTranslations('analyze.builds'), getTranslations('heroes')])
  const labels = partLabels(heroes)
  const data = result.ok ? { builds: result.value } : null
  return (
    <Block
      id="analyze-builds"
      title={t('title')}
      description={t('description')}
      actions={<SeeMore href={heroHref(ctx.hero.slug, heroQueryFor(query, { tab: 'builds' }))}>{t('seeMore')}</SeeMore>}
    >
      {!result.ok ? (
        <DataNotice error={result.kind} what="Builds" />
      ) : !data || data.builds.length === 0 ? (
        <p className="rounded-md border border-border bg-surface p-4 text-sm text-text-muted">{t('none')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {!data.builds.some((b) => b.stats) && (
            <p role="note" className="rounded-md border border-border bg-surface p-4 text-sm text-text-muted">
              {t.rich('noTracked', {
                link: (chunks) => (
                  <Link href={buildsHref(DEFAULT_BUILDS_QUERY, { hero: ctx.hero.slug, rank: query.rank })} className="text-text underline decoration-steel underline-offset-2 hover:decoration-primary">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          )}
          <ol className="grid gap-4 lg:grid-cols-3">
            {data.builds.slice(0, 3).map((build) => (
              <li key={build.id} className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4 shadow-card">
                <Link href={`/builds/${ctx.hero.slug}/${build.id}`} className="font-ui text-sm font-semibold text-text hover:text-highlight pointer-coarse:min-h-11">
                  {build.name}
                </Link>
                <BuildStatsLine build={build} labels={labels.buildStats} />
                <BuildItemSequence build={build} maxCategories={2} labels={labels.buildItems} />
              </li>
            ))}
          </ol>
        </div>
      )}
    </Block>
  )
}

// ── Matchups ─────────────────────────────────────────────────────────

export async function MatchupsSection({ ctx, query }: { ctx: HeroContext; query: AnalyzeQuery }) {
  // Shared with the insights (same lane matchups); synergies aren't shown here, so they aren't loaded.
  const [result, t, heroes, locale] = await Promise.all([attempt('[analyze] matchups failed', laneMatchups(ctx, true)), getTranslations('analyze.matchups'), getTranslations('heroes.detail'), getLocale()])
  return (
    <Block
      id="analyze-matchups"
      title={t('title')}
      description={t('description')}
      actions={<SeeMore href={heroHref(ctx.hero.slug, heroQueryFor(query, { tab: 'matchups' }))}>{t('seeMore')}</SeeMore>}
    >
      {!result.ok ? (
        <DataNotice error={result.kind} what="Matchups" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title={t('best')} description={t('bestDescription', { count: formatInteger(result.value.all.length, locale) })}>
            <PairingList items={result.value.best.slice(0, 5)} tone="positive" empty={heroes('emptyLane')} />
          </Panel>
          <Panel title={t('worst')}>
            <PairingList items={result.value.worst.slice(0, 5)} tone="negative" empty={heroes('emptyLane')} />
          </Panel>
        </div>
      )}
    </Block>
  )
}

// ── Data context ─────────────────────────────────────────────────────

export function DataContext() {
  const t = useTranslations('analyze.method')
  const locale = useLocale()
  return (
    <Block id="analyze-method" title={t('title')}>
      <dl className="grid gap-4 rounded-md border border-border bg-surface p-(--spacing-card) text-sm md:grid-cols-2">
        <div>
          <dt className="font-ui font-semibold text-text">{t('source')}</dt>
          <dd className="mt-1 text-text-muted">{t('sourceText')}</dd>
        </div>
        <div>
          <dt className="font-ui font-semibold text-text">{t('sample')}</dt>
          <dd className="mt-1 text-text-muted">
            {t('sampleText', { moderate: formatInteger(SAMPLE_TIER_THRESHOLDS.moderate, locale), high: formatInteger(SAMPLE_TIER_THRESHOLDS.high, locale) })}
          </dd>
        </div>
        <div>
          <dt className="font-ui font-semibold text-text">{t('intervals')}</dt>
          <dd className="mt-1 text-text-muted">{t('intervalsText')}</dd>
        </div>
        <div>
          <dt className="font-ui font-semibold text-text">{t('limits')}</dt>
          <dd className="mt-1 text-text-muted">{t('limitsText')}</dd>
        </div>
      </dl>
    </Block>
  )
}
