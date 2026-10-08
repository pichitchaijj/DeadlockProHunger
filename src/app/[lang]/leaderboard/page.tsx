import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { OG_LOCALE, type Locale } from '@/i18n/config'
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
import { dateFormat } from '@/lib/format'
import { HeroSelect } from '@/features/builds/components/HeroSelect'
import { BoardCards, BoardTable, Podium } from '@/features/leaderboard/components/Board'
import { getLeaderboardData } from '@/features/leaderboard/loaders'
import { boardNoteText } from '@/features/leaderboard/model'
import { leaderboardHref, parseLeaderboardQuery, type LeaderboardQuery } from '@/features/leaderboard/query'
import { capitalize } from '@/features/meta/model'
import { ROLES } from '@/features/meta/query'
import { DataNotice } from '@/components/data/DataState'
import { attempt } from '@/lib/deadlock/errors'
import { getScopeWording } from '@/components/data/scopeWording'

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations('leaderboard.meta'), getLocale()])
  return {
    title: t('title'),
    description: t('description'),
    openGraph: { title: t('title'), description: t('description'), locale: OG_LOCALE[locale], type: 'website' },
  }
}

/** Snapshot time in UTC. English keeps its original "08 Oct 2026 14:00" form. */
function savedTime(ms: number, locale: Locale): string {
  if (locale === 'en') return new Date(ms).toUTCString().slice(5, 22)
  return dateFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(ms)
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function LeaderboardPage({ searchParams }: { searchParams: SearchParams }) {
  const query = parseLeaderboardQuery(await searchParams)
  const t = await getTranslations('leaderboard')
  return (
    <PageContainer className="flex flex-col gap-6">
      <SectionHeader as="h1" eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      <nav aria-label={t('views')} className="border-b border-border">
        <ul className="flex gap-1">
          {(['ranked', 'performance'] as const).map((view) => (
            <li key={view}>
              <Link
                href={leaderboardHref(query, { view })}
                aria-current={query.view === view ? 'page' : undefined}
                className={cx('relative flex h-11 items-center px-4 font-display text-[0.95rem] font-semibold tracking-[0.08em] uppercase', query.view === view ? 'text-text' : 'text-text-muted hover:text-text')}
              >
                {view === 'ranked' ? t('ranked') : t('performance')}
                <span aria-hidden="true" className={cx('absolute inset-x-3 bottom-0 h-0.5 bg-primary', query.view === view ? 'opacity-100' : 'opacity-0')} />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Suspense key={leaderboardHref(query, { page: query.page })} fallback={<LoadingState label={t('loading')}><Skeleton className="h-[32rem]" /></LoadingState>}>
        <Board query={query} />
      </Suspense>
    </PageContainer>
  )
}

async function Board({ query }: { query: LeaderboardQuery }) {
  const [dataLoad, t, common, builds, locale] = await Promise.all([
    attempt('[leaderboard] load failed', getLeaderboardData(query)),
    getTranslations('leaderboard'),
    getTranslations('common'),
    getTranslations('builds.list'),
    getLocale(),
  ])
  const scopeWords = await getScopeWording()
  const data = dataLoad.ok ? dataLoad.value : null
  const failed = dataLoad.ok ? 'unavailable' : dataLoad.kind
  if (!data) return <DataNotice error={failed} what="Leaderboard" action={<ButtonLink href={leaderboardHref(query)} variant="secondary" size="sm">{common('tryAgain')}</ButtonLink>} />

  const mode = query.view === 'performance' ? ({ kind: 'performance', metric: query.metric } as const) : query.scope === 'global' ? ({ kind: 'global' } as const) : ({ kind: 'regional' } as const)
  const metrics = (Object.keys(SCOREBOARD_METRICS) as ScoreboardMetric[]).filter((m) => m !== 'rank')

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 rounded-md border border-border bg-surface/60 p-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {query.view === 'ranked' ? (
            <>
              <Filter
                label={t('filters.scope')}
                value={query.scope}
                options={[{ value: 'global', label: t('filters.global'), href: leaderboardHref(query, { scope: 'global' }) }, ...REGIONS.map(([value]) => ({ value, label: t(`filters.regions.${value}`), href: leaderboardHref(query, { scope: value }) }))]}
              />
              {query.scope !== 'global' && (
                <div className="grid gap-4 xl:grid-cols-2">
                  <Filter label={t('filters.role')} value={query.role} options={[{ value: 'all', label: t('filters.allRoles'), href: leaderboardHref(query, { role: 'all' }) }, ...ROLES.map((r) => ({ value: r, label: capitalize(r), href: leaderboardHref(query, { role: r }) }))]} />
                  {data.rankRefs && <Filter label={t('filters.currentRank')} value={query.rank} options={rankBandOptions(scopeWords.rankLabels(data.rankRefs), data.ranks, (rank) => leaderboardHref(query, { rank }))} />}
                </div>
              )}
            </>
          ) : (
            <>
              <Filter label={t('filters.metric')} value={query.metric} options={metrics.map((m) => ({ value: m, label: t(`metrics.${m}`), href: leaderboardHref(query, { metric: m }) }))} />
              <div className="grid gap-4 xl:grid-cols-3">
                <Filter label={t('filters.minMatches')} value={String(query.min)} options={([20, 50, 100] as const).map((n) => ({ value: String(n), label: t('filters.minOption', { count: n }), href: leaderboardHref(query, { min: n }) }))} />
                <Filter label={t('filters.window')} value={query.window} options={[{ value: '7d', label: t('filters.days', { count: 7 }), href: leaderboardHref(query, { window: '7d' }) }, { value: '30d', label: t('filters.days', { count: 30 }), href: leaderboardHref(query, { window: '30d' }) }]} />
                {data.rankRefs && <Filter label={t('filters.matchRank')} value={query.rank} options={rankBandOptions(scopeWords.rankLabels(data.rankRefs), data.ranks, (rank) => leaderboardHref(query, { rank }))} />}
              </div>
            </>
          )}
        </div>
        <HeroSelect
          heroes={data.heroes}
          value={query.hero}
          hrefFor={Object.fromEntries([['all', leaderboardHref(query, { hero: 'all' })], ...data.heroes.map((h) => [h.slug, leaderboardHref(query, { hero: h.slug })])])}
          label={builds('hero')}
          allLabel={builds('allHeroes')}
        />
      </div>

      <p role="status" className="text-caption text-text-muted">
        {boardNoteText(data.note, (key, values) => t(`notes.${key}` as 'notes.saved', values), (ms) => savedTime(ms, locale), query.view === 'performance' && query.metric === 'winrate', locale === 'ja' || locale === 'zh-CN' ? '' : ' ')}
      </p>

      {data.rows.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <>
          {data.page === 1 && <Podium rows={data.rows} mode={mode} />}
          <BoardTable rows={data.rows} mode={mode} />
          <BoardCards rows={data.rows} mode={mode} />
        </>
      )}

      {data.pages > 1 && (
        <nav aria-label={t('pages')} className="flex flex-wrap gap-2">
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
