import Link from 'next/link'
import type { ReactNode } from 'react'
import { cx } from '@/lib/cx'
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, SortIcon } from './icons'

export type SortDirection = 'asc' | 'desc'

export type TableColumn<Row> = {
  key: string
  header: string
  cell: (row: Row) => ReactNode
  align?: 'start' | 'end'
  /** Numeric columns get tabular figures and end alignment. */
  numeric?: boolean
  /** URL that sorts by this column. Sorting lives in the URL, so the table needs no client JS. */
  sortHref?: (direction: SortDirection) => string
  /**
   * `primary` columns are visible in the collapsed mobile row;
   * the rest appear when the row is expanded.
   */
  priority?: 'primary' | 'secondary'
}

type TableProps<Row> = {
  /** Describes the table for screen readers, e.g. "Hero win rates, last 7 days". */
  caption: string
  captionHidden?: boolean
  columns: TableColumn<Row>[]
  rows: Row[]
  rowKey: (row: Row) => string
  sort?: { key: string; direction: SortDirection }
  /** `list` = built-in expandable mobile rows; `none` when the caller renders its own mobile layout. */
  mobile?: 'list' | 'none'
  className?: string
}

/**
 * Deep-data table (layer L3). Never animated.
 * ≥ md: semantic <table> with sortable headers (aria-sort).
 * < md: ranked list with expandable rows (<details>), no client JS.
 */
export function Table<Row>({
  caption,
  captionHidden = false,
  columns,
  rows,
  rowKey,
  sort,
  mobile = 'list',
  className,
}: TableProps<Row>) {
  const primary = columns.filter((c) => c.priority !== 'secondary')
  const secondary = columns.filter((c) => c.priority === 'secondary')

  return (
    <div className={className}>
      {/* Desktop / tablet */}
      <div className="hidden overflow-x-auto rounded-md border border-border md:block">
        <table className="w-full border-collapse font-ui text-sm">
          <caption className={cx('px-4 py-3 text-left text-eyebrow', captionHidden && 'sr-only')}>
            {caption}
          </caption>
          {/* Not sticky: inside the overflow-x wrapper it could never stick to the page, and Chrome then counts it toward page width. */}
          <thead className="bg-surface">
            <tr className="border-y border-border">
              {columns.map((column) => (
                <HeaderCell key={column.key} column={column} sort={sort} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b border-border/70 last:border-b-0 hover:bg-surface-raised/60"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cx(
                      'px-4 py-3 text-text',
                      (column.numeric || column.align === 'end') && 'text-right tabular',
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      {mobile === 'list' && (
      <div className="md:hidden">
        <p className={cx('mb-2 text-eyebrow', captionHidden && 'sr-only')}>{caption}</p>
        <ol className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {rows.map((row) => (
            <li key={rowKey(row)}>
              {secondary.length === 0 ? (
                <MobileSummary columns={primary} row={row} />
              ) : (
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 pr-3 [&::-webkit-details-marker]:hidden">
                    <MobileSummary columns={primary} row={row} />
                    <ChevronDownIcon
                      size={18}
                      className="shrink-0 text-text-muted transition-transform duration-(--dur-fast) group-open:rotate-180"
                    />
                  </summary>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 bg-surface-sunken px-4 py-3 text-sm">
                    {secondary.map((column) => (
                      <div key={column.key} className="contents">
                        <dt className="text-text-muted">{column.header}</dt>
                        <dd className={cx('text-right text-text', column.numeric && 'tabular')}>
                          {column.cell(row)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </li>
          ))}
        </ol>
      </div>
      )}
    </div>
  )
}

function MobileSummary<Row>({ columns, row }: { columns: TableColumn<Row>[]; row: Row }) {
  const [lead, ...rest] = columns
  return (
    <div className="flex min-h-14 flex-1 items-center gap-4 px-4 py-2.5">
      <div className="min-w-0 flex-1 truncate text-text">{lead?.cell(row)}</div>
      {rest.map((column) => (
        <div key={column.key} className="text-right">
          <div className="text-caption text-text-muted">{column.header}</div>
          <div className={cx('text-sm text-text', column.numeric && 'tabular')}>{column.cell(row)}</div>
        </div>
      ))}
    </div>
  )
}

function HeaderCell<Row>({
  column,
  sort,
}: {
  column: TableColumn<Row>
  sort?: { key: string; direction: SortDirection }
}) {
  const end = column.numeric || column.align === 'end'
  const active = sort?.key === column.key
  const ariaSort = active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined

  return (
    <th
      scope="col"
      aria-sort={column.sortHref ? (ariaSort ?? 'none') : undefined}
      className={cx('px-4 py-2.5 text-eyebrow whitespace-nowrap', end ? 'text-right' : 'text-left')}
    >
      {column.sortHref ? (
        <Link
          href={column.sortHref(active && sort.direction === 'desc' ? 'asc' : 'desc')}
          scroll={false}
          className={cx(
            'inline-flex items-center gap-1 hover:text-text',
            active && 'text-text',
            end && 'flex-row-reverse',
          )}
        >
          {column.header}
          {active ? (
            sort.direction === 'asc' ? <ArrowUpIcon size={14} /> : <ArrowDownIcon size={14} />
          ) : (
            <SortIcon size={14} className="opacity-50" />
          )}
        </Link>
      ) : (
        column.header
      )}
    </th>
  )
}
