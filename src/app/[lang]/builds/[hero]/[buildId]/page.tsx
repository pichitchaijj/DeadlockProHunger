import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { localePath } from '@/i18n/server'
import type { ReactNode } from 'react'
import { ScopeLine } from '@/components/data/ScopeLine'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { PageContainer } from '@/components/layout/PageContainer'
import { CountUp } from '@/components/motion/CountUp'
import { ButtonLink } from '@/components/ui/Button'
import { RankBadge } from '@/components/game-assets/RankBadge'
import { Filter } from '@/components/ui/Filter'

import { cx } from '@/lib/cx'
import { formatInteger, formatPercent, formatPointDelta } from '@/lib/format'
import { BuildLabels, PatchNote } from '@/features/builds/components/BuildListCard'
import { AbilityPlanGrid, FlowView, ItemRow, PerformanceCompare, PhaseColumns, TimingTable } from '@/features/builds/components/detail'
import { getBuildDetail } from '@/features/builds/loaders'
import { buildDetailHref, buildsHref, DEFAULT_BUILDS_QUERY, parseBuildsQuery } from '@/features/builds/query'
import { AbilitySequence, Panel } from '@/features/hero/components/parts'
import { ABILITY_PREFIX } from '@/features/hero/model'
import { rankBandOptions } from '@/features/meta/rankFilter'
import { resolveScope } from '@/features/meta/scope'
import { DataNotice } from '@/components/data/DataState'
import { attempt } from '@/lib/deadlock/errors'

type Params = Promise<{ hero: string; buildId: string }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

export const metadata: Metadata = { title: 'Build' }

const WINDOWS = [
  ['patch', 'Current patch'],
  ['7d', '7 days'],
  ['30d', '30 days'],
] as const

export default async function BuildDetailPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { hero: heroSlug, buildId: rawId } = await params
  const query = parseBuildsQuery(await searchParams)
  const buildId = Number(rawId)
  if (!Number.isInteger(buildId) || buildId <= 0) notFound()

  const [detail, scope] = await Promise.all([
    attempt('[build] detail failed', getBuildDetail(heroSlug, buildId, query)),
    resolveScope({ window: query.window, rank: query.rank, mode: 'all' }).catch(() => null),
  ])
  const data = detail.ok ? detail.value : undefined
  const failed = detail.ok ? 'unavailable' : detail.kind
  if (data === null) notFound()
  if (data?.kind === 'redirect') redirect(await localePath(data.href))
  if (!data) {
    return (
      <PageContainer>
        <h1 className="sr-only">Build {buildId}</h1>
        <DataNotice error={failed} what="Build" action={<ButtonLink href={buildDetailHref(heroSlug, buildId, query)} variant="secondary" size="sm">Try again</ButtonLink>} />
      </PageContainer>
    )
  }

  const { hero, build, stats } = data
  const timed = data.phases.phases.flatMap((p) => p.items)
  const delta = stats && data.heroWinRate !== null ? stats.winRate - data.heroWinRate : null

  return (
    <PageContainer className="flex flex-col gap-10">
      {/* Header */}
      <section aria-labelledby="build-name" className="flex animate-awaken flex-col gap-5">
        <p className="text-eyebrow">
          <Link href={buildsHref({ ...DEFAULT_BUILDS_QUERY, ...query })} className="hover:text-text pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center">Builds</Link>{' '}
          <span aria-hidden="true">/</span>{' '}
          <Link href={`/heroes/${hero.slug}`} className="hover:text-text">{hero.name}</Link>
        </p>
        <div className="flex flex-wrap items-start gap-4">
          <HeroPortrait name={hero.name} src={hero.iconUrl ?? undefined} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h1 id="build-name" className="font-display text-display-l font-extrabold text-text uppercase">{build.name}</h1>
            <p className="text-sm text-text-muted">
              {hero.name} · {build.authorName ? `by ${build.authorName}` : 'Author unknown'}
              {build.authorRank && <> · <RankBadge rank={build.authorRank} size="xs" /></>}
              {build.version && ` · version ${build.version}`}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <PatchNote status={build.patch} updatedAt={build.updatedAt} />
              {build.weeklyFavorites && <span className="text-caption text-text-muted tabular">{formatInteger(build.weeklyFavorites)} favorites this week</span>}
            </div>
            <BuildLabels labels={data.labels} />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3 lg:max-w-3xl">
          <Stat label="Win rate (build)">{stats ? <CountUp value={stats.winRate} format="percent" /> : <span className="text-text-muted">—</span>}</Stat>
          <Stat label="Tracked matches">{stats ? <CountUp value={stats.matches} format="integer" /> : <span className="text-text-muted">0</span>}</Stat>
          <Stat label={`vs ${hero.name} overall`} className="col-span-2 sm:col-span-1">
            {delta !== null ? <span className={cx(stats!.sample === 'low' && 'text-text-muted')}>{formatPointDelta(delta)}</span> : <span className="text-text-muted">—</span>}
          </Stat>
        </dl>

        <div className="grid gap-4 md:grid-cols-2">
          <Filter label="Patch / time" value={query.window} options={WINDOWS.map(([value, label]) => ({ value, label, href: buildDetailHref(hero.slug, buildId, { ...query, window: value }) }))} />
          {scope && (
            <Filter label="Rank (match average)" value={query.rank} options={rankBandOptions(scope.rankLabels, scope.ranks, (rank) => buildDetailHref(hero.slug, buildId, { ...query, rank }))} />
          )}
        </div>
        <ScopeLine scope={{ ...data.statScope, sampleSize: stats?.matches }} />
      </section>

      {/* Why this build? */}
      <section aria-labelledby="why-build" className="flex flex-col gap-4">
        <div>
          <h2 id="why-build" className="font-display text-display-m font-bold text-text uppercase">Why this build?</h2>
          <p className="mt-1 max-w-3xl text-sm text-text-muted">The measured case for (or against) this build. Facts only; nothing here is a recommendation the data doesn’t support.</p>
        </div>
        <dl className="grid gap-3 md:grid-cols-2">
          {data.why.map((fact) => (
            <div key={fact.label} className="rounded-md border border-border bg-surface p-4">
              <dt className="text-eyebrow">{fact.label}</dt>
              <dd className="mt-1 text-sm text-text">{fact.text}</dd>
            </div>
          ))}
          <div className="rounded-md border border-border bg-surface p-4">
            <dt className="text-eyebrow">Rank scope</dt>
            <dd className="mt-1 text-sm text-text">{data.scopeText}. Change the filters above to see the same build in another rank band or window.</dd>
          </div>
        </dl>
      </section>

      <Panel title="Early · Core · Late" description="Placed by when players of this hero actually buy each item on average, not by the author’s section names.">
        <PhaseColumns phases={data.phases.phases} untimed={data.phases.untimed} />
        {data.sections.length > 0 && (
          <details className="mt-5 border-t border-border pt-4">
            <summary className="cursor-pointer py-3 font-ui text-sm font-semibold text-primary hover:text-highlight">Author’s layout ({data.sections.length} sections)</summary>
            <ol className="mt-3 flex flex-col gap-3">
              {data.sections.map((section) => (
                <li key={section.name} className="flex flex-col gap-1.5">
                  <span className="text-caption text-text-muted">{section.name}</span>
                  <ItemRow items={section.items} size={32} />
                </li>
              ))}
            </ol>
          </details>
        )}
      </Panel>

      {/* Full width: the author's plan has up to 16 steps. */}
      <div className="grid gap-4">
        <Panel title="Ability order" description="The author’s plan: ● unlock, I–III upgrade level. Read from the build’s data structure.">
          {data.plan.length > 0 ? <AbilityPlanGrid plan={data.plan} abilities={data.abilities} /> : <p className="text-sm text-text-muted">This build has no ability plan.</p>}
          {data.opening && (
            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-2 text-caption text-text-muted">
                For comparison: the most common first {ABILITY_PREFIX} upgrades in real matches ({formatPercent(data.opening.share, 0)} of tracked orders, {formatPercent(data.opening.winRate)} win rate).
              </p>
              <AbilitySequence order={data.opening} abilities={data.abilities} />
            </div>
          )}
        </Panel>
        <Panel title="Build performance" description="Matches where this build was selected at game start.">
          {stats ? (
            <PerformanceCompare stats={stats} heroWinRate={data.heroWinRate} heroName={hero.name} />
          ) : (
            <p className="text-sm text-text-muted">No tracked matches for this build in this scope, so its performance can’t be measured. Try a 30-day window or all ranks.</p>
          )}
          <p className="mt-4 text-caption text-text-muted">
            {data.trackedBuilds} {hero.name} builds have tracked matches in this scope. Switching builds mid-match isn’t tracked.
          </p>
        </Panel>
      </div>

      <Panel title="Item timing" description={`Average purchase time for this build’s items across all ${hero.name} players in this scope.`}>
        <TimingTable items={timed} />
      </Panel>

      <Panel title="Item flow" description="Where this build’s items sit in the typical purchase flow for this hero.">
        {data.flow && data.flow.items.length > 0 ? <FlowView flow={data.flow} /> : <p className="text-sm text-text-muted">No item-flow data for this build’s items in this scope.</p>}
      </Panel>
    </PageContainer>
  )
}

function Stat({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col justify-between gap-1 bg-surface px-4 py-3', className)}>
      <dt className="text-eyebrow">{label}</dt>
      <dd className="font-display text-display-m font-bold text-text tabular">{children}</dd>
    </div>
  )
}
