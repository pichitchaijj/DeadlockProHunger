import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { OG_LOCALE } from '@/i18n/config'
import { localePath } from '@/i18n/server'
import { WithClientMessages } from '@/i18n/WithClientMessages'
import { Suspense } from 'react'
import { PageContainer } from '@/components/layout/PageContainer'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Filter } from '@/components/ui/Filter'
import { SearchIcon } from '@/components/ui/icons'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, LoadingState } from '@/components/ui/States'
import { formatInteger, formatRelativeTime } from '@/lib/format'
import { getActiveHeroes } from '@/lib/deadlock/endpoints'
import { HeroSelect } from '@/features/builds/components/HeroSelect'
import { LiveStrip } from '@/features/matches/components/LiveStrip'
import { MatchesExplorer } from '@/features/matches/components/MatchesExplorer'
import { getLiveSummary, getMatchesPage, MATCH_LIMIT } from '@/features/matches/loaders'
import { DATES, DURATIONS, hasPerspective, matchesHref, parseMatchesQuery, type MatchesQuery } from '@/features/matches/query'
import { slugify } from '@/features/meta/model'
import { rankBandOptions } from '@/features/meta/rankFilter'
import { resolveScope } from '@/features/meta/scope'
import { DataNotice } from '@/components/data/DataState'
import { attempt } from '@/lib/deadlock/errors'

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations('matches.meta'), getLocale()])
  return {
    title: t('listTitle'),
    description: t('listDescription'),
    openGraph: { title: t('listTitle'), description: t('listDescription'), locale: OG_LOCALE[locale], type: 'website' },
  }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** The explorer (table, preview, cards) renders in the browser: only its messages are sent, on this page only. */
const EXPLORER_MESSAGES = ['matches.common', 'matches.explorer'] as const

export default async function MatchesPage({ searchParams }: { searchParams: SearchParams }) {
  const query = parseMatchesQuery(await searchParams)
  const [heroes, scope, live, t, builds] = await Promise.all([
    getActiveHeroes()
      .then((list) => list.map((h) => ({ slug: slugify(h.name), name: h.name })).sort((a, b) => a.name.localeCompare(b.name)))
      .catch(() => []),
    resolveScope({ window: '7d', rank: query.rank, mode: 'all' }).catch(() => null),
    getLiveSummary(),
    getTranslations('matches.list'),
    getTranslations('builds.list'),
  ])
  const perspective = hasPerspective(query)

  return (
    <PageContainer className="flex flex-col gap-8">
      <SectionHeader as="h1" eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />

      {live && live.total > 0 && <LiveStrip live={live} />}

      <section aria-label={t('filters')} className="flex flex-col gap-5 rounded-md border border-border bg-surface/60 p-(--spacing-card)">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-[16rem_1fr]">
          <HeroSelect
            heroes={heroes}
            value={query.hero}
            hrefFor={Object.fromEntries([['all', matchesHref(query, { hero: 'all' })], ...heroes.map((h) => [h.slug, matchesHref(query, { hero: h.slug })])])}
            label={builds('hero')}
            allLabel={builds('allHeroes')}
          />
          <form action={await localePath('/matches')} method="get" role="search" className="flex flex-col gap-2">
            {(Object.keys(query) as Array<keyof MatchesQuery>)
              .filter((k) => k !== 'player' && query[k] !== 'all' && query[k] !== 'any' && !(k === 'date' && query[k] === '24h'))
              .map((k) => (
                <input key={k} type="hidden" name={k} value={String(query[k])} />
              ))}
            <label htmlFor="player-filter" className="text-eyebrow">{t('player')}</label>
            <div className="flex gap-2">
              <input
                id="player-filter"
                name="player"
                type="search"
                defaultValue={query.player}
                placeholder={t('playerPlaceholder')}
                autoComplete="off"
                className="h-11 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-sunken px-3 font-ui text-sm text-text placeholder:text-text-muted/80 hover:border-text-muted focus-visible:border-primary"
              />
              <Button type="submit" variant="secondary" leadingIcon={<SearchIcon size={18} />}>{t('apply')}</Button>
            </div>
          </form>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Filter label={t('date')} value={query.date} options={(Object.keys(DATES) as Array<keyof typeof DATES>).map((d) => ({ value: d, label: t(`dates.${d}`), href: matchesHref(query, { date: d }) }))} />
          <Filter
            label={t('length')}
            value={query.duration}
            options={[{ value: 'any', label: t('any'), href: matchesHref(query, { duration: 'any' }) }, ...(Object.keys(DURATIONS) as Array<keyof typeof DURATIONS>).map((d) => ({ value: d, label: t(`durations.${d}`), href: matchesHref(query, { duration: d }) }))]}
          />
          {scope && (
            <Filter label={builds('rank')} value={query.rank} options={rankBandOptions(scope.rankLabels, scope.ranks, (rank) => matchesHref(query, { rank }))} />
          )}
          {perspective ? (
            <Filter
              label={t('result')}
              value={query.result}
              options={[
                { value: 'any', label: t('any'), href: matchesHref(query, { result: 'any' }) },
                { value: 'win', label: t('wins'), href: matchesHref(query, { result: 'win' }) },
                { value: 'loss', label: t('losses'), href: matchesHref(query, { result: 'loss' }) },
              ]}
            />
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-eyebrow">{t('resultShort')}</span>
              <p className="text-sm text-text-muted">{t('resultHint')}</p>
            </div>
          )}
        </div>
        {matchesHref(query) !== '/matches' && (
          <Link href="/matches" className="inline-flex min-h-11 items-center self-start font-ui text-sm font-semibold text-primary hover:text-highlight">{t('clearFilters')}</Link>
        )}
      </section>

      <section aria-labelledby="results-title" className="flex flex-col gap-4">
        <h2 id="results-title" className="sr-only">{t('results')}</h2>
        <Suspense key={matchesHref(query)} fallback={<ResultsSkeleton label={t('loading')} />}>
          <Results query={query} />
        </Suspense>
      </section>
    </PageContainer>
  )
}

async function Results({ query }: { query: MatchesQuery }) {
  const [dataLoad, t, common, locale] = await Promise.all([attempt('[matches] list failed', getMatchesPage(query)), getTranslations('matches'), getTranslations('common'), getLocale()])
  const data = dataLoad.ok ? dataLoad.value : null
  const failed = dataLoad.ok ? 'unavailable' : dataLoad.kind
  if (!data) {
    return <DataNotice error={failed} what="Matches" action={<ButtonLink href={matchesHref(query)} variant="secondary" size="sm">{common('tryAgain')}</ButtonLink>} />
  }

  return (
    <div className="flex animate-awaken flex-col gap-4">
      {data.candidates && (
        <div className="rounded-md border border-border bg-surface p-4">
          <p className="text-sm text-text">{data.candidates.length === 0 ? t('list.noPlayers', { query: query.player }) : t('list.choosePlayer', { query: query.player })}</p>
          {data.candidates.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {data.candidates.map((c) => (
                <li key={c.accountId}>
                  <Link
                    href={matchesHref(query, { player: String(c.accountId) })}
                    className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-border-control px-3.5 font-ui text-sm text-text hover:border-primary"
                  >
                    {c.name}
                    {c.matches30d !== null && <span className="text-caption text-text-muted">{t('list.matches30d', { count: formatInteger(c.matches30d, locale) })}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p role="status" className="text-sm text-text-muted">
        {t('list.count', { count: data.rows.length })}
        {query.result !== 'any' && ` ${t('list.resultFilter', { result: query.result, fetched: data.fetched })}`}
        {' · '}
        {data.heroFilter ? `${data.heroFilter.name} · ` : ''}
        {data.player ? `${data.player.name ?? t('common.player', { id: data.player.accountId })} · ` : ''}
        {t('list.since', { time: formatRelativeTime(data.dateFrom, undefined, locale), rank: data.rankLabel, limit: MATCH_LIMIT })}
      </p>

      {data.rows.length === 0 ? (
        <EmptyState
          title={t('list.emptyTitle')}
          description={t('list.emptyDescription')}
          action={<ButtonLink href={matchesHref(query, { date: '7d', duration: 'any', result: 'any' })} variant="secondary" size="sm">{t('list.widen')}</ButtonLink>}
        />
      ) : (
        <WithClientMessages paths={EXPLORER_MESSAGES}>
          <MatchesExplorer rows={data.rows} now={data.now} />
        </WithClientMessages>
      )}
    </div>
  )
}

function ResultsSkeleton({ label }: { label: string }) {
  return (
    <LoadingState label={label}>
      <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
        <Skeleton className="h-[28rem]" />
        <Skeleton className="hidden h-[28rem] lg:block" />
      </div>
    </LoadingState>
  )
}
