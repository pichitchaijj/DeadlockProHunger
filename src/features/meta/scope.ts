 import 'server-only'
import { badgeRange, RANK_BANDS, rankBand, rankBandLabel, type RankBand, type RankBandId } from '@/lib/analytics/rankBands'
import { getPatchFeed, getRanks, type HeroStatsQuery } from '@/lib/deadlock/endpoints'
import { rankImageUrl } from '@/lib/deadlock/heroImages'
import { patchDateFromTitle } from '@/lib/deadlock/patchDate'
import type { MetaWindow } from './query'

const DAY = 86_400
const HOUR = 3_600
const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export type ForumPatch = { title: string; /** unix seconds, UTC day start */ day: number; link: string | null }

/**
 * Shared analytics scope for Meta, Heroes and Hero Detail: one place decides what
 * "current patch", "last 7 days" and each rank band mean, so pages can't disagree.
 */
export type ResolvedScope = {
  today: number
  hour: number
  window: MetaWindow
  windowStart: number
  band: RankBand
  /** Analytics filters for the selected window (hour-rounded end, so presets share cache keys). */
  statsQuery: HeroStatsQuery
  tierNames: Map<number, string>
  /** Tier badge image URL per tier (null when the source has none). */
  tierImages: Map<number, string | null>
  rankLabels: Record<RankBandId, string>
  windowLabels: Record<MetaWindow, string>
  /** Forum changelog patches, newest first, dated from their titles. */
  patches: ForumPatch[]
  scopeText: string
  modeText: string
}

/** Forum changelog entries dated by title (reliable) with pub_date as fallback, newest first. */
export function forumPatches(feed: Awaited<ReturnType<typeof getPatchFeed>>): ForumPatch[] {
  return feed
    .filter((item) => item.source === 'forum')
    .map((item) => {
      const at = (patchDateFromTitle(item.title) ?? Date.parse(item.pub_date)) / 1000
      return { title: item.title.trim(), day: Math.floor(at / DAY) * DAY, link: item.link ?? null }
    })
    .filter((p) => Number.isFinite(p.day))
    .sort((a, b) => b.day - a.day)
}

export async function resolveScope(input: { window: MetaWindow; rank: RankBandId; mode: 'all' | 'ranked' }): Promise<ResolvedScope> {
  const nowSec = Math.floor(Date.now() / 1000)
  const hour = Math.floor(nowSec / HOUR) * HOUR
  const today = Math.floor(nowSec / DAY) * DAY

  const [ranks, feed] = await Promise.all([getRanks(), getPatchFeed().catch(() => null)]) // pages work without patch data
  const patches = feed ? forumPatches(feed) : []
  const patchStart = patches[0]?.day ?? null
  const window: MetaWindow = input.window === 'patch' && patchStart === null ? '7d' : input.window
  const windowStart = window === 'patch' ? Math.max(patchStart!, today - 59 * DAY) : window === '30d' ? today - 29 * DAY : today - 6 * DAY

  const band = rankBand(input.rank)
  const badges = badgeRange(band)
  const tierNames = new Map(ranks.map((r) => [r.tier, r.name]))
  const tierImages = new Map(ranks.map((r) => [r.tier, rankImageUrl(r.images)]))
  const rankLabels = Object.fromEntries(RANK_BANDS.map((b) => [b.id, rankBandLabel(b, tierNames)])) as Record<RankBandId, string>
  const windowLabels: Record<MetaWindow, string> = {
    patch: patchStart === null ? 'Current patch' : `Current patch (since ${DATE.format(patchStart * 1000)})`,
    '7d': 'Last 7 days',
    '30d': 'Last 30 days',
  }

  return {
    today,
    hour,
    window,
    windowStart,
    band,
    statsQuery: {
      minUnix: windowStart,
      maxUnix: hour,
      minBadge: badges?.min,
      maxBadge: badges?.max,
      matchMode: input.mode === 'ranked' ? 'ranked' : 'ranked,unranked',
    },
    tierNames,
    tierImages,
    rankLabels,
    windowLabels,
    patches,
    scopeText: `${windowLabels[window]}, ${rankLabels[band.id]}`,
    modeText: input.mode === 'ranked' ? ' · Ranked only' : '',
  }
}
