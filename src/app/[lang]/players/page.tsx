import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { OG_LOCALE } from '@/i18n/config'
import { pageAlternates } from '@/i18n/seo'
import { localePath } from '@/i18n/server'
import { Suspense } from 'react'
import { PageContainer } from '@/components/layout/PageContainer'
import { RankBadge } from '@/components/game-assets/RankBadge'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Filter } from '@/components/ui/Filter'
import { SearchIcon } from '@/components/ui/icons'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, LoadingState } from '@/components/ui/States'
import { rankBandOptions } from '@/features/meta/rankFilter'
import { formatInteger } from '@/lib/format'
import { getSearchView } from '@/features/players/loaders'
import { parsePlayersQuery, playersHref, type PlayersQuery } from '@/features/players/query'
import { DataNotice } from '@/components/data/DataState'
import { attempt } from '@/lib/deadlock/errors'
import { getScopeWording } from '@/components/data/scopeWording'

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations('players.meta'), getLocale()])
  return {
    title: t('listTitle'),
    description: t('listDescription'),
    alternates: pageAlternates('/players', locale),
    openGraph: { title: t('listTitle'), description: t('listDescription'), locale: OG_LOCALE[locale], type: 'website' },
  }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function PlayersPage({ searchParams }: { searchParams: SearchParams }) {
  const query = parsePlayersQuery(await searchParams)
  const [t, nav] = await Promise.all([getTranslations('players.list'), getTranslations('nav.links.leaderboard')])
  return (
    <PageContainer className="flex flex-col gap-8">
      <SectionHeader as="h1" eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      <nav aria-label={t('views')} className="border-b border-border">
        <ul className="flex gap-1">
          <li>
            <Link href="/players" aria-current="page" className="relative flex h-12 items-center px-4 font-display text-[0.95rem] font-semibold tracking-[0.08em] text-text uppercase">
              {t('search')}
              <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-0.5 bg-primary" />
            </Link>
          </li>
          <li>
            <Link href="/leaderboard" className="flex h-12 items-center px-4 font-display text-[0.95rem] font-semibold tracking-[0.08em] text-text-muted uppercase hover:text-text">
              {nav('label')}
            </Link>
          </li>
        </ul>
      </nav>
      <Suspense key={playersHref(query)} fallback={<LoadingState label={t('loading')}><Skeleton className="h-96" /></LoadingState>}>
        <SearchView query={query} />
      </Suspense>
    </PageContainer>
  )
}

async function SearchView({ query }: { query: PlayersQuery }) {
  const [dataLoad, t, locale, scopeWords] = await Promise.all([attempt('[players] search failed', getSearchView(query)), getTranslations('players.list'), getLocale(), getScopeWording()])
  const data = dataLoad.ok ? dataLoad.value : null
  const failed = dataLoad.ok ? 'unavailable' : dataLoad.kind
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-5 rounded-md border border-border bg-surface/60 p-(--spacing-card) lg:grid-cols-2">
        <form action={await localePath('/players')} method="get" role="search" className="flex flex-col gap-2">
          {query.rank !== 'all' && <input type="hidden" name="rank" value={query.rank} />}
          <label htmlFor="player-q" className="text-eyebrow">{t('query')}</label>
          <div className="flex gap-2">
            <input
              id="player-q"
              name="q"
              type="search"
              defaultValue={query.q}
              minLength={2}
              autoComplete="off"
              placeholder={t('placeholder')}
              className="h-11 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-sunken px-3 font-ui text-sm text-text placeholder:text-text-muted/80 hover:border-text-muted focus-visible:border-primary"
            />
            <Button type="submit" variant="secondary" leadingIcon={<SearchIcon size={18} />}>{t('search')}</Button>
          </div>
        </form>
        {data?.rankRefs && (
          <Filter label={t('rankFilter')} value={query.rank} options={rankBandOptions(scopeWords.rankLabels(data.rankRefs), data.ranks, (rank) => playersHref(query, { rank }))} />
        )}
      </div>
      {!data ? (
        <DataNotice error={failed} what="Player search" />
      ) : query.q.length < 2 ? (
        <EmptyState title={t('promptTitle')} description={t('promptDescription')} />
      ) : data.results.length === 0 ? (
        <EmptyState title={t('noResultsTitle')} description={t('noResultsDescription', { query: query.q })} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.results.map((p) => (
            <li key={p.accountId}>
              <Link href={`/players/${p.accountId}`} className="elevate flex items-center gap-3 rounded-md border border-border bg-surface p-3">
                <Avatar name={p.name} src={p.avatar ?? undefined} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-ui text-sm font-semibold text-text">{p.name}</span>
                  <span className="block text-caption text-text-muted">
                    {p.matches30d !== null ? t('matches30d', { count: formatInteger(p.matches30d, locale) }) : t('activityUnknown')}
                    {p.teamRank && <> · {t('teamAverage')} <RankBadge rank={p.teamRank} size="xs" /></>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-caption text-text-muted">{t('teamAverageNote')}</p>
    </div>
  )
}
