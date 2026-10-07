import type { Metadata } from 'next'
import { Link } from '@/i18n/navigation'
import { localePath } from '@/i18n/server'
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

export const metadata: Metadata = {
  title: 'Matches',
  description: 'Recent Deadlock matches by hero, player, result, length, date and rank, plus what’s live in the watch tab.',
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function MatchesPage({ searchParams }: { searchParams: SearchParams }) {
  const query = parseMatchesQuery(await searchParams)
  const [heroes, scope, live] = await Promise.all([
    getActiveHeroes()
      .then((list) => list.map((h) => ({ slug: slugify(h.name), name: h.name })).sort((a, b) => a.name.localeCompare(b.name)))
      .catch(() => []),
    resolveScope({ window: '7d', rank: query.rank, mode: 'all' }).catch(() => null),
    getLiveSummary(),
  ])
  const perspective = hasPerspective(query)

  return (
    <PageContainer className="flex flex-col gap-8">
      <SectionHeader as="h1" eyebrow="Matches" title="Matches" description="Recent normal-mode matches processed by the data source. Filter to a hero or player to see results from their side." />

      {live && live.total > 0 && <LiveStrip live={live} />}

      <section aria-label="Match filters" className="flex flex-col gap-5 rounded-md border border-border bg-surface/60 p-(--spacing-card)">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-[16rem_1fr]">
          <HeroSelect
            heroes={heroes}
            value={query.hero}
            hrefFor={Object.fromEntries([['all', matchesHref(query, { hero: 'all' })], ...heroes.map((h) => [h.slug, matchesHref(query, { hero: h.slug })])])}
          />
          <form action={await localePath('/matches')} method="get" role="search" className="flex flex-col gap-2">
            {(Object.keys(query) as Array<keyof MatchesQuery>)
              .filter((k) => k !== 'player' && query[k] !== 'all' && query[k] !== 'any' && !(k === 'date' && query[k] === '24h'))
              .map((k) => (
                <input key={k} type="hidden" name={k} value={String(query[k])} />
              ))}
            <label htmlFor="player-filter" className="text-eyebrow">Player (name or SteamID3)</label>
            <div className="flex gap-2">
              <input
                id="player-filter"
                name="player"
                type="search"
                defaultValue={query.player}
                placeholder="e.g. 338104565"
                autoComplete="off"
                className="h-11 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-sunken px-3 font-ui text-sm text-text placeholder:text-text-muted/80 hover:border-text-muted focus-visible:border-primary"
              />
              <Button type="submit" variant="secondary" leadingIcon={<SearchIcon size={18} />}>Apply</Button>
            </div>
          </form>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Filter label="Date" value={query.date} options={(Object.keys(DATES) as Array<keyof typeof DATES>).map((d) => ({ value: d, label: DATES[d], href: matchesHref(query, { date: d }) }))} />
          <Filter
            label="Length"
            value={query.duration}
            options={[{ value: 'any', label: 'Any', href: matchesHref(query, { duration: 'any' }) }, ...(Object.keys(DURATIONS) as Array<keyof typeof DURATIONS>).map((d) => ({ value: d, label: DURATIONS[d].label, href: matchesHref(query, { duration: d }) }))]}
          />
          {scope && (
            <Filter label="Rank (match average)" value={query.rank} options={rankBandOptions(scope.rankLabels, scope.ranks, (rank) => matchesHref(query, { rank }))} />
          )}
          {perspective ? (
            <Filter
              label="Result (for the selected hero or player)"
              value={query.result}
              options={[
                { value: 'any', label: 'Any', href: matchesHref(query, { result: 'any' }) },
                { value: 'win', label: 'Wins', href: matchesHref(query, { result: 'win' }) },
                { value: 'loss', label: 'Losses', href: matchesHref(query, { result: 'loss' }) },
              ]}
            />
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-eyebrow">Result</span>
              <p className="text-sm text-text-muted">Pick a hero or player first: a result needs a side.</p>
            </div>
          )}
        </div>
        {matchesHref(query) !== '/matches' && (
          <Link href="/matches" className="inline-flex min-h-11 items-center self-start font-ui text-sm font-semibold text-primary hover:text-highlight">Clear filters</Link>
        )}
      </section>

      <section aria-labelledby="results-title" className="flex flex-col gap-4">
        <h2 id="results-title" className="sr-only">Results</h2>
        <Suspense key={matchesHref(query)} fallback={<ResultsSkeleton />}>
          <Results query={query} />
        </Suspense>
      </section>
    </PageContainer>
  )
}

async function Results({ query }: { query: MatchesQuery }) {
  const dataLoad = await attempt('[matches] list failed', getMatchesPage(query))
  const data = dataLoad.ok ? dataLoad.value : null
  const failed = dataLoad.ok ? 'unavailable' : dataLoad.kind
  if (!data) {
    return <DataNotice error={failed} what="Matches" action={<ButtonLink href={matchesHref(query)} variant="secondary" size="sm">Try again</ButtonLink>} />
  }

  return (
    <div className="flex animate-awaken flex-col gap-4">
      {data.candidates && (
        <div className="rounded-md border border-border bg-surface p-4">
          <p className="text-sm text-text">
            {data.candidates.length === 0 ? `No players found for “${query.player}”.` : `Players matching “${query.player}”. Choose one to filter the list:`}
          </p>
          {data.candidates.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {data.candidates.map((c) => (
                <li key={c.accountId}>
                  <Link
                    href={matchesHref(query, { player: String(c.accountId) })}
                    className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-border-control px-3.5 font-ui text-sm text-text hover:border-primary"
                  >
                    {c.name}
                    {c.matches30d !== null && <span className="text-caption text-text-muted">{formatInteger(c.matches30d)} matches/30d</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p role="status" className="text-sm text-text-muted">
        {data.rows.length === 0 ? 'No matches' : `${data.rows.length} ${data.rows.length === 1 ? 'match' : 'matches'}`}
        {query.result !== 'any' && ` (${query.result === 'win' ? 'wins' : 'losses'} among the ${data.fetched} most recent)`}
        {' · '}
        {data.heroFilter ? `${data.heroFilter.name} · ` : ''}
        {data.player ? `${data.player.name ?? `Player ${data.player.accountId}`} · ` : ''}
        since {formatRelativeTime(data.dateFrom)} · {data.rankLabel} · newest {MATCH_LIMIT} at most
      </p>

      {data.rows.length === 0 ? (
        <EmptyState
          title="No matches found"
          description="Nothing processed yet for these filters. Widen the date range, rank band or length, or clear the result filter."
          action={<ButtonLink href={matchesHref(query, { date: '7d', duration: 'any', result: 'any' })} variant="secondary" size="sm">Widen to 7 days</ButtonLink>}
        />
      ) : (
        <MatchesExplorer rows={data.rows} now={data.now} />
      )}
    </div>
  )
}

function ResultsSkeleton() {
  return (
    <LoadingState label="Loading matches">
      <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
        <Skeleton className="h-[28rem]" />
        <Skeleton className="hidden h-[28rem] lg:block" />
      </div>
    </LoadingState>
  )
}
