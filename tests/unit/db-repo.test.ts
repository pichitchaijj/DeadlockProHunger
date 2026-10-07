import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { abilityOrderRows, buildRows, heroStatsRows, matchRows, patchRow, rankObservation, snapshotKey, synergyRows, type ApiMatchDetail } from '@/lib/db/mappers'
import * as repo from '@/lib/db/repo'
import * as schema from '@/lib/db/schema'

/* Real PostgreSQL (PGlite, in-process) with the generated migrations. Synthetic data only. */
let client: PGlite
let db: repo.Db

beforeAll(async () => {
  client = new PGlite()
  const pg = drizzle(client, { schema })
  await migrate(pg, { migrationsFolder: 'drizzle' })
  db = pg as unknown as repo.Db
  await repo.upsertHeroes(db, [
    { heroId: 1, slug: 'a', name: 'A', className: 'hero_a' },
    { heroId: 2, slug: 'b', name: 'B', className: 'hero_b' },
    { heroId: 3, slug: 'c', name: 'C', className: 'hero_c' },
  ])
}, 60_000)

afterAll(async () => {
  await client?.close()
})

const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 1000
const heroDay = (hero_id: number, d: string, matches: number, wins: number) => ({ hero_id, bucket: day(d), matches, wins, losses: matches - wins, total_kills: 0, total_deaths: 0, total_assists: 0, total_net_worth: 0 })

describe('migrations', () => {
  it('create every table', async () => {
    const { rows } = await client.query<{ n: number }>(`select count(*)::int as n from information_schema.tables where table_schema = 'public'`)
    expect(rows[0].n).toBe(18)
  })
})

describe('hero stats history', () => {
  it('upserts idempotently and re-aggregates any window from daily totals', async () => {
    await repo.upsertHeroStats(db, heroStatsRows([heroDay(1, '2026-10-01', 100, 60), heroDay(1, '2026-10-02', 100, 40), heroDay(2, '2026-10-01', 50, 25)], 'all'))
    // Late-ingested matches: the same day re-synced with a higher count replaces, never double-counts.
    await repo.upsertHeroStats(db, heroStatsRows([heroDay(1, '2026-10-02', 120, 50)], 'all'))
    const window = await repo.heroStatsWindow(db, { from: '2026-10-01', to: '2026-10-02', rankBand: 'all' })
    expect(window.find((r) => r.heroId === 1)).toEqual({ heroId: 1, matches: 220, wins: 110, days: 2 })
  })

  it('updates multi-word columns on re-sync, not only single-word ones', async () => {
    await repo.upsertHeroStats(db, heroStatsRows([{ ...heroDay(3, '2026-10-01', 10, 5), total_net_worth: 100 }], 'all'))
    await repo.upsertHeroStats(db, heroStatsRows([{ ...heroDay(3, '2026-10-01', 12, 6), total_net_worth: 150 }], 'all'))
    const [row] = await db.select().from(schema.heroStatsSnapshots).where(sql`${schema.heroStatsSnapshots.heroId} = 3`)
    expect([row.matches, row.netWorth]).toEqual([12, 150])
  })

  it('rejects wins above matches and unknown rank bands', async () => {
    await expect(repo.upsertHeroStats(db, heroStatsRows([heroDay(1, '2026-10-03', 10, 11)], 'all'))).rejects.toThrow()
    await expect(repo.upsertHeroStats(db, heroStatsRows([heroDay(1, '2026-10-03', 10, 5)], 'nope' as 'all'))).rejects.toThrow()
  })

  it('stores each synergy pair once, in id order', async () => {
    const rows = synergyRows('2026-10-01', 'all', [
      { hero_id1: 2, hero_id2: 1, wins: 30, matches_played: 50 },
      { hero_id1: 1, hero_id2: 2, wins: 30, matches_played: 50 },
    ])
    expect(rows).toHaveLength(1)
    await repo.upsertSynergies(db, rows)
    await expect(db.execute(sql`insert into hero_synergies (day, hero_id_1, hero_id_2, rank_band, matches, wins) values ('2026-10-01', 2, 1, 'all', 1, 1)`)).rejects.toThrow()
  })
})

describe('builds', () => {
  it('replaces the item layout on a new version and finds builds by item', async () => {
    const build = (items: number[], version: number) =>
      buildRows({ hero_build: { hero_build_id: 77, hero_id: 1, author_account_id: 5, name: ' Test ', version, details: { mod_categories: [{ name: 'Early', mods: items.map((ability_id) => ({ ability_id })) }] } }, num_weekly_favorites: 10 })
    await repo.upsertBuild(db, build([3_535_785_353, 11], 1))
    await repo.upsertBuild(db, build([12], 2))
    expect(await repo.buildsWithItem(db, 3_535_785_353)).toEqual([])
    expect((await repo.buildsWithItem(db, 12)).map((b) => [b.buildId, b.name])).toEqual([[77, 'Test']])
  })
})

describe('players', () => {
  it('records a rank only when the observed state changes', async () => {
    const r = (badge: number, matchId: number | null) => rankObservation(42, { badge, rank: Math.floor(badge / 10), subrank: badge % 10, last_match: matchId ? { match_id: matchId, start_time: 1 } : null }, 'profile')
    expect(await repo.recordRank(db, r(95, 1000))).toBe(true)
    expect(await repo.recordRank(db, r(95, 1000))).toBe(false)
    expect(await repo.recordRank(db, r(96, 1001))).toBe(true)
    expect(await repo.recordRank(db, r(0, null))).toBe(true)
    expect(await repo.recordRank(db, r(0, null))).toBe(false)
    expect((await repo.rankHistory(db, 42)).map((x) => x.badge).sort()).toEqual([0, 95, 96])
  })

  it('never overwrites a known name with null', async () => {
    await repo.upsertPlayers(db, [{ accountId: 7, personaName: 'Ann', profileFetched: true }])
    await repo.upsertPlayers(db, [{ accountId: 7 }])
    const [row] = await db.select().from(schema.players).where(sql`account_id = 7`)
    expect(row.personaName).toBe('Ann')
  })
})

describe('matches', () => {
  const detail: ApiMatchDetail = {
    match_info: {
      match_id: 900,
      start_time: day('2026-10-05'),
      duration_s: 1800,
      winning_team: 1,
      game_mode: 1,
      match_mode: 4,
      objectives: [
        { team_objective_id: 3, team: 0, destroyed_time_s: 600 }, // team 0 owned it → team 1 destroyed it
        { team_objective_id: 4, team: 1, destroyed_time_s: 0 }, // still standing
      ],
      mid_boss: [{ team_killed: 1, team_claimed: 1, destroyed_time_s: 1200 }],
      players: [
        { account_id: 1, player_slot: 1, team: 0, hero_id: 1, kills: 1, deaths: 1, assists: 0, net_worth: 1000, last_hits: 10, denies: 1, level: 10, death_details: [{ game_time_s: 300.4, killer_player_slot: 2 }] },
        { account_id: 2, player_slot: 2, team: 1, hero_id: 2, kills: 1, deaths: 0, assists: 0, net_worth: 2000, last_hits: 20, denies: 2, level: 12, death_details: [] },
      ],
    },
    pregame_hero_ids: { '2': 3 },
    banned_hero_ids: [3],
  }

  it('stores a match once with players, picks, bans, swaps and events', async () => {
    const rows = matchRows(detail)
    expect(rows.events.map((e) => [e.kind, e.timeS, e.team])).toEqual([['kill', 300, 1], ['objective', 600, 1], ['mid_boss', 1200, 1]])
    expect(await repo.saveMatch(db, rows)).toBe(true)
    expect(await repo.saveMatch(db, rows)).toBe(false)
    expect(await repo.recentStoredMatchesWithHero(db, 2)).toEqual([{ matchId: 900, startedAt: new Date(day('2026-10-05') * 1000), team: 1, won: true }])
    const kinds = await db.select().from(schema.matchHeroes)
    expect(kinds.map((h) => `${h.heroId}:${h.kind}`).sort()).toEqual(['1:picked', '2:picked', '3:banned', '3:swapped_from'])
    expect((await repo.storedMatchDetail(db, 900))?.detail).toEqual(detail)
  })
})

describe('snapshots and retention', () => {
  it('keeps one last-good payload per request key and prunes old rows', async () => {
    const key = snapshotKey('/v1/analytics/hero-stats', { min_unix_timestamp: 1, bucket: 'start_time_day', empty: null })
    expect(key).toBe('/v1/analytics/hero-stats?bucket=start_time_day&min_unix_timestamp=1')
    await repo.putSnapshot(db, { key, endpoint: '/v1/analytics/hero-stats', params: {}, payload: [1], fetchedAt: new Date('2026-01-01') })
    await repo.putSnapshot(db, { key, endpoint: '/v1/analytics/hero-stats', params: {}, payload: [2], fetchedAt: new Date('2026-09-30') })
    expect((await repo.getSnapshot(db, key))?.payload).toEqual([2])
    const pruned = await repo.prune(db, new Date('2026-12-01'))
    expect(pruned.snapshots).toBe(1)
    expect(await repo.getSnapshot(db, key)).toBeNull()
  })

  it('logs job runs', async () => {
    const id = await repo.startRun(db, 'test')
    await repo.finishRun(db, id, { status: 'ok', requests: 3, rows: { heroes: 3 } })
    const [run] = await repo.lastRuns(db, ['test'])
    expect(run).toMatchObject({ job: 'test', status: 'ok', requests: 3, rows: { heroes: 3 } })
  })
})

describe('history fallback', () => {
  it('serves a window only when every day is present', async () => {
    await repo.upsertHeroStats(db, heroStatsRows([heroDay(1, '2026-09-01', 10, 5), heroDay(2, '2026-09-01', 10, 5), heroDay(1, '2026-09-02', 10, 5)], 'top'))
    const full = await repo.heroStatsHistory(db, { from: '2026-09-01', to: '2026-09-02', rankBand: 'top' })
    expect(full?.rows).toHaveLength(3)
    expect(full?.rows[0]).toMatchObject({ bucket: day('2026-09-01'), matches: 10, wins: 5 })
    expect(await repo.heroStatsHistory(db, { from: '2026-09-01', to: '2026-09-03', rankBand: 'top' })).toBeNull()
  })
})

describe('patch scope', () => {
  const patch = (guid: string, at: string) => patchRow({ guid, source: 'forum', title: guid, link: null, effectiveAtS: Date.parse(at) / 1000, postedAt: null, excerpt: null })
  const heroStatsPatch = async (d: string, band: string) =>
    (await db.select({ p: schema.heroStatsSnapshots.patchGuid }).from(schema.heroStatsSnapshots).where(sql`${schema.heroStatsSnapshots.day} = ${d} and ${schema.heroStatsSnapshots.rankBand} = ${band}`))[0]?.p
  const matchPatches = async () => [
    (await db.select({ p: schema.matches.patchGuid }).from(schema.matches))[0].p,
    ...(await db.select({ p: schema.matchPlayers.patchGuid }).from(schema.matchPlayers)).map((r) => r.p),
    ...(await db.select({ p: schema.matchHeroes.patchGuid }).from(schema.matchHeroes)).map((r) => r.p),
  ]

  it('labels rows written before their patch was known once the patch arrives', async () => {
    await repo.upsertHeroStats(db, heroStatsRows([heroDay(1, '2026-08-01', 10, 5)], 'low'))
    expect(await heroStatsPatch('2026-10-01', 'all')).toBeNull()
    // B is dated mid-day; patch windows are day-aligned, so the whole of Oct 3 is B.
    await repo.upsertPatches(db, [patch('A', '2026-08-15T00:00:00Z'), patch('B', '2026-10-03T10:00:00Z')])
    expect(await heroStatsPatch('2026-08-01', 'low')).toBeNull() // before any known patch
    expect(await heroStatsPatch('2026-09-01', 'top')).toBe('A')
    expect(await heroStatsPatch('2026-10-02', 'all')).toBe('A')
    expect(new Set(await matchPatches())).toEqual(new Set(['B']))
    expect((await repo.latestPatch(db, '2026-09-30'))?.guid).toBe('A')
  })

  it('assigns the patch on every new write', async () => {
    await repo.upsertHeroStats(db, heroStatsRows([heroDay(1, '2026-10-03', 10, 5)], 'all'))
    expect(await heroStatsPatch('2026-10-03', 'all')).toBe('B')
    await repo.recordRank(db, { accountId: 77, badge: 50, source: 'profile', observedAt: new Date('2026-09-10T12:00:00Z') })
    expect((await db.select({ p: schema.playerRankSnapshots.patchGuid }).from(schema.playerRankSnapshots).where(sql`${schema.playerRankSnapshots.accountId} = 77`))[0].p).toBe('A')
  })

  it('never labels a window that spans two patches as one patch', async () => {
    const orders = (start: string) => abilityOrderRows('2026-10-05', 1, 'all', { start: new Date(start), end: new Date('2026-10-05T12:00:00Z') }, [{ abilities: [1, 2], wins: 5, matches: 10 }])
    const stored = async () => (await db.select({ p: schema.abilityOrders.patchGuid }).from(schema.abilityOrders))[0].p
    await repo.replaceAbilityOrders(db, { snapshotDay: '2026-10-05', heroId: 1, rankBand: 'all' }, orders('2026-10-01T00:00:00Z'))
    expect(await stored()).toBeNull()
    await repo.replaceAbilityOrders(db, { snapshotDay: '2026-10-05', heroId: 1, rankBand: 'all' }, orders('2026-10-03T00:00:00Z'))
    expect(await stored()).toBe('B')

    const snapshot = async (windowStart: Date | null) => {
      await repo.putSnapshot(db, { key: 'scope-test', endpoint: '/x', params: {}, payload: [], windowStart, windowEnd: windowStart && new Date('2026-10-04T00:00:00Z'), fetchedAt: new Date('2026-10-04T01:00:00Z') })
      return (await repo.getSnapshot(db, 'scope-test'))?.patchGuid
    }
    expect(await snapshot(new Date('2026-09-04T00:00:00Z'))).toBeNull()
    expect(await snapshot(null)).toBe('B') // point in time: the patch at fetch time
  })

  it('moves rows to the right patch when a patch is re-dated', async () => {
    await repo.upsertPatches(db, [patch('B', '2026-10-06T00:00:00Z')])
    expect(await heroStatsPatch('2026-10-03', 'all')).toBe('A')
    expect(new Set(await matchPatches())).toEqual(new Set(['A']))
  })
})
