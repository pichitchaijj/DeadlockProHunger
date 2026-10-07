import Link from 'next/link'
import { WinRate } from '@/components/cards/WinRate'
import { ConfidenceBadge } from '@/components/data/ConfidenceBadge'
import { ItemIcon } from '@/components/game-assets/ItemIcon'
import { Table, type SortDirection, type TableColumn } from '@/components/ui/Table'
import { formatDuration, formatInteger, formatPercent } from '@/lib/format'
import { capitalize } from '@/features/meta/model'
import type { ItemRow } from '../model'
import { itemHref, itemsHref, type ItemSort, type ItemsQuery } from '../query'

/** Item directory: sortable table (≥ md) and cards (phones). Rows never animate. */
export function ItemTable({ rows, query }: { rows: ItemRow[]; query: ItemsQuery }) {
  const sortHref = (sort: ItemSort) => (dir: SortDirection) => itemsHref(query, { sort, dir }, 'items-table')

  const columns: TableColumn<ItemRow>[] = [
    { key: 'item', header: 'Item', cell: (r) => <ItemCell row={r} query={query} /> },
    { key: 'winRate', header: 'Win rate', numeric: true, sortHref: sortHref('winRate'), cell: (r) => <WinRate value={r.winRate} className="items-end" /> },
    {
      key: 'buyRate',
      header: 'Buy rate',
      numeric: true,
      sortHref: sortHref('buyRate'),
      cell: (r) => (r.buyRate === null ? <span className="text-text-muted" title="Total matches in scope couldn’t be loaded">—</span> : formatPercent(r.buyRate)),
    },
    { key: 'matches', header: 'Purchases', numeric: true, sortHref: sortHref('matches'), cell: (r) => formatInteger(r.matches) },
    { key: 'buyTime', header: 'Avg. buy time', numeric: true, sortHref: sortHref('buyTime'), cell: (r) => formatDuration(r.avgBuyTimeS) },
    { key: 'confidence', header: 'Confidence', align: 'end', cell: (r) => <ConfidenceBadge sampleSize={r.matches} interval={r.interval} /> },
  ]

  return (
    <>
      <Table
        caption="Items by win rate, buy rate and purchase time"
        captionHidden
        columns={columns}
        rows={rows}
        rowKey={(r) => String(r.id)}
        sort={{ key: query.sort, direction: query.dir }}
        mobile="none"
      />
      <MobileCards rows={rows} query={query} />
    </>
  )
}

/** Phones show the first 15 of the current sort; the rest is one tap away. */
const MOBILE_FIRST = 15

/** Phones: one card per item (a link row plus its numbers; no link nested in a disclosure). */
function MobileCards({ rows, query }: { rows: ItemRow[]; query: ItemsQuery }) {
  return (
    <div className="flex flex-col gap-2.5 md:hidden">
      <ol className="flex flex-col gap-2.5">
        {rows.slice(0, MOBILE_FIRST).map((row) => (
          <MobileCard key={row.id} row={row} query={query} />
        ))}
      </ol>
      {rows.length > MOBILE_FIRST && (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-md border border-border-control font-ui text-sm font-semibold text-primary [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Show all {rows.length} items</span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          <ol start={MOBILE_FIRST + 1} className="mt-2.5 flex flex-col gap-2.5">
            {rows.slice(MOBILE_FIRST).map((row) => (
              <MobileCard key={row.id} row={row} query={query} />
            ))}
          </ol>
        </details>
      )}
    </div>
  )
}

function MobileCard({ row, query }: { row: ItemRow; query: ItemsQuery }) {
  return (
    <li className="rounded-md border border-border bg-surface p-3 shadow-card">
      <div className="flex items-center gap-3">
        <ItemCell row={row} query={query} />
        <ConfidenceBadge sampleSize={row.matches} interval={row.interval} className="ml-auto" />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
        <div>
          <dt className="text-caption text-text-muted">Win rate</dt>
          <dd className="font-ui text-sm font-semibold text-text tabular">{formatPercent(row.winRate)}</dd>
        </div>
        <div>
          <dt className="text-caption text-text-muted">Buy rate</dt>
          <dd className="font-ui text-sm font-semibold text-text tabular">{row.buyRate === null ? '—' : formatPercent(row.buyRate)}</dd>
        </div>
        <div>
          <dt className="text-caption text-text-muted">Avg. buy time</dt>
          <dd className="font-ui text-sm font-semibold text-text tabular">{formatDuration(row.avgBuyTimeS)}</dd>
        </div>
      </dl>
    </li>
  )
}

function ItemCell({ row, query }: { row: ItemRow; query: ItemsQuery }) {
  return (
    <Link href={itemHref(row.slug, query)} className="group flex min-w-0 items-center gap-3 pointer-coarse:min-h-11">
      <ItemIcon name={row.name} src={row.icon} slot={row.slot} tier={row.tier} size={32} decorative />
      <span className="min-w-0">
        <span className="block truncate font-semibold text-text group-hover:text-highlight">{row.name}</span>
        <span className="block text-caption text-text-muted">
          {[row.slot && capitalize(row.slot), row.tier && `Tier ${row.tier}`].filter(Boolean).join(' · ')}
        </span>
      </span>
    </Link>
  )
}
