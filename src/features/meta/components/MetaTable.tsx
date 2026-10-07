import Link from 'next/link'
import { WinRate } from '@/components/cards/WinRate'
import { ConfidenceBadge } from '@/components/data/ConfidenceBadge'
import { TierBadge } from '@/components/data/TierBadge'
import { TrendBadge } from '@/components/data/TrendBadge'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { Table, type SortDirection, type TableColumn } from '@/components/ui/Table'
import { cx } from '@/lib/cx'
import { formatInteger, formatPercent } from '@/lib/format'
import { capitalize, type MetaHero } from '../model'
import { metaHref, type MetaQuery, type MetaSort } from '../query'
import { WhyButton } from './WhyPanel'

type MetaTableProps = { rows: MetaHero[]; query: MetaQuery }

const TREND_COMPARISON = 'last 7 days vs the 7 before'

/** Hero table (desktop) + card list (mobile). Rows never animate; hover highlights only. */
export function MetaTable({ rows, query }: MetaTableProps) {
  const sortHref = (sort: MetaSort) => (dir: SortDirection) => metaHref(query, { sort, dir }, 'heroes-table')

  const columns: TableColumn<MetaHero>[] = [
    { key: 'hero', header: 'Hero', cell: (h) => <HeroCell hero={h} /> },
    { key: 'tier', header: 'Tier', sortHref: sortHref('tier'), cell: (h) => <TierBadge tier={h.tier} /> },
    {
      key: 'winRate',
      header: 'Win rate',
      numeric: true,
      sortHref: sortHref('winRate'),
      cell: (h) => <WinRate value={h.winRate} muted={h.sample === 'low'} className="items-end" />,
    },
    { key: 'pickRate', header: 'Pick rate', numeric: true, sortHref: sortHref('pickRate'), cell: (h) => formatPercent(h.pickRate) },
    { key: 'matches', header: 'Matches', numeric: true, sortHref: sortHref('matches'), cell: (h) => formatInteger(h.matches) },
    { key: 'trend', header: 'Trend', cell: (h) => <TrendCell hero={h} /> },
    { key: 'confidence', header: 'Confidence', align: 'end', cell: (h) => <ConfidenceBadge sampleSize={h.matches} interval={h.interval} /> },
    { key: 'why', header: 'Details', align: 'end', cell: (h) => <WhyButton slug={h.slug} name={h.name} /> },
  ]

  return (
    <>
      <Table
        caption="Heroes by tier, win rate, pick rate and trend"
        captionHidden
        columns={columns}
        rows={rows}
        rowKey={(h) => h.slug}
        sort={{ key: query.sort, direction: query.dir }}
        mobile="none"
      />
      <MobileCards rows={rows} query={query} />
    </>
  )
}

function HeroCell({ hero }: { hero: MetaHero }) {
  return (
    <Link href={`/heroes/${hero.slug}`} className={cx('group flex items-center gap-3 pointer-coarse:min-h-11', hero.sample === 'low' && 'opacity-70')}>
      <HeroPortrait name={hero.name} src={hero.iconUrl ?? undefined} size="sm" />
      <span>
        <span className="block font-semibold text-text group-hover:text-highlight">{hero.name}</span>
        {hero.role && <span className="block text-caption text-text-muted">{capitalize(hero.role)}</span>}
      </span>
    </Link>
  )
}

function TrendCell({ hero }: { hero: MetaHero }) {
  if (!hero.trend) return <span className="text-caption text-text-muted" title="One of the weeks has fewer than 200 matches">Not enough data</span>
  return <TrendBadge direction={hero.trend.direction} delta={hero.trend.delta} comparison={TREND_COMPARISON} />
}

/** Mobile: one card per hero with the decision-relevant numbers; sort links above. */
function MobileCards({ rows, query }: MetaTableProps) {
  const sorts: Array<[MetaSort, string]> = [
    ['tier', 'Tier'],
    ['winRate', 'Win rate'],
    ['pickRate', 'Pick rate'],
    ['matches', 'Matches'],
  ]
  return (
    <div className="flex flex-col gap-3 md:hidden">
      <nav aria-label="Sort heroes" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <span className="self-center pr-1 text-eyebrow">Sort</span>
        {sorts.map(([sort, label]) => (
          <Link
            key={sort}
            href={metaHref(query, { sort, dir: 'desc' }, 'heroes-table')}
            scroll={false}
            aria-current={query.sort === sort ? 'true' : undefined}
            className={cx(
              'inline-flex h-11 shrink-0 items-center rounded-pill border px-3.5 font-ui text-sm',
              query.sort === sort ? 'border-primary bg-primary font-medium text-on-primary' : 'border-border-control text-text-muted',
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      <ol className="flex flex-col gap-2.5">
        {rows.slice(0, MOBILE_FIRST).map((hero) => (
          <MobileCard key={hero.slug} hero={hero} />
        ))}
      </ol>
      {rows.length > MOBILE_FIRST && (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-md border border-border-control font-ui text-sm font-semibold text-primary [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Show all {rows.length} heroes</span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          <ol start={MOBILE_FIRST + 1} className="mt-2.5 flex flex-col gap-2.5">
            {rows.slice(MOBILE_FIRST).map((hero) => (
              <MobileCard key={hero.slug} hero={hero} />
            ))}
          </ol>
        </details>
      )}
    </div>
  )
}

/** Phones show the first 12 of the current sort; the rest is one tap away (otherwise about 10 screens). */
const MOBILE_FIRST = 12

function MobileCard({ hero }: { hero: MetaHero }) {
  return (
          <li className="rounded-md border border-border bg-surface p-3 shadow-card">
            <div className="flex items-center gap-3">
              <TierBadge tier={hero.tier} />
              <HeroCell hero={hero} />
              <span className="ml-auto">
                <WhyButton slug={hero.slug} name={hero.name} />
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
              <div>
                <dt className="text-caption text-text-muted">Win rate</dt>
                <dd className={cx('font-ui text-sm font-semibold tabular', hero.sample === 'low' ? 'text-text-muted' : 'text-text')}>
                  {formatPercent(hero.winRate)}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-text-muted">Pick rate</dt>
                <dd className="font-ui text-sm font-semibold text-text tabular">{formatPercent(hero.pickRate)}</dd>
              </div>
              <div>
                <dt className="text-caption text-text-muted">Matches</dt>
                <dd className="font-ui text-sm font-semibold text-text tabular">{formatInteger(hero.matches)}</dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <TrendCell hero={hero} />
              <ConfidenceBadge sampleSize={hero.matches} interval={hero.interval} />
            </div>
          </li>
  )
}
