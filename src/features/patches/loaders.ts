import 'server-only'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { stableKey } from '@/lib/cache/stableKey'
import { getHeroStatsByDay, getHeroTotals, getPatchFeed, throughDay, type HeroStatsQuery } from '@/lib/deadlock/endpoints'
import { getItemStatsByDay, getItemTotals } from '@/lib/deadlock/itemEndpoints'
import { buildBefore, getAssetSnapshot } from '@/lib/deadlock/patchEndpoints'
import { heroCatalog, itemCatalog } from '@/features/items/loaders'
import type { HeroRef, ItemRef } from '@/features/items/model'
import { resolveScope, type ResolvedScope } from '@/features/meta/scope'
import { diffSnapshots, snapshotEntities, splitBroadChanges, type BroadChange, type EntityChange } from './diff'
import { heroPickRates, itemBuyRates, movements, patchPeriod, patchesFromFeed, patchWindows, sumWindow, type Movement, type PatchSummary, type Window } from './model'
import { parseNotes, type NoteLine } from './notes'
import type { PatchQuery } from './query'

/*
 * Patch pages. Sources: /v2/patches (dates, names, official notes), versioned game assets (before → after
 * values, lib/deadlock/patchEndpoints.ts) and the same analytics as Meta / Items. Loaders throw; pages wrap
 * them in `attempt()`. Nothing here needs DATABASE_URL.
 */

const DAY = 86_400

/** Patches from the feed, newest first (memoized per request; the feed itself is cached 1h). */
export const patchList = cache(async (): Promise<PatchSummary[]> => patchesFromFeed(await getPatchFeed()))

export async function findPatch(id: string): Promise<{ patches: PatchSummary[]; index: number } | null> {
  const patches = await patchList()
  const index = patches.findIndex((p) => p.id === id)
  return index < 0 ? null : { patches, index }
}

const names = cache(async () => {
  const [heroes, items] = await Promise.all([heroCatalog(), itemCatalog()])
  return { heroes: [...heroes.values()].map((h) => h.name), items: [...items.values()].map((i) => i.name) }
})

/** Parsed official notes, or null when the feed has only a link for this patch. */
export async function patchNotes(patch: PatchSummary): Promise<NoteLine[] | null> {
  if (!patch.notesHtml) return null
  const n = await names()
  return parseNotes(patch.notesHtml, n.heroes, n.items)
}

// ── Game-data diff ───────────────────────────────────────────────────

export type BuildRef = { version: number; builtAt: number }
export type GameDiff = { from: BuildRef; to: BuildRef; changes: EntityChange[]; broad: BroadChange[]; heroNames: Record<number, string> }

/** A diff between two fixed builds never changes; the key is the pair. Bump the key if the diff rules change. */
const cachedDiff = unstable_cache(
  stableKey('patch-diff', async (from: number, to: number) => {
    // Sequential: each snapshot is ~8 MB of JSON; parsing both at once doubles peak memory for little gain.
    const before = snapshotEntities(await getAssetSnapshot(from))
    const after = snapshotEntities(await getAssetSnapshot(to))
    const heroNames: Record<number, string> = {}
    for (const e of [...before.values(), ...after.values()]) if (e.kind === 'hero') heroNames[e.id] = e.name
    return { ...splitBroadChanges(diffSnapshots(before, after)), heroNames }
  }),
  ['patch-diff-v2'],
  { revalidate: 30 * DAY, tags: ['assets'] },
)

async function diffBetween(from: BuildRef | null, to: BuildRef | null): Promise<GameDiff | null> {
  if (!from || !to || from.version === to.version) return null
  return { from, to, ...(await cachedDiff(from.version, to.version)) }
}

/** The build in effect at the end of a patch's first day (or just before the next patch). */
const patchBuild = (patches: PatchSummary[], index: number) => buildBefore(Math.min(patches[index].day + DAY, index > 0 ? patches[index - 1].day : Infinity))

/**
 * What the game files changed on the patch day: the last build before the patch day vs the last build of
 * that day. Null when no build is dated on the patch day (the API has no build for it).
 */
export const patchDiffById = cache(async (id: string) => {
  const found = await findPatch(id)
  return found ? getPatchDiff(found.patches, found.index) : null
})

export async function getPatchDiff(patches: PatchSummary[], index: number): Promise<{ from: BuildRef | null; to: BuildRef | null; diff: GameDiff | null }> {
  const [from, to] = await Promise.all([buildBefore(patches[index].day), patchBuild(patches, index)])
  return { from, to, diff: await diffBetween(from, to) }
}

// ── Scope ────────────────────────────────────────────────────────────

export type PatchContext = { scope: ResolvedScope; hero: HeroRef | null; item: ItemRef | null; rankText: string }

/** Rank / match type through the shared scope; hero and item slugs resolved. `unknown` when a slug doesn't match. */
export const getPatchContext = (query: PatchQuery) => patchContext(query.hero, query.item, query.rank, query.mode)

// Memoized per request on primitives, so every section of a page gets the same context object.
const patchContext = cache(async (heroSlug: string, itemSlug: string, rank: PatchQuery['rank'], mode: PatchQuery['mode']): Promise<PatchContext | 'unknown-hero' | 'unknown-item'> => {
  const [scope, heroes, items] = await Promise.all([resolveScope({ window: '7d', rank, mode }), heroCatalog(), itemCatalog()])
  const hero = heroSlug === 'all' ? null : ([...heroes.values()].find((h) => h.slug === heroSlug) ?? undefined)
  if (hero === undefined) return 'unknown-hero'
  const item = itemSlug === 'all' ? null : ([...items.values()].find((i) => i.slug === itemSlug) ?? undefined)
  if (item === undefined) return 'unknown-item'
  return { scope, hero, item, rankText: `${scope.rankLabels[scope.band.id]}${scope.modeText}` }
})

/** Analytics query for [from, to) (whole UTC days; see throughDay), end capped at the current hour. */
const rangeQuery = (ctx: PatchContext, w: { from: number; to: number }): HeroStatsQuery => ({
  ...ctx.scope.statsQuery,
  minUnix: w.from,
  maxUnix: Math.min(throughDay(w.to - DAY), ctx.scope.hour),
})

// ── Before / after ───────────────────────────────────────────────────

export type HeroMovement = Movement & HeroRef
export type ItemMovement = Movement & ItemRef

function attach<R extends { id: number }>(rows: Movement[], refs: Map<number, R>) {
  return rows.flatMap((m) => {
    const ref = refs.get(m.id)
    return ref && (m.before || m.after) ? [{ ...ref, ...m }] : []
  })
}

/**
 * Hero and item win / pick rates in the 7 days before vs the days after the patch. One day-bucketed call
 * each for heroes and items covers both windows. `null` when there is no "after" day yet.
 */
export const patchImpactById = cache(async (id: string, ctx: PatchContext) => {
  const found = await findPatch(id)
  return found ? getPatchImpact(found.patches, found.index, ctx) : null
})

export async function getPatchImpact(patches: PatchSummary[], index: number, ctx: PatchContext) {
  const { before, after } = patchWindows(patches, index, ctx.scope.today)
  if (before.days === 0 || after.days === 0) return { before, after, heroes: null, items: null }
  const q = rangeQuery(ctx, { from: before.from, to: after.to })
  const [heroRows, itemRows, heroes, items] = await Promise.all([getHeroStatsByDay(q), getItemStatsByDay(q).catch(() => null), heroCatalog(), itemCatalog()])
  const hRows = heroRows.map((r) => ({ id: r.hero_id, day: r.bucket, wins: r.wins, matches: r.matches }))
  const hb = sumWindow(hRows, before)
  const ha = sumWindow(hRows, after)
  const heroMoves = attach(movements([...heroes.keys()], hb, ha, { a: heroPickRates(hb), b: heroPickRates(ha) }), heroes)

  let itemMoves: ItemMovement[] | null = null
  if (itemRows) {
    const iRows = itemRows.map((r) => ({ id: r.item_id, day: r.bucket, wins: r.wins, matches: r.matches }))
    const ib = sumWindow(iRows, before)
    const ia = sumWindow(iRows, after)
    // Each period's buy rates use that period's own player-matches.
    itemMoves = attach(movements([...items.keys()], ib, ia, { a: itemBuyRates(ib, hb), b: itemBuyRates(ia, ha) }), items)
  }
  return { before, after, heroes: heroMoves, items: itemMoves }
}

// ── Compare two patches ──────────────────────────────────────────────

async function periodTotals(ctx: PatchContext, w: Window) {
  const q = rangeQuery(ctx, w)
  const [heroes, items] = await Promise.all([getHeroTotals(q), getItemTotals(q).catch(() => null)])
  return {
    heroes: new Map(heroes.map((h) => [h.hero_id, { wins: h.wins, matches: h.matches }])),
    items: items ? new Map(items.map((i) => [i.item_id, { wins: i.wins, matches: i.matches }])) : null,
  }
}

/**
 * Patch A's period vs patch B's period (each from its patch day to the next patch, at most 7 days), and the
 * game-data diff between the builds in effect after each. A is the older patch.
 */
export async function getPatchCompare(patches: PatchSummary[], ia: number, ib: number, ctx: PatchContext) {
  const [older, newer] = patches[ia].day <= patches[ib].day ? [ia, ib] : [ib, ia]
  const pa = patchPeriod(patches, older, ctx.scope.today)
  const pb = patchPeriod(patches, newer, ctx.scope.today)
  const [ta, tb, heroes, items, fromBuild, toBuild] = await Promise.all([
    periodTotals(ctx, pa),
    periodTotals(ctx, pb),
    heroCatalog(),
    itemCatalog(),
    patchBuild(patches, older),
    patchBuild(patches, newer),
  ])
  const heroMoves = attach(movements([...heroes.keys()], ta.heroes, tb.heroes, { a: heroPickRates(ta.heroes), b: heroPickRates(tb.heroes) }), heroes)
  const itemMoves =
    ta.items && tb.items
      ? attach(movements([...items.keys()], ta.items, tb.items, { a: itemBuyRates(ta.items, ta.heroes), b: itemBuyRates(tb.items, tb.heroes) }), items)
      : null
  const diff = await diffBetween(fromBuild, toBuild).catch(() => null)
  return { older: patches[older], newer: patches[newer], periods: { older: pa, newer: pb }, heroes: heroMoves, items: itemMoves, diff, builds: { from: fromBuild, to: toBuild } }
}
