import 'server-only'
import { RANK_BANDS, badgeRange, type RankBandId } from '@/lib/analytics/rankBands'
import { REGIONS } from '@/lib/deadlock/constants'
import { getActiveHeroes, getBadgeDistribution, getHeroStatsByDay, getPatchFeed, type HeroStatsQuery } from '@/lib/deadlock/endpoints'
import { getAbilityOrderStats, getHeroCounters, getHeroSynergies, getShopItems } from '@/lib/deadlock/heroEndpoints'
import { searchBuilds } from '@/lib/deadlock/buildEndpoints'
import { getLeaderboard } from '@/lib/deadlock/playerEndpoints'
import { patchDateFromTitle } from '@/lib/deadlock/patchDate'
import { abilityOrderRows, buildRows, heroStatsRows, leaderboardSnapshotKey, matchupRows, patchRow, snapshotKey, synergyRows, utcDay } from '@/lib/db/mappers'
import * as repo from '@/lib/db/repo'
import { slugify } from '@/features/meta/model'
import { patchExcerpt } from '@/features/home/model'
import { heroIconUrl, heroCardUrl } from '@/lib/deadlock/heroImages'

/*
 * Scheduled ingestion (docs/DATA_MODEL.md § Jobs). Each job:
 *  - counts its upstream requests and stays within a fixed budget (well under the per-IP limits);
 *  - keeps going when one unit fails (status "partial"), so one bad hero doesn't lose a day;
 *  - is idempotent: re-running it upserts the same rows.
 */

export type JobName = 'reference' | 'daily' | 'builds' | 'prune'
export const JOBS: JobName[] = ['reference', 'daily', 'builds', 'prune']
export type JobResult = { status: 'ok' | 'partial' | 'failed'; requests: number; rows: Record<string, number>; errors: string[] }

const DAY = 86_400
/** Parallel upstream calls per job. Analytics share 200 req/min per IP; this keeps bursts small. */
const CONCURRENCY = 4
const BUILDS_PER_HERO = 20
const ABILITY_WINDOW_DAYS = 7

class Run {
  requests = 0
  rows: Record<string, number> = {}
  errors: string[] = []
  /** One upstream call, counted. */
  async call<T>(fn: () => Promise<T>): Promise<T> {
    this.requests++
    return fn()
  }
  add(key: string, n: number) {
    this.rows[key] = (this.rows[key] ?? 0) + n
  }
  /** Runs one unit of work; a failure is recorded and the job continues. */
  async unit(label: string, fn: () => Promise<void>) {
    try {
      await fn()
    } catch (error) {
      this.errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  result(): JobResult {
    const status = this.errors.length === 0 ? 'ok' : Object.keys(this.rows).length > 0 ? 'partial' : 'failed'
    return { status, requests: this.requests, rows: this.rows, errors: this.errors }
  }
}

async function inPool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++])
  }))
}

const bandQuery = (band: RankBandId, minUnix: number, maxUnix: number): HeroStatsQuery => {
  const range = badgeRange(RANK_BANDS.find((b) => b.id === band)!)
  return { minUnix, maxUnix, minBadge: range?.min, maxBadge: range?.max }
}

// ── reference: heroes, shop items, patches (3 requests) ──

async function reference(db: repo.Db, run: Run) {
  await run.unit('heroes', async () => {
    const heroes = await run.call(() => getActiveHeroes())
    run.add(
      'heroes',
      await repo.upsertHeroes(
        db,
        heroes.map((h) => ({ heroId: h.id, slug: slugify(h.name), name: h.name, className: h.class_name, heroType: h.hero_type ?? null, complexity: h.complexity ?? null, iconUrl: heroIconUrl(h.images), cardUrl: heroCardUrl(h.images), isActive: true, syncedAt: new Date() })),
      ),
    )
  })
  await run.unit('items', async () => {
    const items = await run.call(() => getShopItems())
    run.add('items', await repo.upsertItems(db, items.map((i) => ({ itemId: i.id, className: i.className, name: i.name, type: 'upgrade', slot: i.slot, tier: i.tier, cost: i.cost, shopable: i.shopable, iconUrl: i.icon, syncedAt: new Date() }))))
  })
  await run.unit('patches', async () => {
    const feed = await run.call(() => getPatchFeed())
    const rows = feed
      .filter((f) => f.source === 'forum')
      .flatMap((f) => {
        const ms = patchDateFromTitle(f.title) ?? Date.parse(f.pub_date)
        if (!Number.isFinite(ms)) return []
        return [patchRow({ guid: f.guid?.text ?? f.link ?? f.title, source: f.source, title: f.title, link: f.link ?? null, effectiveAtS: Math.floor(ms / 1000), postedAt: f.pub_date, excerpt: f.content ? (patchExcerpt(f.content)?.text ?? null) : null })]
      })
    run.add('patches', await repo.upsertPatches(db, rows))
  })
}

// ── daily: hero history, matchups, synergies, ability orders, snapshots ──

/**
 * Requests for the default 3 days: hero stats 5 (one per rank band) + matchups/synergies
 * 3 per completed day (9) + ability orders 1 per hero (~39) + badge distribution 1 + leaderboards 5.
 * `days` (1–30) backfills more history on a first run.
 */
async function daily(db: repo.Db, run: Run, opts: { days: number; now: Date }) {
  const nowS = Math.floor(opts.now.getTime() / 1000)
  const today = Math.floor(nowS / DAY) * DAY
  const hour = Math.floor(nowS / 3600) * 3600
  const from = today - (opts.days - 1) * DAY // includes today's partial day; tomorrow's run completes it

  await inPool([...RANK_BANDS.map((b) => b.id)], CONCURRENCY, (band) =>
    run.unit(`hero-stats ${band}`, async () => {
      const rows = await run.call(() => getHeroStatsByDay(bandQuery(band, from, hour)))
      run.add('heroStats', await repo.upsertHeroStats(db, heroStatsRows(rows, band)))
    }),
  )

  // Matchups and synergies: completed days only, one-day windows (so daily rows add up).
  const days = Array.from({ length: Math.max(1, opts.days - 1) }, (_, i) => today - (i + 1) * DAY)
  await inPool(days, CONCURRENCY, (dayStart) =>
    run.unit(`pairs ${utcDay(dayStart)}`, async () => {
      const q = bandQuery('all', dayStart, dayStart + DAY)
      const [anyLane, sameLane, synergies] = await Promise.all([run.call(() => getHeroCounters(q, false)), run.call(() => getHeroCounters(q, true)), run.call(() => getHeroSynergies(q))])
      run.add('matchups', await repo.upsertMatchups(db, [...matchupRows(utcDay(dayStart), 'all', false, anyLane), ...matchupRows(utcDay(dayStart), 'all', true, sameLane)]))
      run.add('synergies', await repo.upsertSynergies(db, synergyRows(utcDay(dayStart), 'all', synergies)))
    }),
  )

  const heroes = await run.call(() => getActiveHeroes())
  // The rolling window never reaches back before the current patch, so each snapshot is one patch's data.
  const patch = await repo.latestPatch(db, utcDay(today))
  const patchDay = patch ? Math.floor(patch.effectiveAt.getTime() / 1000 / DAY) * DAY : null
  const windowStart = Math.max(today - ABILITY_WINDOW_DAYS * DAY, patchDay ?? 0)
  await inPool(heroes, CONCURRENCY, (hero) =>
    run.unit(`ability-orders ${hero.name}`, async () => {
      const rows = await run.call(() => getAbilityOrderStats(hero.id, bandQuery('all', windowStart, hour)))
      run.add('abilityOrders', await repo.replaceAbilityOrders(db, { snapshotDay: utcDay(today), heroId: hero.id, rankBand: 'all' }, abilityOrderRows(utcDay(today), hero.id, 'all', { start: new Date(windowStart * 1000), end: new Date(hour * 1000) }, rows)))
    }),
  )

  // Last-good snapshots for pages whose upstream has no history of its own here.
  await run.unit('badge-distribution', async () => {
    const minUnix = today - 29 * DAY
    const payload = await run.call(() => getBadgeDistribution(minUnix))
    await repo.putSnapshot(db, { key: snapshotKey('/v1/analytics/badge-distribution', { min_unix_timestamp: 'last-30d' }), endpoint: '/v1/analytics/badge-distribution', params: { min_unix_timestamp: minUnix }, windowStart: new Date(minUnix * 1000), windowEnd: new Date(hour * 1000), payload })
    run.add('snapshots', 1)
  })
  await inPool([...REGIONS.map(([r]) => r)], CONCURRENCY, (region) =>
    run.unit(`leaderboard ${region}`, async () => {
      const payload = await run.call(() => getLeaderboard(region))
      await repo.putSnapshot(db, { key: leaderboardSnapshotKey(region), endpoint: '/v1/leaderboard/{region}', params: { region }, payload })
      run.add('snapshots', 1)
    }),
  )
}


// ── builds: each hero's most-favorited builds (1 request per hero) ──

async function syncBuilds(db: repo.Db, run: Run) {
  const heroes = await run.call(() => getActiveHeroes())
  await inPool(heroes, CONCURRENCY, (hero) =>
    run.unit(`builds ${hero.name}`, async () => {
      const list = await run.call(() => searchBuilds({ heroId: hero.id, limit: BUILDS_PER_HERO }))
      // Stored as listed. The listing can lag a build's latest version (a build moved to another hero
      // still lists here); opening it on the site follows the redirect to its current hero.
      for (const b of list.filter((x) => x.hero_build.hero_id === hero.id)) await repo.upsertBuild(db, buildRows(b))
      run.add('builds', list.length)
    }),
  )
}

/** Runs one job and logs it in sync_runs. Never throws. */
export async function runJob(db: repo.Db, name: JobName, opts: { days?: number; now?: Date } = {}): Promise<JobResult> {
  const id = await repo.startRun(db, name)
  const run = new Run()
  try {
    if (name === 'reference') await reference(db, run)
    else if (name === 'daily') await daily(db, run, { days: Math.min(30, Math.max(1, Math.round(opts.days ?? 3))), now: opts.now ?? new Date() })
    else if (name === 'builds') await syncBuilds(db, run)
    else run.rows = await repo.prune(db, opts.now)
  } catch (error) {
    run.errors.push(error instanceof Error ? error.message : String(error))
  }
  const result = run.result()
  await repo.finishRun(db, id, { status: result.status, requests: result.requests, rows: result.rows, error: result.errors.length ? result.errors.slice(0, 20).join('\n') : null })
  return result
}
