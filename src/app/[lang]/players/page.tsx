import type { Metadata } from 'next'
import Link from 'next/link'
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

export const metadata: Metadata = {
  title: 'Players',
  description: 'Deadlock regional leaderboards and player search, with current ranks and public profiles.',
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function PlayersPage({ searchParams }: { searchParams: SearchParams }) {
  const query = parsePlayersQuery(await searchParams)
  return (
    <PageContainer className="flex flex-col gap-8">
      <SectionHeader as="h1" eyebrow="Players" title="Players" description="Find a player by Steam name or SteamID3. Profiles show public data only." />
      <nav aria-label="Player views" className="border-b border-border">
        <ul className="flex gap-1">
          <li>
            <Link href="/players" aria-current="page" className="relative flex h-12 items-center px-4 font-display text-[0.95rem] font-semibold tracking-[0.08em] text-text uppercase">
              Search
              <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-0.5 bg-primary" />
            </Link>
          </li>
          <li>
            <Link href="/leaderboard" className="flex h-12 items-center px-4 font-display text-[0.95rem] font-semibold tracking-[0.08em] text-text-muted uppercase hover:text-text">
              Leaderboard
            </Link>
          </li>
        </ul>
      </nav>
      <Suspense key={playersHref(query)} fallback={<LoadingState label="Loading players"><Skeleton className="h-96" /></LoadingState>}>
        <SearchView query={query} />
      </Suspense>
    </PageContainer>
  )
}

async function SearchView({ query }: { query: PlayersQuery }) {
  const dataLoad = await attempt('[players] search failed', getSearchView(query))
  const data = dataLoad.ok ? dataLoad.value : null
  const failed = dataLoad.ok ? 'unavailable' : dataLoad.kind
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-5 rounded-md border border-border bg-surface/60 p-(--spacing-card) lg:grid-cols-2">
        <form action="/players" method="get" role="search" className="flex flex-col gap-2">
          {query.rank !== 'all' && <input type="hidden" name="rank" value={query.rank} />}
          <label htmlFor="player-q" className="text-eyebrow">Name or SteamID3</label>
          <div className="flex gap-2">
            <input
              id="player-q"
              name="q"
              type="search"
              defaultValue={query.q}
              minLength={2}
              autoComplete="off"
              placeholder="At least 2 characters"
              className="h-11 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-sunken px-3 font-ui text-sm text-text placeholder:text-text-muted/80 hover:border-text-muted focus-visible:border-primary"
            />
            <Button type="submit" variant="secondary" leadingIcon={<SearchIcon size={18} />}>Search</Button>
          </div>
        </form>
        {data?.rankLabels && (
          <Filter
            label="Recent team average rank (at least)"
            value={query.rank}
            options={rankBandOptions(data.rankLabels, data.ranks, (rank) => playersHref(query, { rank }))}
          />
        )}
      </div>
      {!data ? (
        <DataNotice error={failed} what="Player search" />
      ) : query.q.length < 2 ? (
        <EmptyState title="Search for a player" description="Enter a Steam name or a SteamID3. Only players with recent matches are listed." />
      ) : data.results.length === 0 ? (
        <EmptyState title="No players found" description={`No public profiles match “${query.q}” with these filters.`} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.results.map((p) => (
            <li key={p.accountId}>
              <Link href={`/players/${p.accountId}`} className="elevate flex items-center gap-3 rounded-md border border-border bg-surface p-3">
                <Avatar name={p.name} src={p.avatar ?? undefined} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-ui text-sm font-semibold text-text">{p.name}</span>
                  <span className="block text-caption text-text-muted">
                    {p.matches30d !== null ? `${formatInteger(p.matches30d)} matches in 30 days` : 'Recent activity unknown'}
                    {p.teamRank && <> · recent teams avg. <RankBadge rank={p.teamRank} size="xs" /></>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-caption text-text-muted">“Recent team average” is the average rank of the player’s last match teams, not the player’s own rank. Open a profile for their current rank.</p>
    </div>
  )
}
