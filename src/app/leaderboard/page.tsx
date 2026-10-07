import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { PageContainer } from '@/components/layout/PageContainer'
import { ButtonLink } from '@/components/ui/Button'
import { Filter } from '@/components/ui/Filter'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, LoadingState } from '@/components/ui/States'
import { rankBandOptions } from '@/features/meta/rankFilter'
import { cx } from '@/lib/cx'
import { REGIONS, SCOREBOARD_METRICS, type ScoreboardMetric } from '@/lib/deadlock/constants'
import { HeroSelect } from '@/features/builds/components/HeroSelect'
import { BoardCards, BoardTable, Podium } from '@/features/leaderboard/components/Board'
import { getLeaderboardData } from '@/features/leaderboard/loaders'
import { leaderboardHref, parseLeaderboardQuery, type LeaderboardQuery } from '@/features/leaderboard/query'
import { capitalize } from '@/features/meta/model'
import { ROLES } from '@/features/meta/query'
import { DataNotice } from '@/components/data/DataState'
import { attempt } from '@/lib/deadlock/errors'

export const metadata: Metadata = {
  title: 'Leaderboard',
  description: 'Deadlock leaderboards by region, globally and per hero, plus performance boards from tracked matches.',
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function LeaderboardPage({ searchParams }: { searchParams: SearchParams }) {
  const query = parseLeaderboardQuery(await searchParams)
  return (
    <PageContainer className="flex flex-col gap-6">
      <SectionHeader
        as="h1"
        eyebrow="Leaderboard"
        title="Leaderboard"
        description="Click a player to open their profile. A tinted row means their latest ranked match promoted or demoted them."
      />
      <nav aria-label="Leaderboard views" className="border-b border-border">
        <ul className="flex gap-1">
          {(['ranked', 'performance'] as const).map((view) => (
            <li key={view}>
              <Link
                href={leaderboardHref(query, { view })}
                aria-current={query.view === view ? 'page' : undefined}
                className={cx('relative flex h-11 items-center px-4 font-display text-[0.95rem] font-semibold tracking-[0.08em] uppercase', query.view === view ? 'text-text' : 'text-text-muted hover:text-text')}
              >
                {view === 'ranked' ? 'Ranked' : 'Performance'}
                <span aria-hidden="true" className={cx('absolute inset-x-3 bottom-0 h-0.5 bg-primary', query.view === view ? 'opacity-100' : 'opacity-0')} />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Suspense key={leaderboardHref(query, { page: query.page })} fallback={<LoadingState label="Loading leaderboard"><Skeleton className="h-[32rem]" /></LoadingState>}>
        <Board query={query} />
      </Suspense>
    </PageContainer>
  )
}

async function Board({ query }: { query: LeaderboardQuery }) {
  const dataLoad = await attempt('[leaderboard] load failed', getLeaderboardData(query))
  const data = dataLoad.ok ? dataLoad.value : null
  const failed = dataLoad.ok ? 'unavailable' : dataLoad.kind
  if (!data) return <DataNotice error={failed} what="Leaderboard" action={<ButtonLink href={leaderboardHref(query)} variant="secondary" size="sm">Try again</ButtonLink>} />

  const mode = query.view === 'performance' ? ({ kind: 'performance', metric: query.metric } as const) : query.scope === 'global' ? ({ kind: 'global' } as const) : ({ kind: 'regional' } as const)
  const metrics = (Object.keys(SCOREBOARD_METRICS) as ScoreboardMetric[]).filter((m) => m !== 'rank')

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 rounded-md border border-border bg-surface/60 p-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {query.view === 'ranked' ? (
            <>
              <Filter
                label="Scope"
                value={query.scope}
                options={[{ value: 'global', label: 'Global', href: leaderboardHref(query, { scope: 'global' }) }, ...REGIONS.map(([value, label]) => ({ value, label, href: leaderboardHref(query, { scope: value }) }))]}
              />
              {query.scope !== 'global' && (
                <div className="grid gap-4 xl:grid-cols-2">
                  <Filter label="Role (first listed top hero)" value={query.role} options={[{ value: 'all', label: 'All', href: leaderboardHref(query, { role: 'all' }) }, ...ROLES.map((r) => ({ value: r, label: capitalize(r), href: leaderboardHref(query, { role: r }) }))]} />
                  {data.rankLabels && <Filter label="Current rank" value={query.rank} options={rankBandOptions(data.rankLabels, data.ranks, (rank) => leaderboardHref(query, { rank }))} />}
                </div>
              )}
            </>
          ) : (
            <>
              <Filter label="Metric" value={query.metric} options={metrics.map((m) => ({ value: m, label: SCOREBOARD_METRICS[m].label, href: leaderboardHref(query, { metric: m }) }))} />
              <div className="grid gap-4 xl:grid-cols-3">
                <Filter label="Minimum matches" value={String(query.min)} options={([20, 50, 100] as const).map((n) => ({ value: String(n), label: `${n}+`, href: leaderboardHref(query, { min: n }) }))} />
                <Filter label="Window" value={query.window} options={[{ value: '7d', label: '7 days', href: leaderboardHref(query, { window: '7d' }) }, { value: '30d', label: '30 days', href: leaderboardHref(query, { window: '30d' }) }]} />
                {data.rankLabels && <Filter label="Match rank" value={query.rank} options={rankBandOptions(data.rankLabels, data.ranks, (rank) => leaderboardHref(query, { rank }))} />}
              </div>
            </>
          )}
        </div>
        <HeroSelect
          heroes={data.heroes}
          value={query.hero}
          hrefFor={Object.fromEntries([['all', leaderboardHref(query, { hero: 'all' })], ...data.heroes.map((h) => [h.slug, leaderboardHref(query, { hero: h.slug })])])}
        />
      </div>

      <p role="status" className="text-caption text-text-muted">
        {data.note}
        {query.view === 'performance' && query.metric === 'winrate' && ' Top win rates over few matches are often luck; check each player’s sample and interval.'}
      </p>

      {data.rows.length === 0 ? (
        <EmptyState title="No players match" description="Try another scope, hero or filter." />
      ) : (
        <>
          {data.page === 1 && <Podium rows={data.rows} mode={mode} />}
          <BoardTable rows={data.rows} mode={mode} />
          <BoardCards rows={data.rows} mode={mode} />
        </>
      )}

      {data.pages > 1 && (
        <nav aria-label="Leaderboard pages" className="flex flex-wrap gap-2">
          {Array.from({ length: data.pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={leaderboardHref(query, { page: p })}
              aria-current={p === data.page ? 'page' : undefined}
              className={cx('inline-flex size-11 items-center justify-center rounded-sm border font-ui text-sm', p === data.page ? 'border-primary bg-primary/15 text-text' : 'border-border-control text-text-muted hover:text-text')}
            >
              {p}
            </Link>
          ))}
        </nav>
      )}
    </div>
  )
}
