import Link from 'next/link'
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
import { attempt } from '@/lib/deadlock/errors'
import { SAMPLE_TIER_THRESHOLDS } from '@/lib/analytics/sampleTier'
import { cx } from '@/lib/cx'
import { formatInteger, formatPercent, formatPointDelta } from '@/lib/format'
import { capitalize } from '@/features/meta/model'
import { getOverviewData, heroBuilds, laneMatchups, type HeroContext } from '@/features/hero/loaders'
import { heroHref } from '@/features/hero/query'
import { buildsHref, DEFAULT_BUILDS_QUERY } from '@/features/builds/query'
import { compareHref } from '@/features/compare/query'
import { InsightGrid, SeeMore } from '@/features/hero/components/HeroHeader'
import { BuildItemSequence, BuildStatsLine, PairingList, Panel } from '@/features/hero/components/parts'
import { TrendChart } from '@/features/hero/components/TrendChart'
import { getAnalyzeTrends, heroQueryFor } from '../loaders'
import { ordinal, type PeerComparison, type TrendRange } from '../model'
import { analyzeHref, type AnalyzeQuery } from '../query'

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
  const { hero, stats } = ctx
  return (
    <section aria-labelledby="analyze-hero" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4">
        <HeroPortrait name={hero.name} src={hero.iconUrl ?? undefined} size="lg" decorative />
        <div className="min-w-0 flex-1">
          <p className="text-eyebrow">Analyzing</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="analyze-hero" className="font-display text-display-lg font-extrabold text-text uppercase">
              {hero.name}
            </h2>
            {stats && <TierBadge tier={stats.tier} size="lg" />}
          </div>
          {hero.role && <p className="text-sm text-text-muted">{capitalize(hero.role)}</p>}
        </div>
        <SeeMore href={heroHref(hero.slug, heroQueryFor(query))}>Open hero page</SeeMore>
      </div>

      <ScopeLine scope={ctx.statScope} />

      {!stats ? (
        <p className="rounded-md border border-border bg-surface p-4 text-sm text-text-muted">
          No matches for {hero.name} in this scope, so there is nothing to measure. Try a longer window or a broader rank band.
        </p>
      ) : (
        <>
          {stats.sample === 'low' && (
            <p role="note" className="rounded-md border border-orange/40 bg-surface p-4 text-sm text-text">
              <span className="font-semibold">Low sample:</span> {formatInteger(stats.matches)} matches (under {formatInteger(SAMPLE_TIER_THRESHOLDS.moderate)}). The numbers below are shown for
              reference only: they aren&rsquo;t ranked, compared or used for insights. Try a longer window or a broader rank band.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Win rate"
              value={stats.winRate}
              format="percent"
              interval={stats.interval}
              scope={ctx.statScope}
              showScope={false}
              delta={stats.trend ? <TrendBadge direction={stats.trend.direction} delta={stats.trend.delta} comparison="last 7 days vs the 7 before" /> : undefined}
              why={
                <>
                  Won {formatInteger(stats.wins)} of {formatInteger(stats.matches)} matches. The 95% interval is {formatPercent(stats.interval.low)}–{formatPercent(stats.interval.high)}
                  {stats.trend ? '' : '. The weekly trend needs a non-Low sample in both weeks, so none is shown'}.
                </>
              }
            />
            <StatCard
              label="Pick rate"
              value={stats.pickRate}
              format="percent"
              scope={ctx.statScope}
              showScope={false}
              why={`Share of matches with ${hero.name} in this scope: hero matches ÷ (all hero matches ÷ 12). ${ordinal(stats.pickRank)} most picked of ${ctx.heroCount} heroes.`}
            />
            <StatCard label="Matches" value={stats.matches} format="compact" scope={ctx.statScope} showScope={false} />
          </div>
        </>
      )}
    </section>
  )
}

// ── Insights ─────────────────────────────────────────────────────────

export async function InsightsSection({ ctx }: { ctx: HeroContext }) {
  // A loader that fails takes down its own section only, with the classified reason (same as Hero Detail tabs).
  const result = await attempt('[analyze] insights failed', getOverviewData(ctx))
  if (!result.ok) return <DataNotice error={result.kind} what="Insights" />
  return <InsightGrid heroName={ctx.hero.name} tier={ctx.stats?.tier ?? null} insights={result.value.insights} />
}

// ── Trends ───────────────────────────────────────────────────────────

export async function TrendsSection({ ctx, query }: { ctx: HeroContext; query: AnalyzeQuery }) {
  const result = await attempt('[analyze] trends failed', getAnalyzeTrends(ctx))
  return (
    <Block
      id="analyze-trends"
      title="Win rate and pick rate trends"
      description={result.ok ? <TrendRangeText range={result.value} scope={ctx.statScope} /> : `Daily values for ${ctx.statScope.windowLabel.toLowerCase()}, ${ctx.statScope.rankLabel}.`}
      actions={<SeeMore href={heroHref(ctx.hero.slug, heroQueryFor(query, { tab: 'trends' }))}>Patch history and splits</SeeMore>}
    >
      {!result.ok ? (
        <DataNotice error={result.kind} what="Trends" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Win rate" description="Daily, with the 50% line for reference.">
            <TrendChart points={result.value.points} metric="winRate" label="Win rate" baseline={0.5} markers={result.value.patches.map((p) => ({ day: p.day, title: p.title }))} />
          </Panel>
          <Panel title="Pick rate" description="Share of each day’s matches.">
            <TrendChart points={result.value.points} metric="pickRate" label="Pick rate" markers={result.value.patches.map((p) => ({ day: p.day, title: p.title }))} />
          </Panel>
        </div>
      )}
    </Block>
  )
}

/** "Last 7 days" → "last 7 days"; leaves month names inside the label alone. */
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

const DAY_LABEL = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/**
 * States exactly which days the charts cover: the selected window, its dates, and any days the source
 * returned no data for (never filled in). The "current patch" window is capped at 60 days of history.
 */
function TrendRangeText({ range, scope }: { range: TrendRange & { patches: unknown[] }; scope: HeroContext['statScope'] }) {
  const dates = `${DAY_LABEL.format(range.from * 1000)} – ${DAY_LABEL.format(range.to * 1000)}`
  return (
    <>
      Daily values for the selected window, {lowerFirst(scope.windowLabel)}: {dates} ({range.requestedDays} {range.requestedDays === 1 ? 'day' : 'days'}), {scope.rankLabel}. Patch days
      are marked.
      {range.missingDays > 0 && ` The source has no daily data for ${range.missingDays} of these days, so the charts show ${range.points.length}.`}
    </>
  )
}

// ── Peer comparison ──────────────────────────────────────────────────

export function ComparisonSection({ comparison, query, heroName }: { comparison: PeerComparison; query: AnalyzeQuery; heroName: string }) {
  const groupLabel = comparison.role ? `${capitalize(comparison.role)} heroes` : 'all heroes'
  const self = comparison.rows.find((r) => r.selected)
  return (
    <Block
      id="analyze-compare"
      title="Compared with other heroes"
      description="Same window and rank band. Only heroes with enough data are ranked; Low-sample heroes are listed last, muted."
      // Carries the scope so Compare shows the same numbers as this page.
      actions={<SeeMore href={compareHref({ type: 'heroes', a: query.hero ?? '', b: '', window: query.window, rank: query.rank })}>Head-to-head compare</SeeMore>}
    >
      <Panel
        title={`${heroName} among ${groupLabel}`}
        description={<ComparisonSentence comparison={comparison} heroName={heroName} groupLabel={groupLabel} selfWinRate={self?.winRate ?? null} />}
        actions={
          <Filter
            label="Compare with"
            // The group actually shown; "Same role" is offered only when the hero has a role.
            value={comparison.group}
            options={[
              ...(comparison.roleAvailable ? [{ value: 'role', label: 'Same role', href: analyzeHref(query, { peers: 'role' }) }] : []),
              { value: 'all', label: 'All heroes', href: analyzeHref(query, { peers: 'all' }) },
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
                  {row.selected && <span className="rounded-xs border border-primary/50 px-1.5 text-caption font-normal text-primary">Selected</span>}
                </Link>
                <div className="col-start-2 flex flex-wrap items-center gap-x-4 gap-y-1 sm:shrink-0 sm:justify-end">
                  <span className="text-caption text-text-muted tabular sm:w-24 sm:text-right">
                    {formatPercent(row.pickRate)} <span className="sr-only">pick rate</span>
                    <span aria-hidden="true"> pick</span>
                  </span>
                  <span className="sr-only">Win rate</span>
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

function ComparisonSentence({ comparison: c, heroName, groupLabel, selfWinRate }: { comparison: PeerComparison; heroName: string; groupLabel: string; selfWinRate: number | null }) {
  if (c.winRatePosition === null || selfWinRate === null) {
    return <>{heroName} has a Low sample in this scope, so it isn&rsquo;t ranked or compared.</>
  }
  const versus =
    c.rest && c.versusRest === 'higher'
      ? `Higher than the other ${groupLabel} combined (${formatPercent(c.rest.winRate)}, ${formatPointDelta(selfWinRate - c.rest.winRate)}); the 95% intervals don’t overlap.`
      : c.rest && c.versusRest === 'lower'
        ? `Lower than the other ${groupLabel} combined (${formatPercent(c.rest.winRate)}, ${formatPointDelta(selfWinRate - c.rest.winRate)}); the 95% intervals don’t overlap.`
        : c.rest && c.versusRest === 'within'
          ? `Not clearly different from the other ${groupLabel} combined (${formatPercent(c.rest.winRate)}): the intervals overlap or the gap is under 1 point.`
          : ''
  return (
    <>
      {ordinal(c.winRatePosition)} highest win rate and {ordinal(c.pickRatePosition ?? 0)} highest pick rate of {c.ranked} {groupLabel} with enough data. {versus}
    </>
  )
}

// ── Builds ───────────────────────────────────────────────────────────

export async function BuildsSection({ ctx, query }: { ctx: HeroContext; query: AnalyzeQuery }) {
  // Only the builds list: item progression (Hero Detail's builds tab) isn't shown here, so it isn't loaded.
  const result = await attempt('[analyze] builds failed', heroBuilds(ctx))
  const data = result.ok ? { builds: result.value } : null
  return (
    <Block
      id="analyze-builds"
      title="Build performance"
      description="This week’s most-favorited community builds, those with tracked results first (a build counts when it was selected at game start)."
      actions={<SeeMore href={heroHref(ctx.hero.slug, heroQueryFor(query, { tab: 'builds' }))}>All builds and items</SeeMore>}
    >
      {!result.ok ? (
        <DataNotice error={result.kind} what="Builds" />
      ) : !data || data.builds.length === 0 ? (
        <p className="rounded-md border border-border bg-surface p-4 text-sm text-text-muted">No community builds found for this hero.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {!data.builds.some((b) => b.stats) && (
            <p role="note" className="rounded-md border border-border bg-surface p-4 text-sm text-text-muted">
              None of this week&rsquo;s most-favorited builds has tracked matches in this scope, so there is no build performance to show here. A longer window often has
              some; the{' '}
              <Link href={buildsHref(DEFAULT_BUILDS_QUERY, { hero: ctx.hero.slug, rank: query.rank })} className="text-text underline decoration-steel underline-offset-2 hover:decoration-primary">
                Builds page
              </Link>{' '}
              uses the last 30 days for the same rank band.
            </p>
          )}
          <ol className="grid gap-4 lg:grid-cols-3">
            {data.builds.slice(0, 3).map((build) => (
              <li key={build.id} className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4 shadow-card">
                <Link href={`/builds/${ctx.hero.slug}/${build.id}`} className="font-ui text-sm font-semibold text-text hover:text-highlight pointer-coarse:min-h-11">
                  {build.name}
                </Link>
                <BuildStatsLine build={build} />
                <BuildItemSequence build={build} maxCategories={2} />
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
  const result = await attempt('[analyze] matchups failed', laneMatchups(ctx, true))
  return (
    <Block
      id="analyze-matchups"
      title="Matchup analysis"
      description="Lane opponents with 100+ games, ranked by the edge of the 95% interval so small samples can’t top the list."
      actions={<SeeMore href={heroHref(ctx.hero.slug, heroQueryFor(query, { tab: 'matchups' }))}>All matchups and synergies</SeeMore>}
    >
      {!result.ok ? (
        <DataNotice error={result.kind} what="Matchups" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Best matchups" description={`${formatInteger(result.value.all.length)} lane opponents with enough games.`}>
            <PairingList items={result.value.best.slice(0, 5)} tone="positive" empty="No lane opponent has enough games yet." />
          </Panel>
          <Panel title="Worst matchups">
            <PairingList items={result.value.worst.slice(0, 5)} tone="negative" empty="No lane opponent has enough games yet." />
          </Panel>
        </div>
      )}
    </Block>
  )
}

// ── Data context ─────────────────────────────────────────────────────

export function DataContext() {
  return (
    <Block id="analyze-method" title="How to read this">
      <dl className="grid gap-4 rounded-md border border-border bg-surface p-(--spacing-card) text-sm md:grid-cols-2">
        <div>
          <dt className="font-ui font-semibold text-text">Source and scope</dt>
          <dd className="mt-1 text-text-muted">
            Public match data from deadlock-api.com, normal mode. Every number uses the window and rank band selected above (match average rank), the same numbers as the Meta and hero pages.
          </dd>
        </div>
        <div>
          <dt className="font-ui font-semibold text-text">Sample size</dt>
          <dd className="mt-1 text-text-muted">
            Under {formatInteger(SAMPLE_TIER_THRESHOLDS.moderate)} matches is a Low sample: shown muted, never ranked, compared or turned into an insight. Over {formatInteger(SAMPLE_TIER_THRESHOLDS.high)} is High.
          </dd>
        </div>
        <div>
          <dt className="font-ui font-semibold text-text">Intervals</dt>
          <dd className="mt-1 text-text-muted">
            Win rates come with a 95% Wilson interval. A difference is called out only when two intervals don&rsquo;t overlap and the gap is at least 1 percentage point.
          </dd>
        </div>
        <div>
          <dt className="font-ui font-semibold text-text">What it doesn&rsquo;t say</dt>
          <dd className="mt-1 text-text-muted">These are measured results, not causes. A higher win rate in a split doesn&rsquo;t say why, and item win rates partly reflect who is already ahead.</dd>
        </div>
      </dl>
    </Block>
  )
}
