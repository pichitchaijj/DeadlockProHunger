import { MatchCard } from '@/components/cards/MatchCard'
import { ConfidenceBadge } from '@/components/data/ConfidenceBadge'
import { DataNotice } from '@/components/data/DataState'
import { Filter } from '@/components/ui/Filter'
import { EmptyState } from '@/components/ui/States'
import { attempt } from '@/lib/deadlock/errors'
import { rankFromBadge } from '@/lib/deadlock/rankAssets'
import { cx } from '@/lib/cx'
import { formatInteger, formatPercent, formatPointDelta, formatRelativeTime } from '@/lib/format'
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
import { AbilitySequence, BuildItemSequence, BuildStatsLine, ItemProgressionView, PairingList, Panel, SplitBars } from './parts'
import { TrendChart } from './TrendChart'
import type { getOverviewData } from '../loaders'

type OverviewData = Awaited<ReturnType<typeof getOverviewData>>
const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })


// ── Overview ─────────────────────────────────────────────────────────

export function OverviewTab({ ctx, query, data }: { ctx: HeroContext; query: HeroQuery; data: OverviewData }) {
  const link = (tab: HeroQuery['tab']) => heroHref(ctx.hero.slug, query, { tab })
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Best matchups" description="Lane opponents with 100+ games, ranked by the low end of the interval." actions={<SeeMore href={link('matchups')}>All matchups</SeeMore>}>
        <PairingList items={data.best} tone="positive" empty="No lane opponent has enough games yet." />
      </Panel>
      <Panel title="Worst matchups" description="Lane opponents ranked by the high end of the interval." actions={<SeeMore href={link('matchups')}>All matchups</SeeMore>}>
        <PairingList items={data.worst} tone="negative" empty="No lane opponent has enough games yet." />
      </Panel>
      <Panel title="Strong synergies" description="Teammates, any lane, 100+ matches together." actions={<SeeMore href={link('matchups')}>All synergies</SeeMore>}>
        <PairingList items={data.synergies} tone="positive" empty="No partner has enough matches together yet." />
      </Panel>
      <Panel title="Best build" description="Most-played tracked build (selected at game start)." actions={<SeeMore href={link('builds')}>All builds</SeeMore>}>
        {data.topBuild ? <BuildPreview build={data.topBuild} /> : <p className="text-sm text-text-muted">No community builds found for this hero.</p>}
      </Panel>
      <Panel title="Ability opening" description={`Most common first ${ABILITY_PREFIX} upgrades.`} actions={<SeeMore href={link('abilities')}>All openings</SeeMore>}>
        {data.opening ? (
          <div className="flex flex-col gap-3">
            <AbilitySequence order={data.opening} abilities={data.abilities} />
            <OrderStats share={data.opening.share} winRate={data.opening.winRate} matches={data.opening.matches} interval={data.opening.interval} />
          </div>
        ) : (
          <p className="text-sm text-text-muted">Not enough ability-order data in this scope.</p>
        )}
      </Panel>
      <Panel title="Performance by match length" description="Win rate by how long the match lasted." actions={<SeeMore href={link('trends')}>Trends</SeeMore>}>
        <SplitBars comparison={data.length} unit="matches" />
      </Panel>
    </div>
  )
}

function BuildPreview({ build }: { build: HeroBuild }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-ui text-sm font-semibold text-text">{build.name}</p>
      <BuildStatsLine build={build} />
      <BuildItemSequence build={build} maxCategories={2} />
    </div>
  )
}

function OrderStats({ share, winRate, matches, interval }: { share: number; winRate: number; matches: number; interval: { low: number; high: number } }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
      Used in {formatPercent(share, 0)} of tracked orders · <span className="text-text tabular">{formatPercent(winRate)}</span> win rate
      <ConfidenceBadge sampleSize={matches} interval={interval} />
    </p>
  )
}

// ── Builds ───────────────────────────────────────────────────────────

export async function BuildsTab({ ctx }: { ctx: HeroContext }) {
  const result = await attempt('[hero] builds failed', getBuildsData(ctx))
  if (!result.ok) return <DataNotice error={result.kind} what="Builds" />
  const data = result.value
  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Best builds"
        description="This week’s most-favorited community builds. Win rate counts matches where the build was selected at game start; changes during the match aren’t tracked."
      >
        {data.builds.length === 0 ? (
          <p className="text-sm text-text-muted">No community builds found for this hero.</p>
        ) : (
          <ol className="grid gap-4 lg:grid-cols-2">
            {data.builds.slice(0, 6).map((build) => (
              <li key={build.id} className="flex flex-col gap-3 rounded-md border border-border bg-surface-sunken p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-ui text-sm font-semibold text-text">{build.name}</p>
                  <p className="text-caption text-text-muted tabular">
                    {[build.weeklyFavorites ? `${formatInteger(build.weeklyFavorites)} favorites this week` : null, build.updatedAt ? `updated ${formatRelativeTime(build.updatedAt)}` : null].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <BuildStatsLine build={build} />
                <BuildItemSequence build={build} />
              </li>
            ))}
          </ol>
        )}
      </Panel>
      <Panel
        title="Item progression"
        description={`Shop items bought in at least ${formatPercent(CORE_BUY_RATE, 0)} of this hero’s matches, by average buy time.`}
      >
        <ItemProgressionView phases={data.progression} />
        <p className="mt-4 rounded-sm border border-border bg-surface-sunken px-3 py-2 text-caption text-text-muted">
          Item win rates are shown small on purpose: players who are already ahead buy more items sooner, so an item’s win rate partly reflects the lead, not the item.
        </p>
      </Panel>
    </div>
  )
}

// ── Matchups ─────────────────────────────────────────────────────────

export async function MatchupsTab({ ctx, query }: { ctx: HeroContext; query: HeroQuery }) {
  const result = await attempt('[hero] matchups failed', getMatchupsData(ctx, query.lane))
  if (!result.ok) return <DataNotice error={result.kind} what="Matchups" />
  const data = result.value
  const scopeText = query.lane === 'lane' ? 'lane opponents' : 'opponents in any lane'
  return (
    <div className="flex flex-col gap-4">
      <Filter
        label="Opponents"
        value={query.lane}
        options={[
          { value: 'lane', label: 'Lane opponents', href: heroHref(ctx.hero.slug, query, { lane: 'lane' }) },
          { value: 'any', label: 'Any opponent', href: heroHref(ctx.hero.slug, query, { lane: 'any' }) },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Best matchups" description={`${formatInteger(data.opponents)} ${scopeText} with 100+ games. Ranked by the low end of the interval.`}>
          <PairingList items={data.best} tone="positive" empty="Not enough games against any opponent." />
        </Panel>
        <Panel title="Worst matchups" description="Ranked by the high end of the interval.">
          <PairingList items={data.worst} tone="negative" empty="Not enough games against any opponent." />
        </Panel>
      </div>
      <Panel title="Strong synergies" description="Teammates in any lane, 100+ matches together, ranked by the low end of the interval.">
        <PairingList items={data.synergies} tone="positive" empty="No partner has enough matches together yet." />
      </Panel>
    </div>
  )
}

// ── Abilities ────────────────────────────────────────────────────────

export async function AbilitiesTab({ ctx }: { ctx: HeroContext }) {
  const result = await attempt('[hero] abilities failed', getAbilitiesData(ctx))
  if (!result.ok) return <DataNotice error={result.kind} what="Ability orders" />
  const data = result.value
  if (data.openings.length === 0) return <EmptyState title="Not enough data" description="No ability order has 100+ matches in this scope. Try a longer window or a wider rank band." />
  return (
    <Panel
      title="Ability order"
      description={`The most common first ${ABILITY_PREFIX} upgrades. Full orders aren’t compared because longer games allow more upgrades, which skews their win rates.`}
    >
      <ol className="flex flex-col gap-6">
        {data.openings.map((order, i) => (
          <li key={order.sequence.join(',')} className={cx('flex flex-col gap-3', i > 0 && 'border-t border-border pt-6')}>
            <p className="font-ui text-sm font-semibold text-text">Opening {i + 1}</p>
            <AbilitySequence order={order} abilities={data.abilities} />
            <OrderStats share={order.share} winRate={order.winRate} matches={order.matches} interval={order.interval} />
          </li>
        ))}
      </ol>
    </Panel>
  )
}

// ── Trends ───────────────────────────────────────────────────────────

export async function TrendsTab({ ctx }: { ctx: HeroContext }) {
  const result = await attempt('[hero] trends failed', getTrendsData(ctx))
  if (!result.ok) return <DataNotice error={result.kind} what="Trends" />
  const data = result.value
  const markers = data.patches.map((p) => ({ day: p.day, title: p.title }))
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Recent trends: win rate" description="Daily, last 30 days, rank-scoped.">
          <TrendChart points={data.series} metric="winRate" label="Win rate" baseline={0.5} markers={markers} />
        </Panel>
        <Panel title="Recent trends: pick rate" description="Share of matches each day.">
          <TrendChart points={data.series} metric="pickRate" label="Pick rate" markers={markers} />
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Performance by rank" description="Win rate by match average rank (selected window). The rank filter doesn’t apply here, and matches without an average rank aren’t counted, so these can differ from the overall rate.">
          <SplitBars comparison={data.rank} unit="matches" />
        </Panel>
        <Panel title="Performance by match length" description="Win rate by how long the match lasted.">
          <SplitBars comparison={data.length} unit="matches" />
        </Panel>
      </div>
      <Panel title="Patch history" description="Win rate in the 7 days before each patch vs the 7 days after (or until the next patch).">
        {data.patches.length === 0 ? (
          <p className="text-sm text-text-muted">No patches in the last 60 days.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border">
            {data.patches.map((p) => {
              const before = p.before ? p.before.wins / p.before.matches : null
              const after = p.after ? p.after.wins / p.after.matches : null
              return (
                <li key={p.day} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                  <span className="w-28 shrink-0 text-sm text-text-muted">{DATE.format(p.day * 1000)}</span>
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
                    {p.verdict === 'higher' ? 'Higher after' : p.verdict === 'lower' ? 'Lower after' : p.verdict === 'no clear change' ? 'No clear change' : 'Not enough data'}
                  </span>
                </li>
              )
            })}
          </ol>
        )}
        <p className="mt-3 text-caption text-text-muted">“Higher/lower after” means the two windows’ 95% intervals don’t overlap. It doesn’t say what in the patch caused it.</p>
      </Panel>
    </div>
  )
}

// ── Matches ──────────────────────────────────────────────────────────

type LoadedTeam = Awaited<ReturnType<typeof getMatchesData>>[number]['teams'][number]
const toTeam = (t: LoadedTeam) => ({ label: t.label, won: t.won, heroes: t.heroes.map((h) => ({ name: h.name, imageSrc: h.iconUrl ?? undefined })) })

export async function MatchesTab({ ctx }: { ctx: HeroContext }) {
  const result = await attempt('[hero] matches failed', getMatchesData(ctx))
  if (!result.ok) return <DataNotice error={result.kind} what="Recent matches" />
  const matches = result.value
  if (matches.length === 0) return <EmptyState title="No recent matches" description="No recent matches with this hero were found for this rank band." />
  return (
    <Panel title="Match samples" description="The most recent matches with this hero that the data source has processed. Samples, not a summary.">
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
              teams={[toTeam(m.teams[0]), toTeam(m.teams[1])]}
              className="h-full"
            />
          </li>
        ))}
      </ul>
    </Panel>
  )
}
