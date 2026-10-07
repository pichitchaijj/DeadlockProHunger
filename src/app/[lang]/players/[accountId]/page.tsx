import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageContainer } from '@/components/layout/PageContainer'
import { RankBadge } from '@/components/game-assets/RankBadge'
import { Avatar } from '@/components/ui/Avatar'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/States'
import { cx } from '@/lib/cx'
import { formatInteger } from '@/lib/format'
import { HeroPoolGrid, HistoryTable, Panel, PeerTable, RankHistory, RecentMatches, RecordStat, TrendBlocks } from '@/features/players/components/profile'
import { getPlayerProfile, PAGE_SIZE } from '@/features/players/loaders'
import { BLOCK_SIZE } from '@/features/players/model'
import { DataNotice } from '@/components/data/DataState'
import { classifyError } from '@/lib/deadlock/errors'

type Params = Promise<{ accountId: string }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { accountId } = await params
  return { title: `Player ${accountId}`, robots: { index: false } }
}

const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export default async function PlayerPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { accountId: raw } = await params
  if (!/^\d{1,10}$/.test(raw)) notFound()
  const accountId = Number(raw)
  const pageParam = Number((await searchParams).page)

  let data: Awaited<ReturnType<typeof getPlayerProfile>>
  try {
    data = await getPlayerProfile(accountId)
  } catch (error) {
    console.error('[player] load failed', error)
    return (
      <PageContainer>
        <h1 className="sr-only">Player {accountId}</h1>
        <DataNotice error={classifyError(error)} what="Player profile" action={<ButtonLink href={`/players/${accountId}`} variant="secondary" size="sm">Try again</ButtonLink>} />
      </PageContainer>
    )
  }
  if (!data) {
    return (
      <PageContainer>
        <h1 className="sr-only">Player {accountId}</h1>
        <EmptyState title="Player not found" description="No public profile or stored matches for this account. Private or protected accounts aren’t shown." action={<ButtonLink href="/players?tab=search" variant="secondary" size="sm">Search players</ButtonLink>} />
      </PageContainer>
    )
  }

  const h = data.history
  const pages = Math.max(1, Math.ceil(h.matches.length / PAGE_SIZE))
  const page = Number.isInteger(pageParam) && pageParam >= 1 ? Math.min(pageParam, pages) : 1
  const name = data.name ?? `Player ${accountId}`

  return (
    <PageContainer className="flex flex-col gap-12">
      {/* Identity */}
      <section aria-labelledby="player-name" className="flex animate-awaken flex-col gap-5">
        <p className="text-eyebrow"><Link href="/players" className="hover:text-text pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center">Players</Link> <span aria-hidden="true">/</span> {name}</p>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={name} src={data.avatar ?? undefined} size="lg" />
          <div className="flex min-w-0 flex-col gap-1">
            <h1 id="player-name" className="font-display text-display-l font-extrabold break-words text-text uppercase">{name}</h1>
            {data.rank ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted">
                <RankBadge rank={data.rank} variant="full" />
                {data.rank.at && <span>after their latest ranked match ({DATE.format(data.rank.at)})</span>}
              </div>
            ) : (
              <p className="text-sm text-text-muted">{data.placements ? `In placement matches (${data.placements} left)` : 'No current rank reported'}</p>
            )}
            <p className="text-caption text-text-muted">
              SteamID3 {accountId}
              {data.profileUrl && (
                <>
                  {' · '}
                  <a href={data.profileUrl} rel="noopener noreferrer" className="underline decoration-steel hover:decoration-primary">Public Steam profile</a>
                </>
              )}
            </p>
          </div>
        </div>
        <dl className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3 lg:max-w-4xl">
          <RecordStat label="Win rate" r={h.overall} note="normal mode" />
          <RecordStat label={`Last ${BLOCK_SIZE}`} r={h.recent} />
          <RecordStat label="Ranked" r={h.ranked} />
        </dl>
        <p className="text-caption text-text-muted">
          Based on {formatInteger(h.counted)} normal-mode matches stored by the data source{h.firstAt ? ` since ${DATE.format(h.firstAt)}` : ''}
          {h.excluded > 0 && `; ${h.excluded} ${h.excluded === 1 ? 'match' : 'matches'} with a penalized or not-scored outcome ${h.excluded === 1 ? 'isn’t' : 'aren’t'} counted in win rates`}. History may be incomplete. These are results, not a skill rating.
        </p>
      </section>

      <nav aria-label="Profile sections" className="-my-6 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]">
        {[['recent', 'Recent'], ['trend', 'Trend'], ['heroes', 'Hero pool'], ['teammates', 'Teammates'], ['enemies', 'Opponents'], ['history', 'History']].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="flex h-11 shrink-0 items-center px-3 font-display text-sm font-semibold tracking-[0.08em] text-text-muted uppercase hover:text-text">{label}</a>
        ))}
      </nav>

      <Panel id="recent" title="Recent matches" description="The 10 most recent stored normal-mode matches.">
        {h.matches.length ? <RecentMatches matches={h.matches.slice(0, 10)} /> : <EmptyState title="No stored matches" />}
      </Panel>

      <Panel id="trend" title="Performance trend" description="Win rate over time, plus rank after each ranked match where Valve reported one.">
        <div className="grid gap-6 xl:grid-cols-2">
          <TrendBlocks blocks={h.trend} change={h.trendChange} />
          <RankHistory points={h.rankPoints} tierNames={data.tierNames} />
        </div>
      </Panel>

      <Panel id="heroes" title="Hero pool" description="Most-played heroes (all stored normal-mode matches). Small samples are muted.">
        <HeroPoolGrid pool={data.pool} />
      </Panel>

      <div className="grid gap-8 xl:grid-cols-2">
        <Panel id="teammates" title="Teammates" description="Players most often on the same team (10+ shared matches). Win rate = this player’s results together.">
          <PeerTable peers={data.mates} label="Teammates" empty="No teammate with 10+ shared matches." />
        </Panel>
        <Panel id="enemies" title="Opponents" description="Players most often faced (5+ matches). Win rate = this player’s results against them.">
          <PeerTable peers={data.enemies} label="Opponents" empty="No opponent faced 5+ times." />
        </Panel>
      </div>

      <Panel id="history" title="Match history" description={`${formatInteger(h.matches.length)} matches, newest first.`}>
        <HistoryTable matches={h.matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)} ranks={data.ranks} />
        {pages > 1 && (
          <nav aria-label="History pages" className="flex flex-wrap gap-2">
            {Array.from({ length: pages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 2)
              .map((p) => (
                <Link
                  key={p}
                  href={`/players/${accountId}?page=${p}#history`}
                  aria-current={p === page ? 'page' : undefined}
                  className={cx('inline-flex h-11 min-w-11 items-center justify-center rounded-sm border px-2 font-ui text-sm', p === page ? 'border-primary bg-primary/15 text-text' : 'border-border-control text-text-muted hover:text-text')}
                >
                  {p}
                </Link>
              ))}
          </nav>
        )}
      </Panel>
    </PageContainer>
  )
}
