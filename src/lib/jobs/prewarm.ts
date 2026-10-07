import 'server-only'
import { DataError, classifyError } from '@/lib/deadlock/errors'
import { apiCallStats, budgetHeadroom } from '@/lib/deadlock/client'
import { getActiveHeroes, getPatchFeed, getRanks } from '@/lib/deadlock/endpoints'
import { getHeroBuildStats } from '@/lib/deadlock/heroEndpoints'
import { getItemPhases, getItemStatsByHero, getItemStatsByMinute } from '@/lib/deadlock/itemEndpoints'
import { getItemContext, itemTotals } from '@/features/items/loaders'
import { DEFAULT_ITEMS_QUERY } from '@/features/items/query'
import { getPatchContext, patchDiffById, patchImpactById, patchList } from '@/features/patches/loaders'
import { DEFAULT_PATCH_QUERY } from '@/features/patches/query'
import { getBuildsListing } from '@/features/builds/loaders'
import { DEFAULT_BUILDS_QUERY } from '@/features/builds/query'
import { getHeroContext, getOverviewData } from '@/features/hero/loaders'
import { DEFAULT_HERO_QUERY } from '@/features/hero/query'
import { getHomeBuilds, getHomeMatches, getHomeMeta, getHomePatch, getHomePerformance, getHomeSource, type Section } from '@/features/home/loaders'
import { getMetaPageData } from '@/features/meta/loaders'
import { DEFAULT_QUERY } from '@/features/meta/query'
import { resolveScope } from '@/features/meta/scope'
import { redact, runPrewarm, summarize, type PrewarmStage } from './prewarmRunner'

/*
 * Cache prewarming (docs/ARCHITECTURE.md § Cache prewarming). Loads, through the SAME loaders the pages
 * use, the data the most-visited default views need, so their cache keys match exactly and the first
 * visitor after an expiry finds a warm cache. Every request still goes cache → budget → API: a key
 * that is already fresh is a cache hit (no request, no budget), and the runner keeps half the
 * analytics burst free for users.
 *
 * Analytics keys roll over each hour (resolveScope rounds the window end to the hour), so the job is
 * meant to run hourly, a few minutes past the hour.
 */

/** How many heroes get their Hero Detail / Analyze data warmed: the most picked in the default scope. */
export const POPULAR_HEROES = 3
const CONCURRENCY = 3
/** The budget the job paces itself against: analytics, the scarcest class. It always leaves half the burst for users. */
const ANALYTICS_PATH = '/v1/analytics/'

/** Home sections report failures as values; turn them into errors so the runner records them. */
async function section<T>(load: () => Promise<Section<T>>) {
  const s = await load()
  if (!s.ok) throw new DataError(`section ${s.error}`, s.error)
}

async function meta(window: '7d' | '30d') {
  const m = await getMetaPageData({ ...DEFAULT_QUERY, window, rank: 'all', showLow: true })
  if (!m.ok) throw new DataError(m.message, m.kind)
  return m
}

/** The stages, most widely shared first. Hero-specific data only for heroes the data ranks as most picked. */
export function prewarmStages(): PrewarmStage[] {
  return [
    {
      // Every page: hero list, rank names, patch feed (window boundaries).
      name: 'shared reference',
      tasks: [
        { name: 'heroes', run: () => getActiveHeroes() },
        { name: 'ranks', run: () => getRanks() },
        { name: 'patches', run: () => getPatchFeed() },
      ],
    },
    {
      // Meta model: 7d (Home, Meta, Heroes, Hero Detail, Analyze defaults) and 30d (Builds default).
      name: 'meta model',
      tasks: [
        { name: 'meta 7d all ranks', run: () => meta('7d') },
        { name: 'meta 30d all ranks', run: () => meta('30d') },
      ],
    },
    {
      // Home is the most-visited page; its sections have their own cached copies too.
      name: 'home',
      tasks: [
        { name: 'home summary + pulse', run: () => section(getHomeMeta) },
        { name: 'home patch', run: () => section(getHomePatch) },
        { name: 'home source counters', run: () => section(getHomeSource) },
        { name: 'home hero performance', run: () => section(getHomePerformance) },
        { name: 'home builds', run: () => section(getHomeBuilds) },
        { name: 'home matches', run: () => section(getHomeMatches) },
      ],
    },
    {
      // /builds default view fires one build-stats call per hero at once on a cold cache (the worst
      // burst on the site). Warm them one task each, paced, so the page itself then reads only hits.
      name: 'builds tracked stats (30d, all ranks)',
      tasks: async () => {
        const [scope, heroes] = await Promise.all([resolveScope({ window: DEFAULT_BUILDS_QUERY.window, rank: DEFAULT_BUILDS_QUERY.rank, mode: 'all' }), getActiveHeroes()])
        return heroes.map((h) => ({ name: `build stats ${h.name}`, run: () => getHeroBuildStats(h.id, scope.statsQuery) }))
      },
    },
    {
      name: 'builds page',
      tasks: [{ name: 'builds default listing', run: () => getBuildsListing(DEFAULT_BUILDS_QUERY) }],
    },
    {
      // /items and every item page's default view (7d, all ranks, all heroes). The timing calls return
      // every item at once (~9 s cold each), so one warm entry serves all item pages.
      name: 'items (7d, all ranks)',
      tasks: async () => {
        const ctx = await getItemContext(DEFAULT_ITEMS_QUERY)
        if (ctx === 'unknown-hero') throw new DataError('unknown hero', 'not-found')
        const q = ctx.scope.statsQuery
        return [
          { name: 'item totals', run: () => itemTotals(ctx) },
          { name: 'item purchase minutes', run: () => getItemStatsByMinute(q, null) },
          { name: 'item purchase phases', run: () => getItemPhases(q, null) },
          { name: 'item heroes', run: () => getItemStatsByHero(q) },
        ]
      },
    },
    {
      // /patch/[latest]: the game-data diff (two ~8 MB build snapshots, cached as one small diff) and
      // the default before / after statistics.
      name: 'latest patch',
      tasks: async () => {
        const [latest] = await patchList()
        if (!latest) return []
        return [
          { name: 'patch diff', run: () => patchDiffById(latest.id) },
          {
            name: 'patch statistics',
            run: async () => {
              const ctx = await getPatchContext(DEFAULT_PATCH_QUERY)
              if (typeof ctx === 'string') throw new DataError(ctx, 'not-found')
              await patchImpactById(latest.id, ctx)
            },
          },
        ]
      },
    },
    {
      // Hero Detail and Analyze defaults (7d, all ranks). The first hero also warms the all-hero
      // matrix data (counters, synergies, splits) every hero page shares. Heroes chosen by measured
      // pick rate in the same scope, never by assumption.
      name: `hero detail + analyze (top ${POPULAR_HEROES} by pick rate, 7d)`,
      tasks: async () => {
        const m = await meta('7d')
        const popular = m.model.heroes
          .filter((h) => h.sample !== 'low')
          .sort((a, b) => b.pickRate - a.pickRate)
          .slice(0, POPULAR_HEROES)
        return popular.map((h) => ({
          name: `hero ${h.name}`,
          run: async () => {
            const ctx = await getHeroContext(h.slug, DEFAULT_HERO_QUERY)
            if (!ctx) throw new DataError(`unknown hero ${h.slug}`, 'not-found')
            await getOverviewData(ctx)
          },
        }))
      },
    },
  ]
}

export type PrewarmReport = {
  job: 'prewarm'
  status: 'ok' | 'partial' | 'failed'
  durationMs: number
  summary: ReturnType<typeof summarize>
  /** Upstream activity during the run (this server instance; concurrent user traffic is included). */
  upstream: { networkRequests: number; cacheHits: number; budgetWaits: number; budgetExhausted: number }
  results: Array<{ stage: string; name: string; status: string; ms: number; error?: string }>
}

/** Runs the job once. Never throws; the report holds counts and names only (no URLs, keys or secrets). */
export async function runPrewarmJob(): Promise<PrewarmReport> {
  const secrets = [process.env.CRON_SECRET, process.env.DEADLOCK_API_KEY, process.env.DATABASE_URL].filter((s): s is string => Boolean(s))
  const before = apiCallStats()
  const analytics = budgetHeadroom(ANALYTICS_PATH)
  const { results, durationMs } = await runPrewarm(prewarmStages(), {
    concurrency: CONCURRENCY,
    headroom: () => budgetHeadroom(ANALYTICS_PATH).available,
    reserve: Math.floor(analytics.capacity / 2),
    maxBudgetWaitMs: 20_000,
    deadlineMs: 240_000, // the route allows 300 s
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    classify: (error) => (classifyError(error) === 'rate-limit' ? 'rate-limited' : 'failed'),
    secrets,
    stopAfterRateLimited: 3,
  })
  const after = apiCallStats()
  const summary = summarize(results)
  const report: PrewarmReport = {
    job: 'prewarm',
    status: summary.ok === summary.tasks ? 'ok' : summary.ok === 0 ? 'failed' : 'partial',
    durationMs,
    summary,
    upstream: {
      networkRequests: after.network - before.network,
      cacheHits: after.hits - before.hits,
      budgetWaits: after.budgetWaits - before.budgetWaits,
      budgetExhausted: after.budgetExhausted - before.budgetExhausted,
    },
    results,
  }
  console.info(redact(`[prewarm] ${JSON.stringify({ status: report.status, durationMs, ...summary, ...report.upstream })}`, secrets))
  return report
}
