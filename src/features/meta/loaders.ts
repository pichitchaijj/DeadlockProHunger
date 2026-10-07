import 'server-only'
import type { RankCatalog } from '@/lib/deadlock/rankAssets'
import { cache } from 'react'
import type { StatScope } from '@/lib/analytics/scope'
import { badgeRange, RANK_BANDS, type RankBandId } from '@/lib/analytics/rankBands'
import { DeadlockApiError } from '@/lib/deadlock/client'
import { classifyError, type DataErrorKind } from '@/lib/deadlock/errors'
import { utcDay } from '@/lib/db/mappers'
import { heroStatsFromHistory } from '@/lib/db/store'
import { getActiveHeroes, getBadgeDistribution, getHeroStatsByDay } from '@/lib/deadlock/endpoints'
import { buildMetaModel, type MetaModel } from './model'
import type { MetaQuery, MetaWindow } from './query'
import { resolveScope } from './scope'
import { heroIconUrl } from '@/lib/deadlock/heroImages'

const DAY = 86_400
/** A patch window shorter than this is flagged as limited data. */
const MIN_PATCH_DAYS = 3

export type MetaPageData =
  | {
      ok: true
      model: MetaModel
      scope: StatScope
      windowLabels: Record<MetaWindow, string>
      rankLabels: Record<RankBandId, string>
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

const loadMetaPageData = cache(async (key: string): Promise<MetaPageData> => {
  const query = JSON.parse(key) as MetaQuery
  try {
    const [scopeInfo, heroes, distribution] = await Promise.all([
      resolveScope(query),
      getActiveHeroes(),
      getBadgeDistribution(Math.floor(Date.now() / 1000 / DAY) * DAY - 29 * DAY).catch(() => null),
    ])
    const { today, window, windowStart, band, rankLabels, windowLabels, scopeText, modeText } = scopeInfo
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
      scopeText,
    })

    return {
      ok: true,
      model,
      scope: {
        windowLabel: windowLabels[window],
        rankLabel: `${rankLabels[band.id]}${modeText}`,
        sampleSize: model.summary.matchesAnalyzed,
        ...(fallback.at ? { source: 'snapshot' as const, fetchedAt: fallback.at.getTime() } : { source: 'live' as const }),
      },
      windowLabels,
      rankLabels,
      ranks: scopeInfo.ranks,
      rankShares: distribution ? bandShares(distribution) : null,
      patch: latest ? { title: latest.title, startedAt: latest.day * 1000, days: patchDays, limited: patchDays < MIN_PATCH_DAYS } : null,
    }
  } catch (error) {
    const detail = error instanceof DeadlockApiError ? ` (${error.status ?? 'network'} on ${error.path})` : ''
    console.error(`[meta] data load failed${detail}`, error)
    return { ok: false, message: 'The Deadlock data source didn’t respond as expected.', kind: classifyError(error) }
  }
})

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
