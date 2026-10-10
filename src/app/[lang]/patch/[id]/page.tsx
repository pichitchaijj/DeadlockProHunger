import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { OG_LOCALE, type Locale } from '@/i18n/config'
import { pageAlternates } from '@/i18n/seo'
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
import { BroadChanges, ChangeSummary, HeroChangeCards, ItemChangeCards, OfficialNotes } from '@/features/patches/components/changes'
import { MostImpacted, MovementTable } from '@/features/patches/components/impact'
import { PatchFilters } from '@/features/patches/components/PatchFilters'
import { findPatch, getPatchContext, patchDiffById, patchImpactById, patchNotes, type PatchContext } from '@/features/patches/loaders'
import { changeMarks, diffCounts, groupChanges, mostImpacted, noteCounts, type PatchSummary } from '@/features/patches/model'
import { compareHref, parsePatchQuery, patchHref, patchListHref, type PatchQuery } from '@/features/patches/query'
import { patchDate, patchTitle, windowRange, type PatchTranslate } from '@/features/patches/text'
import { getScopeWording } from '@/components/data/scopeWording'

type Params = Promise<{ id: string }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** The Patch catalog as a plain translator, for the pure wording helpers (features/patches/text.ts). */
async function patchWords(): Promise<{ t: Awaited<ReturnType<typeof getTranslations<'patch'>>>; tr: PatchTranslate; locale: Locale }> {
  const [t, locale] = await Promise.all([getTranslations('patch'), getLocale()])
  return { t, tr: (key, values) => t(key as 'untitled', values), locale: locale as Locale }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const [found, { t, tr, locale }] = await Promise.all([findPatch((await params).id).catch(() => null), patchWords()])
  if (!found) return { title: t('meta.listTitle') }
  const p = found.patches[found.index]
  const title = t('meta.detailTitle', { title: patchTitle(p, tr) })
  const description = t('meta.detailDescription', { date: patchDate(p.day, 'long', locale) })
  return { title, description, alternates: pageAlternates(`/patch/${p.id}`, locale), openGraph: { title, description, locale: OG_LOCALE[locale], type: 'website' } }
}

export default async function PatchPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ id }, raw, { t, tr, locale }, common] = await Promise.all([params, searchParams, patchWords(), getTranslations('common')])
  const query = parsePatchQuery(raw)
  const load = await attempt('[patch] list failed', findPatch(id))
  if (!load.ok) {
    return (
      <PageContainer>
        <DataNotice error={load.kind} what="Patch" action={<ButtonLink href={patchHref(id, query)} variant="secondary" size="sm">{common('tryAgain')}</ButtonLink>} />
      </PageContainer>
    )
  }
  if (!load.value) notFound()
  const { patches, index } = load.value
  const patch = patches[index]
  const older = patches[index + 1] ?? null
  const newer = index > 0 ? patches[index - 1] : null
  const [ctxLoad, heroes, items, words, heroesT] = await Promise.all([
    attempt('[patch] scope failed', getPatchContext(query)),
    heroOptions(),
    itemOptions(),
    getScopeWording(),
    getTranslations('heroes.list'),
  ])

  return (
    <PageContainer className="flex flex-col gap-(--spacing-section)">
      <div className="flex flex-col gap-6">
        <nav aria-label={t('detail.nav')} className="flex flex-wrap items-center justify-between gap-3 font-ui text-sm font-semibold">
          <Link href={patchListHref(query)} className="text-primary hover:text-highlight pointer-coarse:min-h-11">
            {t('detail.all')}
          </Link>
          <span className="flex gap-4">
            {older && (
              <Link href={patchHref(older.id, query)} className="text-primary hover:text-highlight pointer-coarse:min-h-11">
                {t('detail.older')}
              </Link>
            )}
            {newer && (
              <Link href={patchHref(newer.id, query)} className="text-primary hover:text-highlight pointer-coarse:min-h-11">
                {t('detail.newer')}
              </Link>
            )}
          </span>
        </nav>
        <SectionHeader
          as="h1"
          eyebrow={t('detail.eyebrow', { date: patchDate(patch.day, 'long', locale) })}
          title={patchTitle(patch, tr)}
          description={t('detail.description')}
          actions={
            older ? (
              <ButtonLink href={compareHref({ ...query, a: older.id, b: patch.id })} variant="secondary" size="sm">
                {t('list.compareWithPrevious')}
              </ButtonLink>
            ) : undefined
          }
        />
        {patch.links.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {patch.links.map((l) => (
              <li key={l.href}>
                <a href={l.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:text-highlight">
                  {t('links.external', { label: t(`links.${l.kind}`) })}
                </a>
              </li>
            ))}
          </ul>
        )}

        {!ctxLoad.ok ? (
          <DataNotice error={ctxLoad.kind} what="Patch statistics" />
        ) : typeof ctxLoad.value === 'string' ? (
          <EmptyState
            title={ctxLoad.value === 'unknown-hero' ? t('detail.unknownHero') : t('detail.unknownItem')}
            action={<ButtonLink href={patchHref(patch.id, { ...query, hero: 'all', item: 'all' })} variant="secondary" size="sm">{heroesT('clearFilters')}</ButtonLink>}
          />
        ) : (
          <PatchFilters
            query={query}
            href={(changes) => patchHref(patch.id, query, changes)}
            heroes={heroes}
            items={items}
            rankLabels={words.rankLabels(ctxLoad.value.scope.rankRefs)}
            ranks={ctxLoad.value.scope.ranks}
          >
            <SelectNav
              label={t('detail.picker')}
              options={patches.map((p) => ({ value: p.id, label: t('option', { id: p.id, title: patchTitle(p, tr) }) }))}
              value={patch.id}
              hrefFor={Object.fromEntries(patches.map((p) => [p.id, patchHref(p.id, query)]))}
            />
          </PatchFilters>
        )}
      </div>

      <section aria-labelledby="changed-title" className="flex flex-col gap-5">
        <SectionHeader id="changed-title" eyebrow={t('detail.changed.eyebrow')} title={t('detail.changed.title')} description={t('detail.changed.description')} />
        <Suspense key={patchHref(patch.id, query)} fallback={<SectionSkeleton label={t('detail.loadingChanges')} />}>
          <Changes patch={patch} query={query} ctx={ctxLoad.ok && typeof ctxLoad.value !== 'string' ? ctxLoad.value : null} />
        </Suspense>
      </section>

      {ctxLoad.ok && typeof ctxLoad.value !== 'string' && (
        <section aria-labelledby="impact-title" className="flex flex-col gap-5">
          <SectionHeader id="impact-title" eyebrow={t('detail.impact.eyebrow')} title={t('detail.impact.title')} description={t('detail.impact.description')} />
          <Suspense key={patchHref(patch.id, query)} fallback={<SectionSkeleton label={t('detail.loadingStats')} />}>
            <Impact patch={patch} ctx={ctxLoad.value} />
          </Suspense>
        </section>
      )}

      <details className="rounded-md border border-border bg-surface-sunken px-(--spacing-card) py-4 text-sm text-text-muted">
        <summary className="cursor-pointer py-3 font-ui font-semibold text-text">{t('detail.how.summary')}</summary>
        <ul className="mt-3 flex flex-col gap-1.5">
          {(['gameData', 'notes', 'direction', 'stats'] as const).map((key) => (
            <li key={key}>
              {t.rich(`detail.how.${key}`, {
                rule: key === 'direction' ? t('rules.direction') : t('rules.clear'),
                b: (chunks) => <span className="font-semibold text-text">{chunks}</span>,
              })}
            </li>
          ))}
        </ul>
      </details>
    </PageContainer>
  )
}

function SectionSkeleton({ label }: { label: string }) {
  return (
    <LoadingState label={label}>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24" />
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    </LoadingState>
  )
}

/** Matches a note line to the hero / item filters. */
const noteMatches = (subject: string | null, ctx: PatchContext | null) =>
  !ctx || (!ctx.hero && !ctx.item) || subject === ctx.hero?.name || subject === ctx.item?.name

async function Changes({ patch, query, ctx }: { patch: PatchSummary; query: PatchQuery; ctx: PatchContext | null }) {
  const [diffLoad, notesLoad, heroRefs, itemRefs, impact, { t, locale }, common] = await Promise.all([
    attempt('[patch] diff failed', patchDiffById(patch.id)),
    attempt('[patch] notes failed', patchNotes(patch)),
    heroCatalog().catch(() => new Map()),
    itemCatalog().catch(() => new Map()),
    ctx ? patchImpactById(patch.id, ctx).catch(() => null) : null,
    patchWords(),
    getTranslations('common'),
  ])
  const diff = diffLoad.ok ? diffLoad.value?.diff ?? null : null
  const builds = diffLoad.ok ? diffLoad.value : null
  const notes = notesLoad.ok ? notesLoad.value : null
  const filteredNotes = notes?.filter((l) => noteMatches(l.subject, ctx)) ?? null

  const grouped = diff ? groupChanges(diff.changes, diff.heroNames) : null
  const heroCards = grouped?.heroes.filter((h) => !ctx?.hero || h.heroId === ctx.hero.id) ?? []
  const itemCards = (grouped?.items.filter((i) => !ctx?.item || i.id === ctx.item.id) ?? []).sort((a, b) => b.changes.length - a.changes.length)
  const itemStats = impact?.items ? new Map(impact.items.map((m) => [m.id, m])) : null

  if (!diff && !notes) {
    if (!diffLoad.ok) return <DataNotice error={diffLoad.kind} what="Game data changes" action={<ButtonLink href={patchHref(patch.id, query)} variant="secondary" size="sm">{common('tryAgain')}</ButtonLink>} />
    return <EmptyState title={t('changes.noDataTitle')} description={t('changes.noDataDescription')} />
  }

  return (
    <div className="flex flex-col gap-8">
      {grouped ? <ChangeSummary counts={diffCounts(grouped.heroes, grouped.items)} source="game" /> : notes && <ChangeSummary counts={noteCounts(notes)} source="notes" />}

      {builds?.from && builds.to && diff && (
        <p className="text-caption text-text-muted">
          {t('changes.build', {
            from: builds.from.version,
            fromTime: patchDate(builds.from.builtAt, 'build', locale),
            to: builds.to.version,
            toTime: patchDate(builds.to.builtAt, 'build', locale),
          })}
        </p>
      )}
      {!diff && diffLoad.ok && <p className="rounded-md border border-dashed border-border-strong px-4 py-3 text-sm text-text-muted">{t('changes.noBuild')}</p>}
      {!diff && !diffLoad.ok && <DataNotice error={diffLoad.kind} what="Game data changes" />}

      {grouped && (
        <>
          <div className="flex flex-col gap-3">
            <h3 className="font-ui text-title font-semibold text-text">{t('changes.heroes')}</h3>
            {heroCards.length > 0 ? (
              <HeroChangeCards heroes={heroCards} refs={heroRefs} />
            ) : (
              <p className="text-sm text-text-muted">{ctx?.hero ? t('changes.noHeroesFor', { hero: ctx.hero.name }) : t('changes.noHeroes')}</p>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="font-ui text-title font-semibold text-text">{t('changes.items')}</h3>
            {itemCards.length > 0 ? (
              <ItemChangeCards items={itemCards} refs={itemRefs} stats={itemStats} />
            ) : (
              <p className="text-sm text-text-muted">{ctx?.item ? t('changes.noItemsFor', { item: ctx.item.name }) : t('changes.noItems')}</p>
            )}
          </div>
          <BroadChanges list={diff?.broad ?? []} />
        </>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="font-ui text-title font-semibold text-text">{t('changes.officialNotes')}</h3>
        {filteredNotes && filteredNotes.length > 0 ? (
          diff ? (
            <details className="group">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-ui text-sm font-semibold text-primary hover:text-highlight">
                {t('changes.showNotes', { count: filteredNotes.length })}
              </summary>
              <div className="mt-3">
                <OfficialNotes lines={filteredNotes} />
              </div>
            </details>
          ) : (
            <OfficialNotes lines={filteredNotes} />
          )
        ) : (
          <p className="text-sm text-text-muted">{notes ? t('changes.noNoteMatch') : t('changes.notesLinkOnly')}</p>
        )}
      </div>
    </div>
  )
}

async function Impact({ patch, ctx }: { patch: PatchSummary; ctx: PatchContext }) {
  const [load, diffLoad, { t, tr, locale }, words, heroesT, itemsT] = await Promise.all([
    attempt('[patch] impact failed', patchImpactById(patch.id, ctx)),
    patchDiffById(patch.id).catch(() => null),
    patchWords(),
    getScopeWording(),
    getTranslations('heroes.list'),
    getTranslations('items.table'),
  ])
  if (!load.ok) return <DataNotice error={load.kind} what="Patch statistics" />
  if (!load.value) return null
  const { before, after, heroes, items } = load.value
  if (!heroes) {
    return <EmptyState title={t('impact.noAfterTitle')} description={t('impact.noAfterDescription')} />
  }
  const grouped = diffLoad?.diff ? groupChanges(diffLoad.diff.changes, diffLoad.diff.heroNames) : null
  const marks = grouped ? changeMarks(grouped.heroes, grouped.items) : { heroes: new Map(), items: new Map() }
  const labels = {
    a: t('impact.before', { range: windowRange(before, 'short', locale, tr) }),
    b: t('impact.after', { range: windowRange(after, 'short', locale, tr) }),
  }
  const moved = mostImpacted(heroes)
  const heroRows = heroes.filter((h) => !ctx.hero || h.id === ctx.hero.id)
  const changedHeroes = heroRows.filter((h) => marks.heroes.has(h.id))
  const itemRows = items?.filter((i) => (ctx.item ? i.id === ctx.item.id : marks.items.has(i.id))) ?? null
  const sample = heroes.reduce((n, h) => n + (h.after?.matches ?? 0), 0)

  return (
    <div className="flex flex-col gap-8">
      <ScopeLine scope={{ window: { kind: 'text', text: t('impact.versus', labels) }, rank: { kind: 'text', text: words.rankScope(ctx.rank) }, sampleSize: Math.round(sample / 12), source: 'live' }} />
      {after.days < 3 && (
        <p role="status" className="rounded-md border border-orange/40 bg-orange/10 px-4 py-3 text-sm text-text">
          {t('impact.early', { count: after.days })}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="font-ui text-title font-semibold text-text">{t('impact.mostImpacted')}</h3>
        <p className="text-sm text-text-muted">{t('impact.mostImpactedNote', { rule: t('rules.clear') })}</p>
        <MostImpacted up={moved.up} down={moved.down} marks={marks.heroes} labels={labels} />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-ui text-title font-semibold text-text">{ctx.hero ? ctx.hero.name : t('impact.changedHeroes')}</h3>
        {(ctx.hero ? heroRows : changedHeroes).length > 0 ? (
          <MovementTable rows={ctx.hero ? heroRows : changedHeroes} rateLabel={heroesT('pickRate')} marks={marks.heroes} caption={t('impact.heroCaption')} />
        ) : (
          <p className="text-sm text-text-muted">{grouped ? t('impact.noChangedHeroes') : t('impact.noGameData')}</p>
        )}
        {!ctx.hero && (
          <details>
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-ui text-sm font-semibold text-primary hover:text-highlight">
              {t('impact.allHeroes', { count: heroRows.length })}
            </summary>
            <div className="mt-3">
              <MovementTable
                rows={[...heroRows].sort((a, b) => (b.winDelta ?? -1) - (a.winDelta ?? -1))}
                rateLabel={heroesT('pickRate')}
                marks={marks.heroes}
                caption={t('impact.allCaption')}
              />
            </div>
          </details>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-ui text-title font-semibold text-text">{ctx.item ? ctx.item.name : t('impact.changedItems')}</h3>
        {itemRows === null ? (
          <p className="text-sm text-text-muted">{t('impact.itemsUnavailable')}</p>
        ) : itemRows.length > 0 ? (
          <MovementTable rows={itemRows} rateLabel={itemsT('buyRate')} marks={marks.items} caption={t('impact.itemCaption')} />
        ) : (
          <p className="text-sm text-text-muted">{ctx.item ? t('impact.itemLowPurchases') : t('impact.noChangedItems')}</p>
        )}
      </div>
    </div>
  )
}
