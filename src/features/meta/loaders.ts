import 'server-only'
import type { RankCatalog } from '@/lib/deadlock/rankAssets'
import { cache } from 'react'
import type { ScopeRank, ScopeWindow, StatScope } from '@/lib/analytics/scope'
import { badgeRange, RANK_BANDS, type RankBandId } from '@/lib/analytics/rankBands'
import { DeadlockApiError } from '@/lib/deadlock/client'
import { classifyError, type DataErrorKind } from '@/lib/deadlock/errors'
import { softFail } from '@/lib/deadlock/softFail'
import { utcDay } from '@/lib/db/mappers'
import { heroStatsFromHistory } from '@/lib/db/store'
import { getActiveHeroes, getBadgeDistribution, getHeroStatsByDay } from '@/lib/deadlock/endpoints'
import { buildMetaModel, type MetaModel } from './model'
import type { MetaQuery, MetaWindow } from './query'
import { ANALYTICS_KEY_STEP, resolveScope } from './scope'
import { heroIconUrl } from '@/lib/deadlock/heroImages'

const DAY = 86_400
/** A patch window shorter than this is flagged as limited data. */
const MIN_PATCH_DAYS = 3

export type MetaPageData =
  | {
      ok: true
      model: MetaModel
      scope: StatScope
      /** Every window and rank band as scope values (filters word them per locale). */
      windows: Record<MetaWindow, ScopeWindow>
      rankRefs: Record<RankBandId, ScopeRank>
      /** Rank tiers with emblems (lib/deadlock/rankAssets). */
      ranks: RankCatalog
      /** Share of ranked players (latest ranked match) whose rank falls in each band; null if unavailable. */
      rankShares: Record<RankBandId, number> | null
      patch: { title: string; startedAt: number; days: number; limited: boolean } | null
    }
  | { ok: false; message: string; kind: DataErrorKind }

/**
 * React `cache` compares object arguments by identity, so callers that build equal queries (Hero
 * Detail, Analyze, Compare) would each recompute the model. Keying on the serialized query (sorted
 * keys) makes equal queries share one computation per request.
 */
export function getMetaPageData(query: MetaQuery): Promise<MetaPageData> {
  return loadMetaPageData(JSON.stringify(Object.fromEntries(Object.entries(query).sort(([a], [b]) => a.localeCompare(b)))))
}

/*
 * Short process-local reuse of a successful live result: at most MEMO_MS, within one analytics key step and UTC day
 * (the buckets every input's cache key and the scope's dates come from). React `cache` above memoizes only inside a
 * React render; in route handlers (cron prewarm, /api/search) it is a pass-through, so each caller rebuilt the same
 * model from the same cached inputs.
 * - Concurrent callers of one key share one computation (the promise is stored before it settles).
 * - Failures (`ok: false`), database snapshots and rejections are dropped once settled: the next call retries.
 * - A computation whose start straddles a bucket boundary is never stored (it read the clock in both buckets).
 * - Results are deep-frozen before any caller sees them: one object now reaches several requests, so an in-place
 *   change must fail loudly instead of leaking into other requests. None of its objects is shared with another cache.
 */
const MEMO_MS = 30_000
const MEMO_MAX = 64
type MemoEntry = { at: number; value: Promise<MetaPageData> }
const memo = new Map<string, MemoEntry>()

/** The time bucket a result belongs to: the analytics key step and the UTC day (both read from the clock). */
const timeBucket = (ms: number) => `${Math.floor(ms / 1000 / ANALYTICS_KEY_STEP)}|${Math.floor(ms / 1000 / DAY)}`

/** For tests: clear the memo between cases that change upstream fixtures within one module instance. */
export function resetMetaMemoForTests(): void {
  memo.clear()
}

/** For tests: how many entries the memo holds. */
export function metaMemoSizeForTests(): number {
  return memo.size
}

const loadMetaPageData = cache((key: string): Promise<MetaPageData> => {
  const started = Date.now()
  const bucket = timeBucket(started)
  const memoKey = `${key}|${bucket}`
  const hit = memo.get(memoKey)
  if (hit && started - hit.at < MEMO_MS) return hit.value

  // Starts synchronously: every clock read of the computation (resolveScope, the distribution day) happens here.
  const value = computeMetaPageData(key).then(deepFreeze)
  if (timeBucket(Date.now()) !== bucket) return value // straddled a boundary: not stored under either bucket

  // Expired entries are removed, not just skipped; the key is re-inserted last, so eviction stays oldest-first.
  for (const [k, entry] of memo) if (started - entry.at >= MEMO_MS) memo.delete(k)
  memo.delete(memoKey)
  while (memo.size >= MEMO_MAX) {
    const oldest = memo.keys().next()
    if (oldest.done) break
    memo.delete(oldest.value)
  }
  const entry: MemoEntry = { at: started, value }
  memo.set(memoKey, entry)

  // Only this entry is ever removed here, so a settled old computation can't remove a newer one for the same key.
  const drop = () => {
    if (memo.get(memoKey) === entry) memo.delete(memoKey)
  }
  value.then((result) => {
    if (!result.ok || result.scope.source !== 'live') drop()
  }, drop)
  return value
})

/** Freezes a freshly built result and every object in it. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value)) deepFreeze(nested)
  }
  return value
}

/** Failures are returned as `{ ok: false }` (below), so this settles with a value in every expected case. */
async function computeMetaPageData(key: string): Promise<MetaPageData> {
  const query = JSON.parse(key) as MetaQuery
  try {
    const [scopeInfo, heroes, distribution] = await Promise.all([
      resolveScope(query),
      getActiveHeroes(),
      softFail(getBadgeDistribution(Math.floor(Date.now() / 1000 / DAY) * DAY - 29 * DAY), null),
    ])
    const { today, window, windowStart, band, rankRefs, windows } = scopeInfo
    const latest = scopeInfo.patches[0] ?? null
    const patchStart = latest?.day ?? null

    // Always include the previous 7 days so the weekly trend can be computed.
    const minUnix = Math.min(windowStart, today - 13 * DAY)
    const fallback: { at: Date | null } = { at: null }
    const rows = await getHeroStatsByDay({ ...scopeInfo.statsQuery, minUnix }).catch(async (error) => {
      // Live analytics failed: our own daily history stands in when it covers every day of the window.
      // It stores the default match mode only, so a "ranked only" view has no fallback.
      const history = query.mode === 'all' ? await heroStatsFromHistory({ from: utcDay(minUnix), to: utcDay(today), rankBand: band.id }) : null
      if (!history) throw error
      fallback.at = history.syncedAt
      return history.rows
    })
    const patchDays = patchStart === null ? 0 : Math.floor((today - patchStart) / DAY) + 1

    const model = buildMetaModel({
      heroes: heroes.map((h) => ({
        id: h.id,
        name: h.name,
        className: h.class_name,
        role: h.hero_type ?? null,
        iconUrl: heroIconUrl(h.images),
      })),
      rows: rows.map((r) => ({
        heroId: r.hero_id,
        day: r.bucket,
        wins: r.wins,
        matches: r.matches,
        kills: r.total_kills,
        deaths: r.total_deaths,
        assists: r.total_assists,
        netWorth: r.total_net_worth,
      })),
      query: { ...query, window },
      windowStart,
      today,
      scope: scopeInfo.selected,
    })

    return {
      ok: true,
      model,
      scope: {
        window: windows[window],
        rank: rankRefs[band.id],
        ranked: scopeInfo.ranked,
        sampleSize: model.summary.matchesAnalyzed,
        ...(fallback.at ? { source: 'snapshot' as const, fetchedAt: fallback.at.getTime() } : { source: 'live' as const }),
      },
      windows,
      rankRefs,
      ranks: scopeInfo.ranks,
      rankShares: distribution ? bandShares(distribution) : null,
      patch: latest ? { title: latest.title, startedAt: latest.day * 1000, days: patchDays, limited: patchDays < MIN_PATCH_DAYS } : null,
    }
  } catch (error) {
    const detail = error instanceof DeadlockApiError ? ` (${error.status ?? 'network'} on ${error.path})` : ''
    console.error(`[meta] data load failed${detail}`, error)
    return { ok: false, message: 'The Deadlock data source didn’t respond as expected.', kind: classifyError(error) }
  }
}

/** Share of ranked players per band, from badge-distribution `unique_players` (badge 0 = unranked, excluded). */
function bandShares(distribution: Awaited<ReturnType<typeof getBadgeDistribution>>): Record<RankBandId, number> {
  const ranked = distribution.filter((d) => d.badge_level > 0)
  const total = ranked.reduce((n, d) => n + d.unique_players, 0)
  return Object.fromEntries(
    RANK_BANDS.map((band) => {
      const range = badgeRange(band)
      const players = range ? ranked.filter((d) => d.badge_level >= range.min && d.badge_level <= range.max).reduce((n, d) => n + d.unique_players, 0) : total
      return [band.id, total > 0 ? players / total : 0]
    }),
  ) as Record<RankBandId, number>
}
