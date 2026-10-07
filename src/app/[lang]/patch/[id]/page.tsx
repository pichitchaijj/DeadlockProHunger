import type { Metadata } from 'next'
import { Link } from '@/i18n/navigation'
import { notFound } from 'next/navigation'
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
import { BroadChanges, ChangeSummary, HeroChangeCards, ItemChangeCards, OfficialNotes } from '@/features/patches/components/changes'
import { MostImpacted, MovementTable } from '@/features/patches/components/impact'
import { PatchFilters } from '@/features/patches/components/PatchFilters'
import { DIRECTION_RULE } from '@/features/patches/direction'
import { findPatch, getPatchContext, patchDiffById, patchImpactById, patchNotes, type PatchContext } from '@/features/patches/loaders'
import { changeMarks, CLEAR_RULE, diffCounts, groupChanges, mostImpacted, noteCounts, type PatchSummary, type Window } from '@/features/patches/model'
import { compareHref, parsePatchQuery, patchHref, patchListHref, type PatchQuery } from '@/features/patches/query'

type Params = Promise<{ id: string }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

const DATE = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const BUILD = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
const DAY = 86_400

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const found = await findPatch((await params).id).catch(() => null)
  if (!found) return { title: 'Patch' }
  const p = found.patches[found.index]
  return { title: `${p.title} · Patch`, description: `What changed in the ${DATE.format(p.day * 1000)} Deadlock patch, and hero and item statistics before and after it.` }
}

export default async function PatchPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ id }, raw] = await Promise.all([params, searchParams])
  const query = parsePatchQuery(raw)
  const load = await attempt('[patch] list failed', findPatch(id))
  if (!load.ok) {
    return (
      <PageContainer>
        <DataNotice error={load.kind} what="Patch" action={<ButtonLink href={patchHref(id, query)} variant="secondary" size="sm">Try again</ButtonLink>} />
      </PageContainer>
    )
  }
  if (!load.value) notFound()
  const { patches, index } = load.value
  const patch = patches[index]
  const older = patches[index + 1] ?? null
  const newer = index > 0 ? patches[index - 1] : null
  const [ctxLoad, heroes, items] = await Promise.all([attempt('[patch] scope failed', getPatchContext(query)), heroOptions(), itemOptions()])

  return (
    <PageContainer className="flex flex-col gap-(--spacing-section)">
      <div className="flex flex-col gap-6">
        <nav aria-label="Patches" className="flex flex-wrap items-center justify-between gap-3 font-ui text-sm font-semibold">
          <Link href={patchListHref(query)} className="text-primary hover:text-highlight pointer-coarse:min-h-11">
            ← All patches
          </Link>
          <span className="flex gap-4">
            {older && (
              <Link href={patchHref(older.id, query)} className="text-primary hover:text-highlight pointer-coarse:min-h-11">
                ‹ Older
              </Link>
            )}
            {newer && (
              <Link href={patchHref(newer.id, query)} className="text-primary hover:text-highlight pointer-coarse:min-h-11">
                Newer ›
              </Link>
            )}
          </span>
        </nav>
        <SectionHeader
          as="h1"
          eyebrow={`Patch · ${DATE.format(patch.day * 1000)}`}
          title={patch.title}
          description="What the game data changed, the official notes, and what hero and item statistics did around the patch."
          actions={
            older ? (
              <ButtonLink href={compareHref({ ...query, a: older.id, b: patch.id })} variant="secondary" size="sm">
                Compare with previous patch
              </ButtonLink>
            ) : undefined
          }
        />
        {patch.links.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {patch.links.map((l) => (
              <li key={l.href}>
                <a href={l.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:text-highlight">
                  {l.label} ↗
                </a>
              </li>
            ))}
          </ul>
        )}

        {!ctxLoad.ok ? (
          <DataNotice error={ctxLoad.kind} what="Patch statistics" />
        ) : typeof ctxLoad.value === 'string' ? (
          <EmptyState
            title={ctxLoad.value === 'unknown-hero' ? 'Unknown hero' : 'Unknown item'}
            action={<ButtonLink href={patchHref(patch.id, { ...query, hero: 'all', item: 'all' })} variant="secondary" size="sm">Clear filters</ButtonLink>}
          />
        ) : (
          <PatchFilters
            query={query}
            href={(changes) => patchHref(patch.id, query, changes)}
            heroes={heroes}
            items={items}
            rankLabels={ctxLoad.value.scope.rankLabels}
            ranks={ctxLoad.value.scope.ranks}
          >
            <SelectNav
              label="Patch"
              options={patches.map((p) => ({ value: p.id, label: `${p.id} · ${p.title}` }))}
              value={patch.id}
              hrefFor={Object.fromEntries(patches.map((p) => [p.id, patchHref(p.id, query)]))}
            />
          </PatchFilters>
        )}
      </div>

      <section aria-labelledby="changed-title" className="flex flex-col gap-5">
        <SectionHeader id="changed-title" eyebrow="Layer 1" title="What changed" description="Values come from the game files of the builds before and after the patch day; the official notes follow." />
        <Suspense key={patchHref(patch.id, query)} fallback={<SectionSkeleton label="Loading changes" />}>
          <Changes patch={patch} query={query} ctx={ctxLoad.ok && typeof ctxLoad.value !== 'string' ? ctxLoad.value : null} />
        </Suspense>
      </section>

      {ctxLoad.ok && typeof ctxLoad.value !== 'string' && (
        <section aria-labelledby="impact-title" className="flex flex-col gap-5">
          <SectionHeader
            id="impact-title"
            eyebrow="Layer 2"
            title="Around the patch"
            description="Statistics observed before and after the patch day. They show timing, not cause: player mix, other heroes and other changes move win rates too."
          />
          <Suspense key={patchHref(patch.id, query)} fallback={<SectionSkeleton label="Loading statistics" />}>
            <Impact patch={patch} ctx={ctxLoad.value} />
          </Suspense>
        </section>
      )}

      <details className="rounded-md border border-border bg-surface-sunken px-(--spacing-card) py-4 text-sm text-text-muted">
        <summary className="cursor-pointer py-3 font-ui font-semibold text-text">How this page works</summary>
        <ul className="mt-3 flex flex-col gap-1.5">
          <li>
            <span className="font-semibold text-text">Game data</span>: every value is read from the game files the data source parses per build. The “before” build is the last
            one before the patch day; the “after” build is the last one of the patch day (or before the next patch).
          </li>
          <li>
            <span className="font-semibold text-text">Official notes</span>: shown when the feed carries them (Steam “Minor Update” posts). A before → after appears only when a line
            states “from X to Y”.
          </li>
          <li>
            <span className="font-semibold text-text">Buff / nerf</span>: {DIRECTION_RULE}
          </li>
          <li>
            <span className="font-semibold text-text">Before / after statistics</span>: the 7 days before the patch day (not before the previous patch) vs up to 7 days from it (not
            past the next patch). “Clear change”: {CLEAR_RULE}
          </li>
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
  const [diffLoad, notesLoad, heroRefs, itemRefs, impact] = await Promise.all([
    attempt('[patch] diff failed', patchDiffById(patch.id)),
    attempt('[patch] notes failed', patchNotes(patch)),
    heroCatalog().catch(() => new Map()),
    itemCatalog().catch(() => new Map()),
    ctx ? patchImpactById(patch.id, ctx).catch(() => null) : null,
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
    if (!diffLoad.ok) return <DataNotice error={diffLoad.kind} what="Game data changes" action={<ButtonLink href={patchHref(patch.id, query)} variant="secondary" size="sm">Try again</ButtonLink>} />
    return (
      <EmptyState
        title="No change data for this patch"
        description="No game build is dated on this patch day, and the feed has no official notes for it. Use the official changelog link above."
      />
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {grouped ? (
        <ChangeSummary counts={diffCounts(grouped.heroes, grouped.items)} source="from game data" />
      ) : (
        notes && <ChangeSummary counts={noteCounts(notes)} source="from the official notes" />
      )}

      {builds?.from && builds.to && diff && (
        <p className="text-caption text-text-muted">
          Game data: build {builds.from.version} ({BUILD.format(builds.from.builtAt * 1000)} UTC) → build {builds.to.version} ({BUILD.format(builds.to.builtAt * 1000)} UTC).
        </p>
      )}
      {!diff && diffLoad.ok && (
        <p className="rounded-md border border-dashed border-border-strong px-4 py-3 text-sm text-text-muted">
          No game build is dated on this patch day, so values can’t be compared from game data. The official notes below are the source.
        </p>
      )}
      {!diff && !diffLoad.ok && <DataNotice error={diffLoad.kind} what="Game data changes" />}

      {grouped && (
        <>
          <div className="flex flex-col gap-3">
            <h3 className="font-ui text-title font-semibold text-text">Heroes</h3>
            {heroCards.length > 0 ? <HeroChangeCards heroes={heroCards} refs={heroRefs} /> : <p className="text-sm text-text-muted">No hero values changed{ctx?.hero ? ` for ${ctx.hero.name}` : ''}.</p>}
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="font-ui text-title font-semibold text-text">Most changed items</h3>
            {itemCards.length > 0 ? (
              <ItemChangeCards items={itemCards} refs={itemRefs} stats={itemStats} />
            ) : (
              <p className="text-sm text-text-muted">No shop item values changed{ctx?.item ? ` for ${ctx.item.name}` : ''}.</p>
            )}
          </div>
          <BroadChanges list={diff?.broad ?? []} />
        </>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="font-ui text-title font-semibold text-text">Official notes</h3>
        {filteredNotes && filteredNotes.length > 0 ? (
          diff ? (
            <details className="group">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-ui text-sm font-semibold text-primary hover:text-highlight">
                Show the official notes ({filteredNotes.length} lines)
              </summary>
              <div className="mt-3">
                <OfficialNotes lines={filteredNotes} />
              </div>
            </details>
          ) : (
            <OfficialNotes lines={filteredNotes} />
          )
        ) : (
          <p className="text-sm text-text-muted">
            {notes ? 'No note lines match the hero or item filter.' : 'The data feed only links to the notes for this patch. Use the official changelog link above.'}
          </p>
        )}
      </div>
    </div>
  )
}

const windowText = (w: Window) => `${SHORT.format(w.from * 1000)}–${SHORT.format((w.to - DAY) * 1000)}`

async function Impact({ patch, ctx }: { patch: PatchSummary; ctx: PatchContext }) {
  const [load, diffLoad] = await Promise.all([attempt('[patch] impact failed', patchImpactById(patch.id, ctx)), patchDiffById(patch.id).catch(() => null)])
  if (!load.ok) return <DataNotice error={load.kind} what="Patch statistics" />
  if (!load.value) return null
  const { before, after, heroes, items } = load.value
  if (!heroes) {
    return <EmptyState title="No days after the patch yet" description="Statistics after the patch start with the patch day. Check back tomorrow." />
  }
  const grouped = diffLoad?.diff ? groupChanges(diffLoad.diff.changes, diffLoad.diff.heroNames) : null
  const marks = grouped ? changeMarks(grouped.heroes, grouped.items) : { heroes: new Map(), items: new Map() }
  const labels = { a: `Before (${windowText(before)})`, b: `After (${windowText(after)})` }
  const moved = mostImpacted(heroes)
  const heroRows = heroes.filter((h) => !ctx.hero || h.id === ctx.hero.id)
  const changedHeroes = heroRows.filter((h) => marks.heroes.has(h.id))
  const itemRows = items?.filter((i) => (ctx.item ? i.id === ctx.item.id : marks.items.has(i.id))) ?? null
  const sample = heroes.reduce((n, h) => n + (h.after?.matches ?? 0), 0)

  return (
    <div className="flex flex-col gap-8">
      <ScopeLine scope={{ windowLabel: `${labels.a} vs ${labels.b}`, rankLabel: ctx.rankText, sampleSize: Math.round(sample / 12), source: 'live' }} />
      {after.days < 3 && (
        <p role="status" className="rounded-md border border-orange/40 bg-orange/10 px-4 py-3 text-sm text-text">
          Only {after.days} {after.days === 1 ? 'day' : 'days'} after the patch so far (the latest day is incomplete). Treat changes as early signals.
        </p>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="font-ui text-title font-semibold text-text">Most impacted heroes</h3>
        <p className="text-sm text-text-muted">Heroes whose win rate moved beyond normal variation. {CLEAR_RULE}</p>
        <MostImpacted up={moved.up} down={moved.down} marks={marks.heroes} labels={labels} />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-ui text-title font-semibold text-text">{ctx.hero ? ctx.hero.name : 'Heroes changed in this patch'}</h3>
        {(ctx.hero ? heroRows : changedHeroes).length > 0 ? (
          <MovementTable rows={ctx.hero ? heroRows : changedHeroes} rateLabel="Pick rate" marks={marks.heroes} caption="Hero win and pick rates before and after the patch" />
        ) : (
          <p className="text-sm text-text-muted">{grouped ? 'No hero values changed in this patch.' : 'Game data for this patch isn’t available, so changed heroes can’t be marked.'}</p>
        )}
        {!ctx.hero && (
          <details>
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-ui text-sm font-semibold text-primary hover:text-highlight">All heroes ({heroRows.length})</summary>
            <div className="mt-3">
              <MovementTable rows={[...heroRows].sort((a, b) => (b.winDelta ?? -1) - (a.winDelta ?? -1))} rateLabel="Pick rate" marks={marks.heroes} caption="All heroes before and after the patch" />
            </div>
          </details>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-ui text-title font-semibold text-text">{ctx.item ? ctx.item.name : 'Items changed in this patch'}</h3>
        {itemRows === null ? (
          <p className="text-sm text-text-muted">Item statistics are unavailable right now.</p>
        ) : itemRows.length > 0 ? (
          <MovementTable rows={itemRows} rateLabel="Buy rate" marks={marks.items} caption="Item win and buy rates before and after the patch" />
        ) : (
          <p className="text-sm text-text-muted">{ctx.item ? 'Not enough purchases of this item around the patch.' : 'No changed shop item has enough purchases around the patch.'}</p>
        )}
      </div>
    </div>
  )
}
