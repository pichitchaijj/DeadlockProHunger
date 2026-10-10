import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { Suspense } from 'react'
import { OG_LOCALE, type Locale } from '@/i18n/config'
import { DataNotice } from '@/components/data/DataState'
import { ScopeLine } from '@/components/data/ScopeLine'
import { PageContainer } from '@/components/layout/PageContainer'
import { ButtonLink } from '@/components/ui/Button'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SelectNav } from '@/components/ui/SelectNav'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, LoadingState } from '@/components/ui/States'
import { attempt } from '@/lib/deadlock/errors'
import { heroCatalog, heroOptions, itemCatalog, itemOptions } from '@/features/items/loaders'
import { BroadChanges, HeroChangeCards, ItemChangeCards } from '@/features/patches/components/changes'
import { MostImpacted, MovementTable } from '@/features/patches/components/impact'
import { PatchFilters } from '@/features/patches/components/PatchFilters'
import { getPatchCompare, getPatchContext, patchList, type PatchContext } from '@/features/patches/loaders'
import { changeMarks, groupChanges, mostImpacted, type PatchSummary } from '@/features/patches/model'
import { compareHref, parseCompareQuery, patchHref, patchListHref, type CompareQuery } from '@/features/patches/query'
import { patchTitle, windowRange, type PatchTranslate } from '@/features/patches/text'
import { getScopeWording } from '@/components/data/scopeWording'

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations('patch.meta'), getLocale()])
  return {
    title: t('compareTitle'),
    description: t('compareDescription'),
    openGraph: { title: t('compareTitle'), description: t('compareDescription'), locale: OG_LOCALE[locale], type: 'website' },
  }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function ComparePage({ searchParams }: { searchParams: SearchParams }) {
  const raw = parseCompareQuery(await searchParams)
  const [listLoad, ctxLoad, heroes, items, t, common, heroesT, words] = await Promise.all([
    attempt('[patch compare] list failed', patchList()),
    attempt('[patch compare] scope failed', getPatchContext(raw)),
    heroOptions(),
    itemOptions(),
    getTranslations('patch'),
    getTranslations('common'),
    getTranslations('heroes.list'),
    getScopeWording(),
  ])
  const tr: PatchTranslate = (key, values) => t(key as 'untitled', values)

  if (!listLoad.ok) {
    return (
      <PageContainer>
        <Header />
        <DataNotice className="mt-8" error={listLoad.kind} what="Patches" action={<ButtonLink href={compareHref(raw)} variant="secondary" size="sm">{common('tryAgain')}</ButtonLink>} />
      </PageContainer>
    )
  }
  const patches = listLoad.value
  // Defaults: the previous patch vs the latest.
  const query: CompareQuery = { ...raw, a: raw.a ?? patches[1]?.id ?? null, b: raw.b ?? patches[0]?.id ?? null }
  const ia = patches.findIndex((p) => p.id === query.a)
  const ib = patches.findIndex((p) => p.id === query.b)
  const options = patches.map((p) => ({ value: p.id, label: t('option', { id: p.id, title: patchTitle(p, tr) }) }))

  return (
    <PageContainer className="flex flex-col gap-(--spacing-section)">
      <div className="flex flex-col gap-6">
        <Link href={patchListHref(query)} className="self-start font-ui text-sm font-semibold text-primary hover:text-highlight pointer-coarse:min-h-11">
          {t('detail.all')}
        </Link>
        <Header />
        {!ctxLoad.ok ? (
          <DataNotice error={ctxLoad.kind} what="Patch statistics" />
        ) : typeof ctxLoad.value === 'string' ? (
          <EmptyState
            title={ctxLoad.value === 'unknown-hero' ? t('detail.unknownHero') : t('detail.unknownItem')}
            action={<ButtonLink href={compareHref({ ...query, hero: 'all', item: 'all' })} variant="secondary" size="sm">{heroesT('clearFilters')}</ButtonLink>}
          />
        ) : (
          <PatchFilters
            query={query}
            href={(changes) => compareHref(query, changes)}
            heroes={heroes}
            items={items}
            rankLabels={words.rankLabels(ctxLoad.value.scope.rankRefs)}
            ranks={ctxLoad.value.scope.ranks}
          >
            <SelectNav label={t('compare.patchA')} options={options} value={query.a ?? ''} hrefFor={Object.fromEntries(patches.map((p) => [p.id, compareHref(query, { a: p.id })]))} />
            <SelectNav label={t('compare.patchB')} options={options} value={query.b ?? ''} hrefFor={Object.fromEntries(patches.map((p) => [p.id, compareHref(query, { b: p.id })]))} />
          </PatchFilters>
        )}
      </div>

      {ia < 0 || ib < 0 ? (
        <EmptyState
          title={t('compare.pickTwoTitle')}
          description={t('compare.pickTwoDescription')}
          action={<ButtonLink href="/patch/compare" variant="secondary" size="sm">{t('compare.latestTwo')}</ButtonLink>}
        />
      ) : ia === ib ? (
        <EmptyState title={t('compare.sameTitle')} description={t('compare.sameDescription')} />
      ) : (
        ctxLoad.ok &&
        typeof ctxLoad.value !== 'string' && (
          <Suspense key={compareHref(query)} fallback={<CompareSkeleton />}>
            <Comparison patches={patches} ia={ia} ib={ib} ctx={ctxLoad.value} />
          </Suspense>
        )
      )}

      <details className="rounded-md border border-border bg-surface-sunken px-(--spacing-card) py-4 text-sm text-text-muted">
        <summary className="cursor-pointer py-3 font-ui font-semibold text-text">{t('compare.how.summary')}</summary>
        <ul className="mt-3 flex flex-col gap-1.5">
          <li>{t('compare.how.periods')}</li>
          <li>{t('compare.how.clear', { rule: t('rules.clear') })}</li>
          <li>{t('compare.how.data')}</li>
          <li>{t('compare.how.observed')}</li>
        </ul>
      </details>
    </PageContainer>
  )
}

function Header() {
  const t = useTranslations('patch')
  return <SectionHeader as="h1" eyebrow={t('list.eyebrow')} title={t('compare.title')} description={t('compare.description')} />
}

function CompareSkeleton() {
  const t = useTranslations('patch.compare')
  return (
    <LoadingState label={t('loading')}>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-72" />
      </div>
    </LoadingState>
  )
}

async function Comparison({ patches, ia, ib, ctx }: { patches: PatchSummary[]; ia: number; ib: number; ctx: PatchContext }) {
  const [load, heroRefs, itemRefs, t, locale, words, heroesT, itemsT] = await Promise.all([
    attempt('[patch compare] failed', getPatchCompare(patches, ia, ib, ctx)),
    heroCatalog().catch(() => new Map()),
    itemCatalog().catch(() => new Map()),
    getTranslations('patch'),
    getLocale(),
    getScopeWording(),
    getTranslations('heroes.list'),
    getTranslations('items.table'),
  ])
  if (!load.ok) return <DataNotice error={load.kind} what="Patch comparison" />
  const tr: PatchTranslate = (key, values) => t(key as 'untitled', values)
  const { older, newer, periods, heroes, items, diff, builds } = load.value
  const labels = {
    a: t('impact.period', { id: older.id, range: windowRange(periods.older, 'day', locale as Locale, tr) }),
    b: t('impact.period', { id: newer.id, range: windowRange(periods.newer, 'day', locale as Locale, tr) }),
  }
  const grouped = diff ? groupChanges(diff.changes, diff.heroNames) : null
  const marks = grouped ? changeMarks(grouped.heroes, grouped.items) : { heroes: new Map(), items: new Map() }
  const heroRows = heroes.filter((h) => !ctx.hero || h.id === ctx.hero.id).sort((a, b) => (b.winDelta ?? -1) - (a.winDelta ?? -1))
  const itemRows =
    items
      ?.filter((i) => (ctx.item ? i.id === ctx.item.id : marks.items.has(i.id) || i.verdict === 'higher' || i.verdict === 'lower'))
      .sort((a, b) => Math.abs(b.winDelta ?? 0) - Math.abs(a.winDelta ?? 0)) ?? null
  const moved = mostImpacted(heroes)

  return (
    <div className="flex flex-col gap-(--spacing-section)">
      <section aria-labelledby="cmp-heroes" className="flex flex-col gap-5">
        <SectionHeader id="cmp-heroes" title={t('compare.heroesTitle')} description={t('compare.heroesDescription', labels)} />
        <ScopeLine scope={{ window: { kind: 'text', text: t('impact.versus', labels) }, rank: { kind: 'text', text: words.rankScope(ctx.rank) }, source: 'live' }} />
        {periods.newer.days < 3 && (
          <p role="status" className="rounded-md border border-orange/40 bg-orange/10 px-4 py-3 text-sm text-text">
            {t('compare.early', { count: periods.newer.days })}
          </p>
        )}
        <MostImpacted up={moved.up} down={moved.down} marks={marks.heroes} labels={labels} />
        <MovementTable rows={heroRows} rateLabel={heroesT('pickRate')} marks={marks.heroes} caption={t('compare.heroCaption', labels)} />
      </section>

      <section aria-labelledby="cmp-items" className="flex flex-col gap-5">
        <SectionHeader id="cmp-items" title={t('compare.itemsTitle')} description={t('compare.itemsDescription')} />
        {itemRows === null ? (
          <p className="text-sm text-text-muted">{t('impact.itemsUnavailable')}</p>
        ) : itemRows.length > 0 ? (
          <MovementTable rows={itemRows} rateLabel={itemsT('buyRate')} marks={marks.items} caption={t('compare.itemCaption', labels)} />
        ) : (
          <p className="text-sm text-text-muted">{t('compare.noItems')}</p>
        )}
      </section>

      <section aria-labelledby="cmp-data" className="flex flex-col gap-5">
        <SectionHeader
          id="cmp-data"
          title={t('compare.dataTitle')}
          description={builds.from && builds.to ? t('compare.dataDescription', { from: builds.from.version, to: builds.to.version }) : undefined}
        />
        {!grouped ? (
          <p className="text-sm text-text-muted">{t('compare.noBuilds')}</p>
        ) : (
          <>
            <details open={grouped.heroes.length <= 6}>
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-primary hover:text-highlight">
                <h3 className="font-ui text-sm font-semibold">{t('compare.heroesCount', { count: grouped.heroes.filter((h) => !ctx.hero || h.heroId === ctx.hero.id).length })}</h3>
              </summary>
              <div className="mt-3">
                <HeroChangeCards heroes={grouped.heroes.filter((h) => !ctx.hero || h.heroId === ctx.hero.id)} refs={heroRefs} />
              </div>
            </details>
            <details open={grouped.items.length <= 6}>
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-primary hover:text-highlight">
                <h3 className="font-ui text-sm font-semibold">{t('compare.itemsCount', { count: grouped.items.filter((i) => !ctx.item || i.id === ctx.item.id).length })}</h3>
              </summary>
              <div className="mt-3">
                <ItemChangeCards items={grouped.items.filter((i) => !ctx.item || i.id === ctx.item.id)} refs={itemRefs} stats={null} />
              </div>
            </details>
            <BroadChanges list={diff?.broad ?? []} />
          </>
        )}
        <p className="text-caption text-text-muted">
          <Link href={patchHref(older.id)} className="font-semibold text-primary hover:text-highlight">
            {patchTitle(older, tr)}
          </Link>{' '}
          ·{' '}
          <Link href={patchHref(newer.id)} className="font-semibold text-primary hover:text-highlight">
            {patchTitle(newer, tr)}
          </Link>
        </p>
      </section>
    </div>
  )
}
