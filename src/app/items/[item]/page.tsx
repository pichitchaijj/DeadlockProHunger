import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { DataNotice } from '@/components/data/DataState'
import { InsightCard } from '@/components/data/InsightCard'
import { ScopeLine } from '@/components/data/ScopeLine'
import { ItemIcon } from '@/components/game-assets/ItemIcon'
import { PageContainer } from '@/components/layout/PageContainer'
import { ButtonLink } from '@/components/ui/Button'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { EmptyState } from '@/components/ui/States'
import { ITEM_MIN_MATCHES } from '@/lib/deadlock/constants'
import { attempt } from '@/lib/deadlock/errors'
import { formatInteger } from '@/lib/format'
import { HeroesSkeleton, ItemHeroes, ItemPerformance, NoStandout, PerformanceSkeleton, PurchasePhases, TimingSkeleton } from '@/features/items/components/detail'
import { ItemFilters } from '@/features/items/components/ItemFilters'
import { PurchaseTimingChart } from '@/features/items/components/PurchaseTimingChart'
import { findItem, getItemContext, getItemHeroes, getItemPerformance, getItemTiming, heroOptions, type ItemContext } from '@/features/items/loaders'
import { purchaseTimingInsight, type ItemRef } from '@/features/items/model'
import { capitalize } from '@/features/meta/model'
import { itemHref, itemsHref, parseItemScope, DEFAULT_ITEMS_QUERY, type ItemScopeQuery } from '@/features/items/query'

type Params = Promise<{ item: string }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** How many heroes the "who buys it" list shows. */
const HERO_LIMIT = 9

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const item = await findItem((await params).item).catch(() => null)
  return item
    ? { title: `${item.name} · Items`, description: `${item.name}: win rate, buy rate and purchase timings by hero, rank and patch, with sample sizes.` }
    : { title: 'Item' }
}

export default async function ItemPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ item: slug }, raw] = await Promise.all([params, searchParams])
  const query = parseItemScope(raw)
  const itemLoad = await attempt('[item] catalog failed', findItem(slug))

  if (!itemLoad.ok) {
    return (
      <PageContainer>
        <DataNotice error={itemLoad.kind} what="Item" action={<ButtonLink href={itemHref(slug, query)} variant="secondary" size="sm">Try again</ButtonLink>} />
      </PageContainer>
    )
  }
  const item = itemLoad.value
  if (!item) notFound()

  const [heroes, ctxLoad] = await Promise.all([heroOptions(), attempt('[item] scope failed', getItemContext(query))])
  const href = (changes: Partial<ItemScopeQuery>) => itemHref(item.slug, query, changes)

  return (
    <PageContainer className="flex flex-col gap-(--spacing-section)">
      <div className="flex flex-col gap-6">
        <Link href={itemsHref({ ...DEFAULT_ITEMS_QUERY, ...query })} className="self-start font-ui text-sm font-semibold text-primary hover:text-highlight pointer-coarse:min-h-11">
          ← All items
        </Link>
        <div className="flex items-center gap-4">
          <ItemIcon name={item.name} src={item.icon} slot={item.slot} tier={item.tier} size={64} decorative />
          <SectionHeader
            as="h1"
            eyebrow={[item.slot && capitalize(item.slot), item.tier && `Tier ${item.tier}`, item.cost && `${formatInteger(item.cost)} souls`].filter(Boolean).join(' · ') || 'Item'}
            title={item.name}
          />
        </div>

        {!ctxLoad.ok ? (
          <DataNotice error={ctxLoad.kind} what="Item statistics" action={<ButtonLink href={href({})} variant="secondary" size="sm">Try again</ButtonLink>} />
        ) : ctxLoad.value === 'unknown-hero' ? (
          <EmptyState title="Unknown hero" action={<ButtonLink href={href({ hero: 'all' })} variant="secondary" size="sm">All heroes</ButtonLink>} />
        ) : (
          <>
            <ItemFilters query={query} href={href} heroes={heroes} rankLabels={ctxLoad.value.scope.rankLabels} ranks={ctxLoad.value.scope.ranks} />
            <ScopeLine scope={ctxLoad.value.statScope} />
          </>
        )}
      </div>

      {ctxLoad.ok && ctxLoad.value !== 'unknown-hero' && (
        <ItemSections item={item} query={query} ctx={ctxLoad.value} />
      )}
    </PageContainer>
  )
}

function ItemSections({ item, query, ctx }: { item: ItemRef; query: ItemScopeQuery; ctx: ItemContext }) {
  const key = itemHref(item.slug, query)
  return (
    <>
      <section aria-labelledby="performance-title" className="flex flex-col gap-5">
        <SectionHeader id="performance-title" eyebrow="Layer 1" title="Item performance" description="How often it’s bought and how those matches ended." />
        <Suspense key={key} fallback={<PerformanceSkeleton />}>
          <Performance item={item} query={query} ctx={ctx} />
        </Suspense>
      </section>

      <section aria-labelledby="timing-title" className="flex flex-col gap-5">
        <SectionHeader
          id="timing-title"
          eyebrow="Layer 2"
          title="Purchase timing"
          description="When players buy it, and the win rate of players who bought it at each point in the match."
        />
        <Suspense key={key} fallback={<TimingSkeleton />}>
          <Timing item={item} query={query} ctx={ctx} />
        </Suspense>
      </section>

      {ctx.hero === null && (
        <section aria-labelledby="heroes-title" className="flex flex-col gap-5">
          <SectionHeader id="heroes-title" eyebrow="Layer 3" title="Who buys it" description="Heroes whose players buy it most often. Select one to see its numbers for that hero." />
          <Suspense key={key} fallback={<HeroesSkeleton />}>
            <Heroes item={item} query={query} ctx={ctx} />
          </Suspense>
        </section>
      )}
    </>
  )
}

const retry = (href: string) => <ButtonLink href={href} variant="secondary" size="sm">Try again</ButtonLink>

async function Performance({ item, query, ctx }: { item: ItemRef; query: ItemScopeQuery; ctx: ItemContext }) {
  const load = await attempt('[item] performance failed', getItemPerformance(item, ctx))
  if (!load.ok) return <DataNotice error={load.kind} what="Item performance" action={retry(itemHref(item.slug, query))} />
  if (!load.value) {
    return (
      <EmptyState
        title="Not enough purchases"
        description={`${item.name} was bought in fewer than ${formatInteger(ITEM_MIN_MATCHES)} matches in this scope, so no numbers are shown. Try a longer window, a wider rank band or all heroes.`}
        action={<ButtonLink href={itemHref(item.slug, query, { window: '30d', rank: 'all' })} variant="secondary" size="sm">Last 30 days, all ranks</ButtonLink>}
      />
    )
  }
  return <ItemPerformance row={load.value} scope={ctx.statScope} />
}

async function Timing({ item, query, ctx }: { item: ItemRef; query: ItemScopeQuery; ctx: ItemContext }) {
  const load = await attempt('[item] timing failed', getItemTiming(item, ctx))
  if (!load.ok) return <DataNotice error={load.kind} what="Purchase timing" action={retry(itemHref(item.slug, query))} />
  const { points, typical, phases, standout } = load.value
  if (points.length === 0 && phases.every((p) => p.stats === null)) {
    return <EmptyState title="No purchase timings" description={`No purchase data for ${item.name} in this scope.`} />
  }
  const scopeText = `${ctx.statScope.windowLabel}, ${ctx.statScope.rankLabel}`

  return (
    <div className="flex flex-col gap-6">
      {points.length > 0 && (
        <div className="rounded-md border border-border bg-surface p-(--spacing-card) shadow-card">
          <h3 className="mb-4 font-ui text-title font-semibold text-text">Performance by purchase time</h3>
          <PurchaseTimingChart points={points} typical={typical} />
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="font-ui text-title font-semibold text-text">By match phase</h3>
        <PurchasePhases phases={phases} />
        <p className="text-caption text-text-muted">
          Phases are the data source’s fixed time phases. “Net-worth adjusted” re-weights each phase’s win rate to the net-worth mix of players in that phase; it is still
          observational. Fewer players reach the later phases (shorter matches end first).
        </p>
      </div>

      {standout ? <InsightCard insight={purchaseTimingInsight(item.name, standout, phases, scopeText)} className="max-w-2xl" /> : <NoStandout />}
    </div>
  )
}

async function Heroes({ item, query, ctx }: { item: ItemRef; query: ItemScopeQuery; ctx: ItemContext }) {
  const load = await attempt('[item] heroes failed', getItemHeroes(item, ctx))
  if (!load.ok) return <DataNotice error={load.kind} what="Heroes" action={retry(itemHref(item.slug, query))} />
  if (load.value.length === 0) {
    return <EmptyState title="Not enough data per hero" description={`No hero bought ${item.name} in ${formatInteger(ITEM_MIN_MATCHES)}+ matches in this scope.`} />
  }
  return <ItemHeroes rows={load.value.slice(0, HERO_LIMIT)} query={query} itemSlug={item.slug} />
}
