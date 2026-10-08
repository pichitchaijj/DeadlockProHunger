import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { OG_LOCALE } from '@/i18n/config'
import { notFound } from 'next/navigation'
import { PageContainer } from '@/components/layout/PageContainer'
import { RankBadge } from '@/components/game-assets/RankBadge'
import { Avatar } from '@/components/ui/Avatar'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/States'
import { cx } from '@/lib/cx'
import { dateFormat, formatInteger } from '@/lib/format'
import { DATE, HeroPoolGrid, HistoryTable, Panel, PeerTable, RankHistory, RecentMatches, RecordStat, TrendBlocks } from '@/features/players/components/profile'
import { getPlayerProfile, PAGE_SIZE } from '@/features/players/loaders'
import { BLOCK_SIZE } from '@/features/players/model'
import { DataNotice } from '@/components/data/DataState'
import { classifyError } from '@/lib/deadlock/errors'

type Params = Promise<{ accountId: string }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** The account id is data; only the words around it are translated. Profiles stay out of search indexes. */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { accountId } = await params
  const [t, locale] = await Promise.all([getTranslations('players.meta'), getLocale()])
  const title = t('detailTitle', { id: accountId })
  const description = t('detailDescription', { id: accountId })
  return { title, description, robots: { index: false }, openGraph: { title, description, locale: OG_LOCALE[locale], type: 'website' } }
}

const SECTIONS = ['recent', 'trend', 'heroes', 'teammates', 'enemies', 'history'] as const
const RECENT = 10

export default async function PlayerPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { accountId: raw } = await params
  if (!/^\d{1,10}$/.test(raw)) notFound()
  const accountId = Number(raw)
  const pageParam = Number((await searchParams).page)
  const [t, common, winRate, ranked, locale] = await Promise.all([
    getTranslations('players'),
    getTranslations('common'),
    getTranslations('cards').then((c) => c('winRate')),
    getTranslations('matches.common').then((m) => m('ranked')),
    getLocale(),
  ])
  // Public Steam name (data) when there is one; otherwise the localized fallback around the same id.
  const fallback = t('fallbackName', { id: accountId })

  let data: Awaited<ReturnType<typeof getPlayerProfile>>
  try {
    data = await getPlayerProfile(accountId)
  } catch (error) {
    console.error('[player] load failed', error)
    return (
      <PageContainer>
        <h1 className="sr-only">{fallback}</h1>
        <DataNotice error={classifyError(error)} what="Player profile" action={<ButtonLink href={`/players/${accountId}`} variant="secondary" size="sm">{common('tryAgain')}</ButtonLink>} />
      </PageContainer>
    )
  }
  if (!data) {
    return (
      <PageContainer>
        <h1 className="sr-only">{fallback}</h1>
        <EmptyState
          title={t('profile.notFoundTitle')}
          description={t('profile.notFoundDescription')}
          action={<ButtonLink href="/players?tab=search" variant="secondary" size="sm">{t('profile.searchPlayers')}</ButtonLink>}
        />
      </PageContainer>
    )
  }

  const h = data.history
  const pages = Math.max(1, Math.ceil(h.matches.length / PAGE_SIZE))
  const page = Number.isInteger(pageParam) && pageParam >= 1 ? Math.min(pageParam, pages) : 1
  const name = data.name ?? fallback
  const day = dateFormat(locale, DATE)
  const counted = formatInteger(h.counted, locale)
  const summary = t('profile.summary', {
    basis: h.firstAt ? t('profile.basisSince', { counted, date: day.format(h.firstAt) }) : t('profile.basis', { counted }),
    excluded: h.excluded > 0 ? t('profile.excluded', { count: h.excluded }) : '',
  })

  return (
    <PageContainer className="flex flex-col gap-12">
      {/* Identity */}
      <section aria-labelledby="player-name" className="flex animate-awaken flex-col gap-5">
        <p className="text-eyebrow"><Link href="/players" className="hover:text-text pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center">{t('list.title')}</Link> <span aria-hidden="true">/</span> {name}</p>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={name} src={data.avatar ?? undefined} size="lg" />
          <div className="flex min-w-0 flex-col gap-1">
            <h1 id="player-name" className="font-display text-display-l font-extrabold break-words text-text uppercase">{name}</h1>
            {data.rank ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted">
                <RankBadge rank={data.rank} variant="full" />
                {data.rank.at && <span>{t('profile.afterLatest', { date: day.format(data.rank.at) })}</span>}
              </div>
            ) : (
              <p className="text-sm text-text-muted">{data.placements ? t('profile.placements', { count: data.placements }) : t('profile.noRank')}</p>
            )}
            <p className="text-caption text-text-muted">
              {t('profile.steamId', { id: accountId })}
              {data.profileUrl && (
                <>
                  {' · '}
                  <a href={data.profileUrl} rel="noopener noreferrer" className="underline decoration-steel hover:decoration-primary">{t('profile.steamProfile')}</a>
                </>
              )}
            </p>
          </div>
        </div>
        <dl className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3 lg:max-w-4xl">
          <RecordStat label={winRate} r={h.overall} note={t('profile.normalMode')} />
          <RecordStat label={t('profile.lastN', { count: BLOCK_SIZE })} r={h.recent} />
          <RecordStat label={ranked} r={h.ranked} />
        </dl>
        <p className="text-caption text-text-muted">{summary}</p>
      </section>

      <nav aria-label={t('profile.sectionsNav')} className="-my-6 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]">
        {SECTIONS.map((id) => (
          <a key={id} href={`#${id}`} className="flex h-11 shrink-0 items-center px-3 font-display text-sm font-semibold tracking-[0.08em] text-text-muted uppercase hover:text-text">{t(`profile.sections.${id}`)}</a>
        ))}
      </nav>

      <Panel id="recent" title={t('profile.recentTitle')} description={t('profile.recentDescription', { count: RECENT })}>
        {h.matches.length ? <RecentMatches matches={h.matches.slice(0, RECENT)} /> : <EmptyState title={t('profile.noStored')} />}
      </Panel>

      <Panel id="trend" title={t('profile.trendTitle')} description={t('profile.trendDescription')}>
        <div className="grid gap-6 xl:grid-cols-2">
          <TrendBlocks blocks={h.trend} change={h.trendChange} />
          <RankHistory points={h.rankPoints} tierNames={data.tierNames} />
        </div>
      </Panel>

      <Panel id="heroes" title={t('profile.poolTitle')} description={t('profile.poolDescription')}>
        <HeroPoolGrid pool={data.pool} />
      </Panel>

      <div className="grid gap-8 xl:grid-cols-2">
        <Panel id="teammates" title={t('profile.matesTitle')} description={t('profile.matesDescription')}>
          <PeerTable peers={data.mates} label={t('profile.matesTitle')} empty={t('profile.matesEmpty')} />
        </Panel>
        <Panel id="enemies" title={t('profile.enemiesTitle')} description={t('profile.enemiesDescription')}>
          <PeerTable peers={data.enemies} label={t('profile.enemiesTitle')} empty={t('profile.enemiesEmpty')} />
        </Panel>
      </div>

      <Panel id="history" title={t('profile.historyTitle')} description={t('profile.historyDescription', { count: formatInteger(h.matches.length, locale) })}>
        <HistoryTable matches={h.matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)} ranks={data.ranks} />
        {pages > 1 && (
          <nav aria-label={t('profile.historyPages')} className="flex flex-wrap gap-2">
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
