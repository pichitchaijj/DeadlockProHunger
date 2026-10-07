import type { Metadata } from 'next'
import { Link } from '@/i18n/navigation'
import { Suspense } from 'react'
import { DataNotice } from '@/components/data/DataState'
import { ScopeLine } from '@/components/data/ScopeLine'
import { PageContainer } from '@/components/layout/PageContainer'
import { ButtonLink } from '@/components/ui/Button'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, LoadingState } from '@/components/ui/States'
import { cx } from '@/lib/cx'
import { ITEM_MIN_MATCHES } from '@/lib/deadlock/constants'
import { attempt } from '@/lib/deadlock/errors'
import { formatInteger } from '@/lib/format'
import { ItemFilters } from '@/features/items/components/ItemFilters'
import { ItemTable } from '@/features/items/components/ItemTable'
import { getItemContext, heroOptions, itemTotals, type ItemContext } from '@/features/items/loaders'
import { filterAndSort } from '@/features/items/model'
import { itemsHref, parseItemsQuery, type ItemSort, type ItemsQuery } from '@/features/items/query'

export const metadata: Metadata = {
  title: 'Items',
  description: 'Deadlock item win rates, buy rates and purchase timings by hero, rank and patch, with sample sizes.',
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** The shell (filters) renders first; the item list streams in. */
export default async function ItemsPage({ searchParams }: { searchParams: SearchParams }) {
  const query = parseItemsQuery(await searchParams)
  const [heroes, ctxLoad] = await Promise.all([heroOptions(), attempt('[items] scope failed', getItemContext(query))])

  return (
    <PageContainer className="flex flex-col gap-8">
      <SectionHeader
        as="h1"
        eyebrow="Items"
        title="Item performance"
        description="How often each item is bought, when, and how those matches ended. Open an item for its purchase timings."
      />

      {!ctxLoad.ok ? (
        <DataNotice error={ctxLoad.kind} what="Items" action={<ButtonLink href={itemsHref(query)} variant="secondary" size="sm">Try again</ButtonLink>} />
      ) : ctxLoad.value === 'unknown-hero' ? (
        <EmptyState title="Unknown hero" action={<ButtonLink href={itemsHref(query, { hero: 'all' })} variant="secondary" size="sm">All heroes</ButtonLink>} />
      ) : (
        <>
          <div className="flex flex-col gap-4">
            <ItemFilters
              query={query}
              href={(changes) => itemsHref(query, changes)}
              heroes={heroes}
              rankLabels={ctxLoad.value.scope.rankLabels}
              ranks={ctxLoad.value.scope.ranks}
              slot={{ value: query.slot, href: (slot) => itemsHref(query, { slot }) }}
            />
            <ScopeLine scope={ctxLoad.value.statScope} />
          </div>

          <section id="items-table" aria-labelledby="items-title" className="flex scroll-mt-24 flex-col gap-4">
            <h2 id="items-title" className="font-display text-display-m font-bold text-text uppercase">
              All items
            </h2>
            <Suspense key={itemsHref(query)} fallback={<TableSkeleton />}>
              <ItemsResults query={query} ctx={ctxLoad.value} />
            </Suspense>
          </section>
        </>
      )}

      <details className="rounded-md border border-border bg-surface-sunken px-(--spacing-card) py-4 text-sm text-text-muted">
        <summary className="cursor-pointer py-3 font-ui font-semibold text-text">How these numbers work</summary>
        <ul className="mt-3 flex flex-col gap-1.5">
          <li>
            <span className="font-semibold text-text">Win rate</span>: matches won by players who bought the item, out of all matches where it was bought, with a 95% interval.
          </li>
          <li>
            <span className="font-semibold text-text">Buy rate</span>: share of player-matches in scope in which the item was bought (of the selected hero’s matches when a hero is chosen).
          </li>
          <li>
            <span className="font-semibold text-text">Avg. buy time</span>: average match clock at purchase.
          </li>
          <li>Items bought in fewer than {formatInteger(ITEM_MIN_MATCHES)} matches in this scope aren’t listed. Corrupted purchases are excluded.</li>
          <li>Players who are ahead buy more items sooner, so an item’s win rate partly reflects the lead, not only the item.</li>
        </ul>
      </details>
    </PageContainer>
  )
}

const SORTS: Array<[ItemSort, string]> = [
  ['buyRate', 'Buy rate'],
  ['winRate', 'Win rate'],
  ['matches', 'Purchases'],
  ['buyTime', 'Buy time'],
]

async function ItemsResults({ query, ctx }: { query: ItemsQuery; ctx: ItemContext }) {
  const load = await attempt('[items] totals failed', itemTotals(ctx))
  if (!load.ok) {
    return <DataNotice error={load.kind} what="Item statistics" action={<ButtonLink href={itemsHref(query)} variant="secondary" size="sm">Try again</ButtonLink>} />
  }
  const rows = filterAndSort(load.value, query.slot, query.sort, query.dir)
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No items to show"
        description={`No item was bought in ${formatInteger(ITEM_MIN_MATCHES)}+ matches in this scope. Try a longer window or a wider rank band.`}
        action={<ButtonLink href={itemsHref(query, { window: '30d', rank: 'all' })} variant="secondary" size="sm">Last 30 days, all ranks</ButtonLink>}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Sort items" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:hidden">
        <span className="self-center pr-1 text-eyebrow">Sort</span>
        {SORTS.map(([sort, label]) => (
          <Link
            key={sort}
            href={itemsHref(query, { sort, dir: 'desc' }, 'items-table')}
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
      <ItemTable rows={rows} query={query} />
      <p className="text-caption text-text-muted">
        {rows.length} {rows.length === 1 ? 'item' : 'items'}.{' '}
        {rows.some((r) => r.buyRate === null) && 'Buy rates are unavailable right now: the total number of matches in scope couldn’t be loaded.'}
      </p>
    </div>
  )
}

function TableSkeleton() {
  return (
    <LoadingState label="Loading item statistics">
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    </LoadingState>
  )
}
