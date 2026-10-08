import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { OG_LOCALE } from '@/i18n/config'
import { Suspense, type ReactNode } from 'react'
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
import { getScopeWording } from '@/components/data/scopeWording'

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations('items.meta'), getLocale()])
  return {
    title: t('listTitle'),
    description: t('listDescription'),
    openGraph: { title: t('listTitle'), description: t('listDescription'), locale: OG_LOCALE[locale], type: 'website' },
  }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** The shell (filters) renders first; the item list streams in. */
export default async function ItemsPage({ searchParams }: { searchParams: SearchParams }) {
  const query = parseItemsQuery(await searchParams)
  const [heroes, ctxLoad, t, builds, common, locale] = await Promise.all([
    heroOptions(),
    attempt('[items] scope failed', getItemContext(query)),
    getTranslations('items.list'),
    getTranslations('builds.list'),
    getTranslations('common'),
    getLocale(),
  ])
  const scopeWords = await getScopeWording()
  const term = (chunks: ReactNode) => <span className="font-semibold text-text">{chunks}</span>

  return (
    <PageContainer className="flex flex-col gap-8">
      <SectionHeader as="h1" eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />

      {!ctxLoad.ok ? (
        <DataNotice error={ctxLoad.kind} what="Items" action={<ButtonLink href={itemsHref(query)} variant="secondary" size="sm">{common('tryAgain')}</ButtonLink>} />
      ) : ctxLoad.value === 'unknown-hero' ? (
        <EmptyState title={builds('unknownHero')} action={<ButtonLink href={itemsHref(query, { hero: 'all' })} variant="secondary" size="sm">{builds('allHeroes')}</ButtonLink>} />
      ) : (
        <>
          <div className="flex flex-col gap-4">
            <ItemFilters
              query={query}
              href={(changes) => itemsHref(query, changes)}
              heroes={heroes}
              rankLabels={scopeWords.rankLabels(ctxLoad.value.scope.rankRefs)}
              ranks={ctxLoad.value.scope.ranks}
              slot={{ value: query.slot, href: (slot) => itemsHref(query, { slot }) }}
            />
            <ScopeLine scope={ctxLoad.value.statScope} />
          </div>

          <section id="items-table" aria-labelledby="items-title" className="flex scroll-mt-24 flex-col gap-4">
            <h2 id="items-title" className="font-display text-display-m font-bold text-text uppercase">
              {t('allItems')}
            </h2>
            <Suspense key={itemsHref(query)} fallback={<TableSkeleton label={t('loading')} />}>
              <ItemsResults query={query} ctx={ctxLoad.value} />
            </Suspense>
          </section>
        </>
      )}

      <details className="rounded-md border border-border bg-surface-sunken px-(--spacing-card) py-4 text-sm text-text-muted">
        <summary className="cursor-pointer py-3 font-ui font-semibold text-text">{t('howTitle')}</summary>
        <ul className="mt-3 flex flex-col gap-1.5">
          <li>{t.rich('howWinRate', { term })}</li>
          <li>{t.rich('howBuyRate', { term })}</li>
          <li>{t.rich('howBuyTime', { term })}</li>
          <li>{t('howMinimum', { count: formatInteger(ITEM_MIN_MATCHES, locale) })}</li>
          <li>{t('howLead')}</li>
        </ul>
      </details>
    </PageContainer>
  )
}

const SORTS: ItemSort[] = ['buyRate', 'winRate', 'matches', 'buyTime']

async function ItemsResults({ query, ctx }: { query: ItemsQuery; ctx: ItemContext }) {
  const [load, t, common, locale] = await Promise.all([attempt('[items] totals failed', itemTotals(ctx)), getTranslations('items.list'), getTranslations('common'), getLocale()])
  if (!load.ok) {
    return <DataNotice error={load.kind} what="Item statistics" action={<ButtonLink href={itemsHref(query)} variant="secondary" size="sm">{common('tryAgain')}</ButtonLink>} />
  }
  const rows = filterAndSort(load.value, query.slot, query.sort, query.dir)
  if (rows.length === 0) {
    return (
      <EmptyState
        title={t('noItemsTitle')}
        description={t('noItemsDescription', { count: formatInteger(ITEM_MIN_MATCHES, locale) })}
        action={<ButtonLink href={itemsHref(query, { window: '30d', rank: 'all' })} variant="secondary" size="sm">{t('wideScope')}</ButtonLink>}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <nav aria-label={t('sortNav')} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:hidden">
        <span className="self-center pr-1 text-eyebrow">{t('sort')}</span>
        {SORTS.map((sort) => (
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
            {t(`sorts.${sort}`)}
          </Link>
        ))}
      </nav>
      <ItemTable rows={rows} query={query} />
      <p className="text-caption text-text-muted">
        {t('count', { count: rows.length })} {rows.some((r) => r.buyRate === null) && t('buyRateUnavailable')}
      </p>
    </div>
  )
}

function TableSkeleton({ label }: { label: string }) {
  return (
    <LoadingState label={label}>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    </LoadingState>
  )
}
