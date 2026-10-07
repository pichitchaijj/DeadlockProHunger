import 'server-only'
import { unstable_cache } from 'next/cache'
import { stableKey } from '@/lib/cache/stableKey'
import { cache } from 'react'
import { TTL } from '@/lib/cache/ttl'
import { getApiInfo, getPatchFeed } from '@/lib/deadlock/endpoints'
import { getHeroBans } from '@/lib/deadlock/heroEndpoints'
import { classifyError, DataError, type DataErrorKind } from '@/lib/deadlock/errors'
import { getBuildsListing } from '@/features/builds/loaders'
import { DEFAULT_BUILDS_QUERY } from '@/features/builds/query'
import { getMatchesPage } from '@/features/matches/loaders'
import { DEFAULT_MATCHES_QUERY } from '@/features/matches/query'
import { getMetaPageData } from '@/features/meta/loaders'
import type { MetaHero } from '@/features/meta/model'
import { DEFAULT_QUERY } from '@/features/meta/query'
import { forumPatches } from '@/features/meta/scope'
import { FRESHNESS, heroPerformance, isStale, patchExcerpt, type HeroPerformance } from './model'
import type { HomeBuild, HomeMatch, HomeMeta, HomeSource, HeroTrend, PatchSnapshot, PulseStat } from './types'

/*
 * Home data, one loader per section (docs/API.md § Production data sources).
 * Each section is:
 *   - cached on the server with the time it was computed (unstable_cache), so the UI can show
 *     its age and flag stale data if revalidation has been failing (Next keeps the last value);
 *   - deduplicated per request (React cache), so sections sharing data trigger one computation;
 *   - isolated: a failure becomes a typed error for that section only.
 */

export type Section<T> = { ok: true; data: T; asOf: number; stale: boolean } | { ok: false; error: DataErrorKind }

function section<T>(key: string, revalidate: number, maxAgeMs: number, load: () => Promise<T>) {
  const cached = unstable_cache(
    stableKey('home-section', async () => ({ data: await load(), asOf: Date.now() })),
    ['home', key, 'v3'], // bump when a section's cached shape changes (v3: pulse/trend ids instead of English labels)
    { revalidate, tags: ['home'] },
  )
  return cache(async (): Promise<Section<T>> => {
    try {
      const { data, asOf } = await cached()
      return { ok: true, data, asOf, stale: isStale(asOf, Date.now(), maxAgeMs) }
    } catch (error) {
      console.error(`[home] ${key} failed`, error)
      return { ok: false, error: classifyError(error) }
    }
  })
}

const DAY_MS = 86_400_000
/** Under this many days since the patch, post-patch data is flagged as limited. */
const LIMITED_PATCH_DAYS = 3

function trendRow(h: MetaHero): HeroTrend {
  return {
    slug: h.slug,
    name: h.name,
    imageSrc: h.iconUrl ?? undefined,
    value: h.winRate,
    direction: h.trend?.direction ?? 'stable',
    delta: h.trend?.delta ?? 0,
    matches: h.matches,
    history: h.history,
  }
}

const whyText = (h: MetaHero) => h.why.map((f) => f.text).join(' ')

/** Summary, pulse and hero movement: one Meta model (last 7 days, all ranks). */
export const getHomeMeta = section<HomeMeta>('meta', TTL.analytics / 6, FRESHNESS.analytics, async () => {
  const meta = await getMetaPageData(DEFAULT_QUERY)
  if (!meta.ok) throw new DataError(meta.message, meta.kind)
  const { model, scope } = meta
  const s = model.summary
  const pulse: PulseStat[] = []
  if (s.highestWinRate) {
    const h = s.highestWinRate
    pulse.push({
      kind: 'highestWinRate',
      subject: h.name,
      value: h.winRate,
      format: 'percent',
      featured: true,
      trend: h.trend ? { direction: h.trend.direction, delta: h.trend.delta } : undefined,
      sparkline: h.history.length > 1 ? { values: h.history, baseline: 0.5 } : undefined,
      why: whyText(h),
    })
  }
  if (s.mostPlayed) {
    const h = s.mostPlayed
    pulse.push({ kind: 'mostPicked', subject: h.name, value: h.pickRate, format: 'percent', why: `${h.name} appeared in ${(h.pickRate * 100).toFixed(1)}% of matches (pick rate = its matches ÷ total matches ÷ 12 slots). ${whyText(h)}` })
  }
  const mover = s.rising[0] ?? s.falling[0] ?? null
  if (mover?.trend) {
    pulse.push({
      kind: mover.trend.direction === 'rising' ? 'biggestRiser' : 'biggestFaller',
      subject: mover.name,
      value: mover.winRate,
      format: 'percent',
      trend: { direction: mover.trend.direction, delta: mover.trend.delta },
      why: `Last 7 days vs the 7 before, and the two weeks’ intervals don’t overlap. ${whyText(mover)}`,
    })
  }
  const byPick = [...model.heroes].filter((h) => h.sample !== 'low').sort((a, b) => b.pickRate - a.pickRate)
  return {
    scope,
    summary: { matchesAnalyzed: s.matchesAnalyzed, heroesTracked: s.heroesWithData, heroesTotal: s.heroesTotal, dataScopeLabel: `${scope.windowLabel} · ${scope.rankLabel}` },
    pulse,
    trending: { heroes: byPick.slice(0, 3).map(trendRow) },
    rising: { heroes: s.rising.slice(0, 3).map(trendRow) },
    falling: { heroes: s.falling.slice(0, 3).map(trendRow) },
  }
})

/** Latest forum changelog, dated from its title, with the post's own preview. `null` = unknown patch. */
/** Data-source facts for the hero strip (deadlock-api.com's own counters). */
export const getHomeSource = section<HomeSource>('source', TTL.patches, FRESHNESS.patches, async () => {
  const info = await getApiInfo()
  return { matchesPerDay: info.fetched_matches_per_day, playerProfiles: info.table_sizes.steam_profiles?.rows ?? null }
})

const HOUR = 3_600
const DAY = 86_400

/**
 * Top heroes by win rate, pick rate and recorded bans: the same Meta model as the pulse (last 7 days,
 * all ranks), plus ban counts for the same 7 UTC days. A failed ban source drops only the bans tab.
 */
export const getHomePerformance = section<HeroPerformance>('performance', TTL.analytics / 6, FRESHNESS.analytics, async () => {
  const meta = await getMetaPageData(DEFAULT_QUERY)
  if (!meta.ok) throw new DataError(meta.message, meta.kind)
  const now = Math.floor(Date.now() / 1000)
  const today = Math.floor(now / DAY) * DAY
  const bans = await getHeroBans({ minUnix: today - 6 * DAY, maxUnix: Math.floor(now / HOUR) * HOUR }).catch((error) => {
    console.error('[home] bans failed', error)
    return null
  })
  return heroPerformance(meta.model.heroes, bans)
})

export const getHomePatch = section<PatchSnapshot | null>('patch', TTL.patches, FRESHNESS.patches, async () => {
  const feed = await getPatchFeed()
  const latest = forumPatches(feed)[0]
  if (!latest) return null
  const post = feed.find((f) => f.source === 'forum' && f.title.trim() === latest.title)
  const publishedAt = latest.day * 1000
  return {
    title: latest.title,
    publishedAt,
    link: latest.link,
    excerpt: post?.content ? patchExcerpt(post.content) : null,
    limitedData: Date.now() - publishedAt < LIMITED_PATCH_DAYS * DAY_MS,
  }
})

/** This week's most-favorited builds; win rate only when tracked matches aren't a Low sample. */
export const getHomeBuilds = section<HomeBuild[]>('builds', TTL.builds, FRESHNESS.builds, async () => {
  const listing = await getBuildsListing({ ...DEFAULT_BUILDS_QUERY, category: 'community' })
  if (!listing) throw new Error('builds listing unavailable')
  return listing.rows.slice(0, 3).map((b) => ({
    name: b.name,
    href: b.href,
    heroName: b.hero.name,
    heroImageSrc: b.hero.iconUrl ?? undefined,
    authorName: b.authorName ?? undefined,
    updatedAt: b.updatedAt ?? undefined,
    weeklyFavorites: b.weeklyFavorites ?? undefined,
    performance: b.stats && b.stats.sample !== 'low' ? { winRate: b.stats.winRate, matches: b.stats.matches } : null,
  }))
})

/** Most recent matches at the top rank band (last 24 hours). */
export const getHomeMatches = section<HomeMatch[]>('matches', TTL.matches, FRESHNESS.matches, async () => {
  const page = await getMatchesPage({ ...DEFAULT_MATCHES_QUERY, rank: 'top' })
  return page.rows.slice(0, 6).map((m) => ({
    matchId: m.id,
    href: `/matches/${m.id}`,
    startedAt: m.startedAt,
    durationS: m.durationS,
    averageRank: m.rank ?? undefined,
    teams: [
      { label: m.teams[0].label, won: m.teams[0].won, heroes: m.teams[0].players.map((p) => ({ name: p.hero.name, imageSrc: p.hero.iconUrl ?? undefined })) },
      { label: m.teams[1].label, won: m.teams[1].won, heroes: m.teams[1].players.map((p) => ({ name: p.hero.name, imageSrc: p.hero.iconUrl ?? undefined })) },
    ],
  }))
})
