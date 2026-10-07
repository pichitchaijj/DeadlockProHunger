import 'server-only'
import type { RankCatalog } from '@/lib/deadlock/rankAssets'
import type { StatScope } from '@/lib/analytics/scope'
import type { RankBandId } from '@/lib/analytics/rankBands'
import type { SampleTier } from '@/lib/analytics/sampleTier'
import type { Trend } from '@/lib/analytics/trend'
import type { Interval } from '@/lib/analytics/wilson'
import { getActiveHeroes } from '@/lib/deadlock/endpoints'
import { getMetaPageData } from '@/features/meta/loaders'
import { slugify } from '@/features/meta/model'
import { DEFAULT_QUERY, type MetaWindow } from '@/features/meta/query'
import type { DirectoryScope } from './query'
import { heroCardUrl } from '@/lib/deadlock/heroImages'
import type { DataErrorKind } from '@/lib/deadlock/errors'

/** Serializable hero card data for the client-side directory. */
export type DirectoryHero = {
  slug: string
  name: string
  role: string | null
  complexity: number | null
  cardSrc: string | null
  /** null = no matches for this hero in the selected scope. */
  stats: {
    winRate: number
    pickRate: number
    matches: number
    sample: SampleTier
    interval: Interval
    trend: Trend | null
  } | null
}

export type DirectoryData =
  | {
      ok: true
      heroes: DirectoryHero[]
      scope: StatScope
      windowLabels: Record<MetaWindow, string>
      rankLabels: Record<RankBandId, string>
      ranks: RankCatalog
    }
  | { ok: false; message: string; kind: DataErrorKind }

/**
 * Every active hero (even without data) joined with the same statistics the Meta page uses,
 * so both pages always agree on win rate, pick rate, trend and confidence.
 */
export async function getDirectoryData(scope: DirectoryScope): Promise<DirectoryData> {
  const [heroes, meta] = await Promise.all([
    getActiveHeroes().catch(() => null),
    getMetaPageData({ ...DEFAULT_QUERY, window: scope.window, rank: scope.rank, showLow: true }),
  ])
  if (!heroes || !meta.ok) return { ok: false, message: meta.ok ? 'Hero list unavailable.' : meta.message, kind: meta.ok ? 'unavailable' : meta.kind }

  const statsById = new Map(meta.model.heroes.map((h) => [h.id, h]))
  return {
    ok: true,
    scope: meta.scope,
    windowLabels: meta.windowLabels,
    rankLabels: meta.rankLabels,
    ranks: meta.ranks,
    heroes: heroes
      .map((hero) => {
        const s = statsById.get(hero.id)
        return {
          slug: slugify(hero.name),
          name: hero.name,
          role: hero.hero_type ?? null,
          complexity: hero.complexity ?? null,
          cardSrc: heroCardUrl(hero.images),
          stats: s
            ? { winRate: s.winRate, pickRate: s.pickRate, matches: s.matches, sample: s.sample, interval: s.interval, trend: s.trend }
            : null,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}
