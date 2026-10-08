import type { Metadata } from 'next'
import { Link } from '@/i18n/navigation'
import { Suspense } from 'react'
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
import { changeMarks, CLEAR_RULE, groupChanges, mostImpacted, type PatchSummary, type Window } from '@/features/patches/model'
import { compareHref, parseCompareQuery, patchHref, patchListHref, type CompareQuery } from '@/features/patches/query'
import { getScopeWording } from '@/components/data/scopeWording'

export const metadata: Metadata = {
  title: 'Compare patches',
  description: 'Two Deadlock patches side by side: hero and item win rates in each patch’s first days, and every game-data change between them.',
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const DAY = 86_400
const windowText = (w: Window) => `${SHORT.format(w.from * 1000)}–${SHORT.format((w.to - DAY) * 1000)}`

export default async function ComparePage({ searchParams }: { searchParams: SearchParams }) {
  const raw = parseCompareQuery(await searchParams)
  const [listLoad, ctxLoad, heroes, items] = await Promise.all([attempt('[patch compare] list failed', patchList()), attempt('[patch compare] scope failed', getPatchContext(raw)), heroOptions(), itemOptions()])

  if (!listLoad.ok) {
    return (
      <PageContainer>
        <Header />
        <DataNotice className="mt-8" error={listLoad.kind} what="Patches" action={<ButtonLink href={compareHref(raw)} variant="secondary" size="sm">Try again</ButtonLink>} />
      </PageContainer>
    )
  }
  const patches = listLoad.value
  // Defaults: the previous patch vs the latest.
  const query: CompareQuery = { ...raw, a: raw.a ?? patches[1]?.id ?? null, b: raw.b ?? patches[0]?.id ?? null }
  const ia = patches.findIndex((p) => p.id === query.a)
  const ib = patches.findIndex((p) => p.id === query.b)
  const options = patches.map((p) => ({ value: p.id, label: `${p.id} · ${p.title}` }))

  return (
    <PageContainer className="flex flex-col gap-(--spacing-section)">
      <div className="flex flex-col gap-6">
        <Link href={patchListHref(query)} className="self-start font-ui text-sm font-semibold text-primary hover:text-highlight pointer-coarse:min-h-11">
          ← All patches
        </Link>
        <Header />
        {!ctxLoad.ok ? (
          <DataNotice error={ctxLoad.kind} what="Patch statistics" />
        ) : typeof ctxLoad.value === 'string' ? (
          <EmptyState
            title={ctxLoad.value === 'unknown-hero' ? 'Unknown hero' : 'Unknown item'}
            action={<ButtonLink href={compareHref({ ...query, hero: 'all', item: 'all' })} variant="secondary" size="sm">Clear filters</ButtonLink>}
          />
        ) : (
          <PatchFilters
            query={query}
            href={(changes) => compareHref(query, changes)}
            heroes={heroes}
            items={items}
            rankLabels={(await getScopeWording('en')).rankLabels(ctxLoad.value.scope.rankRefs)}
            ranks={ctxLoad.value.scope.ranks}
          >
            <SelectNav label="Patch A" options={options} value={query.a ?? ''} hrefFor={Object.fromEntries(patches.map((p) => [p.id, compareHref(query, { a: p.id })]))} />
            <SelectNav label="Patch B" options={options} value={query.b ?? ''} hrefFor={Object.fromEntries(patches.map((p) => [p.id, compareHref(query, { b: p.id })]))} />
          </PatchFilters>
        )}
      </div>

      {ia < 0 || ib < 0 ? (
        <EmptyState title="Pick two patches" description="One of the selected patches isn’t in the patch feed." action={<ButtonLink href="/patch/compare" variant="secondary" size="sm">Latest two patches</ButtonLink>} />
      ) : ia === ib ? (
        <EmptyState title="Same patch twice" description="Pick two different patches to compare." />
      ) : (
        ctxLoad.ok &&
        typeof ctxLoad.value !== 'string' && (
          <Suspense key={compareHref(query)} fallback={<CompareSkeleton />}>
            <Comparison patches={patches} ia={ia} ib={ib} ctx={ctxLoad.value} />
          </Suspense>
        )
      )}

      <details className="rounded-md border border-border bg-surface-sunken px-(--spacing-card) py-4 text-sm text-text-muted">
        <summary className="cursor-pointer py-3 font-ui font-semibold text-text">How patches are compared</summary>
        <ul className="mt-3 flex flex-col gap-1.5">
          <li>Each patch’s period runs from its patch day to the next patch, at most 7 days. Statistics compare the older patch’s period with the newer one’s.</li>
          <li>“Clear change”: {CLEAR_RULE}</li>
          <li>Game-data changes compare the build in effect after the older patch with the build in effect after the newer one, so they include every patch in between.</li>
          <li>Differences between periods are observed, not explained: the player mix, the rest of the meta and events change too.</li>
        </ul>
      </details>
    </PageContainer>
  )
}

function Header() {
  return (
    <SectionHeader
      as="h1"
      eyebrow="Patch"
      title="Compare patches"
      description="Hero and item statistics in each patch’s first days, and every game-data change between the two."
    />
  )
}

function CompareSkeleton() {
  return (
    <LoadingState label="Loading the comparison">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-72" />
      </div>
    </LoadingState>
  )
}

async function Comparison({ patches, ia, ib, ctx }: { patches: PatchSummary[]; ia: number; ib: number; ctx: PatchContext }) {
  const [load, heroRefs, itemRefs] = await Promise.all([attempt('[patch compare] failed', getPatchCompare(patches, ia, ib, ctx)), heroCatalog().catch(() => new Map()), itemCatalog().catch(() => new Map())])
  if (!load.ok) return <DataNotice error={load.kind} what="Patch comparison" />
  const { older, newer, periods, heroes, items, diff, builds } = load.value
  const labels = { a: `${older.id} (${windowText(periods.older)})`, b: `${newer.id} (${windowText(periods.newer)})` }
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
        <SectionHeader id="cmp-heroes" title="Hero win rate changes" description={`${labels.a} → ${labels.b}. Observed differences between the two periods, not effects of the patches.`} />
        <ScopeLine scope={{ window: { kind: 'text', text: `${labels.a} vs ${labels.b}` }, rank: { kind: 'text', text: (await getScopeWording('en')).rankScope(ctx.rank) }, source: 'live' }} />
        {periods.newer.days < 3 && (
          <p role="status" className="rounded-md border border-orange/40 bg-orange/10 px-4 py-3 text-sm text-text">
            The newer patch has only {periods.newer.days} {periods.newer.days === 1 ? 'day' : 'days'} of data so far. Treat changes as early signals.
          </p>
        )}
        <MostImpacted up={moved.up} down={moved.down} marks={marks.heroes} labels={labels} />
        <MovementTable rows={heroRows} rateLabel="Pick rate" marks={marks.heroes} caption={`Hero win and pick rates, ${labels.a} vs ${labels.b}`} />
      </section>

      <section aria-labelledby="cmp-items" className="flex flex-col gap-5">
        <SectionHeader id="cmp-items" title="Item changes" description="Items changed in the game data between the two patches, plus any item whose win rate moved beyond normal variation." />
        {itemRows === null ? (
          <p className="text-sm text-text-muted">Item statistics are unavailable right now.</p>
        ) : itemRows.length > 0 ? (
          <MovementTable rows={itemRows} rateLabel="Buy rate" marks={marks.items} caption={`Item win and buy rates, ${labels.a} vs ${labels.b}`} />
        ) : (
          <p className="text-sm text-text-muted">No item changed or moved beyond normal variation in this scope.</p>
        )}
      </section>

      <section aria-labelledby="cmp-data" className="flex flex-col gap-5">
        <SectionHeader
          id="cmp-data"
          title="Game data between the patches"
          description={builds.from && builds.to ? `Build ${builds.from.version} → build ${builds.to.version}: every value that differs, across all patches in between.` : undefined}
        />
        {!grouped ? (
          <p className="text-sm text-text-muted">No game builds are available to compare for these patches.</p>
        ) : (
          <>
            <details open={grouped.heroes.length <= 6}>
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-primary hover:text-highlight">
                <h3 className="font-ui text-sm font-semibold">Heroes ({grouped.heroes.filter((h) => !ctx.hero || h.heroId === ctx.hero.id).length})</h3>
              </summary>
              <div className="mt-3">
                <HeroChangeCards heroes={grouped.heroes.filter((h) => !ctx.hero || h.heroId === ctx.hero.id)} refs={heroRefs} />
              </div>
            </details>
            <details open={grouped.items.length <= 6}>
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-primary hover:text-highlight">
                <h3 className="font-ui text-sm font-semibold">Items ({grouped.items.filter((i) => !ctx.item || i.id === ctx.item.id).length})</h3>
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
            {older.title}
          </Link>{' '}
          ·{' '}
          <Link href={patchHref(newer.id)} className="font-semibold text-primary hover:text-highlight">
            {newer.title}
          </Link>
        </p>
      </section>
    </div>
  )
}
