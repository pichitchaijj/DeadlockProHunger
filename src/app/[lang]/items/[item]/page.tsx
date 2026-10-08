import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { OG_LOCALE } from '@/i18n/config'
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

/** The item name is game data (from the catalog); only the surrounding words are translated. */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const [item, t, locale] = await Promise.all([findItem((await params).item).catch(() => null), getTranslations('items.meta'), getLocale()])
  if (!item) return { title: t('fallbackTitle') }
  const title = t('detailTitle', { item: item.name })
  const description = t('detailDescription', { item: item.name })
  return { title, description, openGraph: { title, description, locale: OG_LOCALE[locale], type: 'website' } }
}

export default async function ItemPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ item: slug }, raw] = await Promise.all([params, searchParams])
  const query = parseItemScope(raw)
  const [itemLoad, t, builds, common, locale] = await Promise.all([
    attempt('[item] catalog failed', findItem(slug)),
    getTranslations('items'),
    getTranslations('builds.list'),
    getTranslations('common'),
    getLocale(),
  ])

  if (!itemLoad.ok) {
    return (
      <PageContainer>
        <DataNotice error={itemLoad.kind} what="Item" action={<ButtonLink href={itemHref(slug, query)} variant="secondary" size="sm">{common('tryAgain')}</ButtonLink>} />
      </PageContainer>
    )
  }
  const item = itemLoad.value
  if (!item) notFound()

  const [heroes, ctxLoad] = await Promise.all([heroOptions(), attempt('[item] scope failed', getItemContext(query))])
  const href = (changes: Partial<ItemScopeQuery>) => itemHref(item.slug, query, changes)
  // Slot is the game's item category (data); "Tier" and "souls" are UI words around numbers.
  const eyebrow = [item.slot && capitalize(item.slot), item.tier && t('tier', { tier: item.tier }), item.cost && t('cost', { cost: formatInteger(item.cost, locale) })]

  return (
    <PageContainer className="flex flex-col gap-(--spacing-section)">
      <div className="flex flex-col gap-6">
        <Link href={itemsHref({ ...DEFAULT_ITEMS_QUERY, ...query })} className="self-start font-ui text-sm font-semibold text-primary hover:text-highlight pointer-coarse:min-h-11">
          {t('detail.back')}
        </Link>
        <div className="flex items-center gap-4">
          <ItemIcon name={item.name} src={item.icon} slot={item.slot} tier={item.tier} size={64} decorative />
          <SectionHeader as="h1" eyebrow={eyebrow.filter(Boolean).join(' · ') || t('meta.fallbackTitle')} title={item.name} />
        </div>

        {!ctxLoad.ok ? (
          <DataNotice error={ctxLoad.kind} what="Item statistics" action={<ButtonLink href={href({})} variant="secondary" size="sm">{common('tryAgain')}</ButtonLink>} />
        ) : ctxLoad.value === 'unknown-hero' ? (
          <EmptyState title={builds('unknownHero')} action={<ButtonLink href={href({ hero: 'all' })} variant="secondary" size="sm">{builds('allHeroes')}</ButtonLink>} />
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

async function ItemSections({ item, query, ctx }: { item: ItemRef; query: ItemScopeQuery; ctx: ItemContext }) {
  const t = await getTranslations('items.detail')
  const key = itemHref(item.slug, query)
  return (
    <>
      <section aria-labelledby="performance-title" className="flex flex-col gap-5">
        <SectionHeader id="performance-title" eyebrow={t('layer', { n: 1 })} title={t('performanceTitle')} description={t('performanceDescription')} />
        <Suspense key={key} fallback={<PerformanceSkeleton label={t('loadingPerformance')} />}>
          <Performance item={item} query={query} ctx={ctx} />
        </Suspense>
      </section>

      <section aria-labelledby="timing-title" className="flex flex-col gap-5">
        <SectionHeader id="timing-title" eyebrow={t('layer', { n: 2 })} title={t('timingTitle')} description={t('timingDescription')} />
        <Suspense key={key} fallback={<TimingSkeleton label={t('loadingTimings')} />}>
          <Timing item={item} query={query} ctx={ctx} />
        </Suspense>
      </section>

      {ctx.hero === null && (
        <section aria-labelledby="heroes-title" className="flex flex-col gap-5">
          <SectionHeader id="heroes-title" eyebrow={t('layer', { n: 3 })} title={t('heroesTitle')} description={t('heroesDescription')} />
          <Suspense key={key} fallback={<HeroesSkeleton label={t('loadingHeroes')} />}>
            <Heroes item={item} query={query} ctx={ctx} />
          </Suspense>
        </section>
      )}
    </>
  )
}

const retry = (href: string, label: string) => (
  <ButtonLink href={href} variant="secondary" size="sm">
    {label}
  </ButtonLink>
)

/** The detail sections' shared strings: the Items catalog, the retry label and the locale for counts. */
async function sectionText() {
  const [t, common, locale] = await Promise.all([getTranslations('items'), getTranslations('common'), getLocale()])
  return { t, tryAgain: common('tryAgain'), min: formatInteger(ITEM_MIN_MATCHES, locale) }
}

async function Performance({ item, query, ctx }: { item: ItemRef; query: ItemScopeQuery; ctx: ItemContext }) {
  const [load, { t, tryAgain, min }] = await Promise.all([attempt('[item] performance failed', getItemPerformance(item, ctx)), sectionText()])
  if (!load.ok) return <DataNotice error={load.kind} what="Item performance" action={retry(itemHref(item.slug, query), tryAgain)} />
  if (!load.value) {
    return (
      <EmptyState
        title={t('detail.notEnoughTitle')}
        description={t('detail.notEnoughDescription', { item: item.name, count: min })}
        action={<ButtonLink href={itemHref(item.slug, query, { window: '30d', rank: 'all' })} variant="secondary" size="sm">{t('list.wideScope')}</ButtonLink>}
      />
    )
  }
  return <ItemPerformance row={load.value} scope={ctx.statScope} />
}

async function Timing({ item, query, ctx }: { item: ItemRef; query: ItemScopeQuery; ctx: ItemContext }) {
  const [load, { t, tryAgain }] = await Promise.all([attempt('[item] timing failed', getItemTiming(item, ctx)), sectionText()])
  if (!load.ok) return <DataNotice error={load.kind} what="Purchase timing" action={retry(itemHref(item.slug, query), tryAgain)} />
  const { points, typical, phases, standout } = load.value
  if (points.length === 0 && phases.every((p) => p.stats === null)) {
    return <EmptyState title={t('detail.noTimingsTitle')} description={t('detail.noTimingsDescription', { item: item.name })} />
  }
  const scopeText = `${ctx.statScope.windowLabel}, ${ctx.statScope.rankLabel}`

  return (
    <div className="flex flex-col gap-6">
      {points.length > 0 && (
        <div className="rounded-md border border-border bg-surface p-(--spacing-card) shadow-card">
          <h3 className="mb-4 font-ui text-title font-semibold text-text">{t('detail.byTimeTitle')}</h3>
          <PurchaseTimingChart points={points} typical={typical} />
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="font-ui text-title font-semibold text-text">{t('detail.byPhaseTitle')}</h3>
        <PurchasePhases phases={phases} />
        <p className="text-caption text-text-muted">{t('detail.phaseNote')}</p>
      </div>

      {/* The standout insight is an Insight Engine result (shared InsightCard), which stays English for now, like Hero detail's insights. */}
      {standout ? <InsightCard insight={purchaseTimingInsight(item.name, standout, phases, scopeText)} className="max-w-2xl" /> : <NoStandout />}
    </div>
  )
}

async function Heroes({ item, query, ctx }: { item: ItemRef; query: ItemScopeQuery; ctx: ItemContext }) {
  const [load, { t, tryAgain, min }] = await Promise.all([attempt('[item] heroes failed', getItemHeroes(item, ctx)), sectionText()])
  if (!load.ok) return <DataNotice error={load.kind} what="Heroes" action={retry(itemHref(item.slug, query), tryAgain)} />
  if (load.value.length === 0) {
    return <EmptyState title={t('detail.noHeroesTitle')} description={t('detail.noHeroesDescription', { item: item.name, count: min })} />
  }
  return <ItemHeroes rows={load.value.slice(0, HERO_LIMIT)} query={query} itemSlug={item.slug} />
}
