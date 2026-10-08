import 'server-only'
import { wilsonInterval } from '@/lib/analytics/wilson'
import { sampleTier } from '@/lib/analytics/sampleTier'
import { getActiveHeroes } from '@/lib/deadlock/endpoints'
import { searchBuilds } from '@/lib/deadlock/buildEndpoints'
import { getHeroCounters, getHeroSynergies } from '@/lib/deadlock/heroEndpoints'
import { getBuildDetail } from '@/features/builds/loaders'
import { getHeroContext, getOverviewData } from '@/features/hero/loaders'
import { DEFAULT_HERO_QUERY } from '@/features/hero/query'
import { slugify } from '@/features/meta/model'
import { getPlayerProfile } from '@/features/players/loaders'
import { byLabel, groupDifferences, ratioDifference, rateDifference, type Difference, type Rate } from './model'
import type { CompareQuery } from './query'

const rate = (wins: number, matches: number, scale: 'population' | 'player' = 'population'): Rate => ({
  winRate: matches > 0 ? wins / matches : 0,
  interval: wilsonInterval(wins, matches),
  matches,
  sample: sampleTier(matches, scale),
})

/** Heroes for the pickers. */
export async function heroOptions() {
  return (await getActiveHeroes()).map((h) => ({ slug: slugify(h.name), name: h.name })).sort((a, b) => a.name.localeCompare(b.name))
}

// ── Hero vs hero ─────────────────────────────────────────────────────

export async function getHeroCompare(q: CompareQuery) {
  const heroQuery = { ...DEFAULT_HERO_QUERY, window: q.window, rank: q.rank }
  const [ctxA, ctxB] = await Promise.all([getHeroContext(q.a, heroQuery), getHeroContext(q.b, heroQuery)])
  if (!ctxA || !ctxB) return null
  const [ovA, ovB, laneRows, anyRows, synergyRows] = await Promise.all([
    getOverviewData(ctxA),
    getOverviewData(ctxB),
    getHeroCounters(ctxA.scope.statsQuery, true),
    getHeroCounters(ctxA.scope.statsQuery, false),
    getHeroSynergies(ctxA.scope.statsQuery),
  ])
  const pairRate = (rows: typeof laneRows) => {
    const row = rows.find((r) => r.hero_id === ctxA.hero.id && r.enemy_hero_id === ctxB.hero.id)
    return row && row.matches_played > 0 ? rate(row.wins, row.matches_played) : null
  }
  const lane = pairRate(laneRows)
  const anyLane = pairRate(anyRows)
  const togetherRow = synergyRows.find((r) => (r.hero_id1 === ctxA.hero.id && r.hero_id2 === ctxB.hero.id) || (r.hero_id1 === ctxB.hero.id && r.hero_id2 === ctxA.hero.id))
  const together = togetherRow ? rate(togetherRow.wins, togetherRow.matches_played) : null

  const sA = ctxA.stats
  const sB = ctxB.stats
  const groups = (key: 'length' | 'rank') =>
    ovA[key].groups.map((g) => ({ key: g.key, label: g.label, a: g as Rate, b: (ovB[key].groups.find((x) => x.key === g.key) ?? null) as Rate | null }))

  const differences: Difference[] = byLabel([
    rateDifference({ kind: 'all' }, sA, sB),
    sA && sB ? ratioDifference('pickRate', sA.pickRate, sB.pickRate) : null,
    sA?.trend?.direction === 'rising' && sB?.trend?.direction !== 'rising' ? { side: 'a', kind: 'rising' } : null,
    sB?.trend?.direction === 'rising' && sA?.trend?.direction !== 'rising' ? { side: 'b', kind: 'rising' } : null,
  ])
  differences.push(...groupDifferences(groups('length'), 'length'))
  differences.push(...groupDifferences(groups('rank'), 'rank'))
  if (lane && lane.sample !== 'low' && (lane.interval.low > 0.5 || lane.interval.high < 0.5)) {
    const aWins = lane.interval.low > 0.5
    differences.push({
      side: aWins ? 'a' : 'b',
      kind: 'lane',
      heroA: ctxA.hero.name,
      heroB: ctxB.hero.name,
      opponent: aWins ? ctxB.hero.name : ctxA.hero.name,
      winRate: lane.winRate,
      matches: lane.matches,
    })
  }

  return {
    sides: [
      { ctx: ctxA, overview: ovA },
      { ctx: ctxB, overview: ovB },
    ] as const,
    lane,
    anyLane,
    together,
    differences,
    lengthGroups: groups('length'),
    rankGroups: groups('rank'),
    scopeText: ctxA.scope.scopeText,
  }
}

// ── Build vs build ───────────────────────────────────────────────────

function splitBuild(value: string) {
  const [hero, id] = value.split(':')
  return { hero, id: Number(id) }
}

/** A build's latest version can belong to another hero than older listings say; follow it. */
async function buildDetail(value: string, q: CompareQuery) {
  const { hero, id } = splitBuild(value)
  const d = await getBuildDetail(hero, id, q)
  if (d?.kind !== 'redirect') return d
  const actual = d.href.split('/')[2]
  return actual ? getBuildDetail(actual, id, q) : null
}

export async function getBuildCompare(q: CompareQuery) {
  const [da, db] = await Promise.all([buildDetail(q.a, q), buildDetail(q.b, q)])
  if (!da || !db || da.kind !== 'build' || db.kind !== 'build') return null

  const itemsA = new Map(da.sections.flatMap((s) => s.items).map((i) => [i.id, i]))
  const itemsB = new Map(db.sections.flatMap((s) => s.items).map((i) => [i.id, i]))
  const shared = [...itemsA.values()].filter((i) => itemsB.has(i.id))
  const onlyA = [...itemsA.values()].filter((i) => !itemsB.has(i.id))
  const onlyB = [...itemsB.values()].filter((i) => !itemsA.has(i.id))
  const sameHero = da.hero.id === db.hero.id

  const differences: Difference[] = byLabel([
    // Win rates of builds for different heroes also reflect the heroes, so only same-hero builds are compared directly.
    sameHero ? rateDifference({ kind: 'all' }, da.stats, db.stats) : null,
    ratioDifference('favorites', da.build.weeklyFavorites ?? 0, db.build.weeklyFavorites ?? 0, 2),
  ])
  if (!sameHero) {
    for (const [side, d] of [['a', da], ['b', db]] as const) {
      if (d.stats && d.stats.sample !== 'low' && d.heroWinRate !== null && d.stats.interval.low > d.heroWinRate) {
        differences.push({ side, kind: 'aboveHero', hero: d.hero.name, winRate: d.stats.winRate, heroWinRate: d.heroWinRate })
      }
    }
  }
  return { sides: [da, db] as const, sameHero, shared, onlyA, onlyB, differences }
}

// ── Player vs player ─────────────────────────────────────────────────

export async function getPlayerCompare(q: CompareQuery) {
  const [pa, pb] = await Promise.all([getPlayerProfile(Number(q.a)), getPlayerProfile(Number(q.b))])
  if (!pa || !pb) return null

  const sharedHeroes = pa.pool
    .filter((h) => pb.pool.some((x) => x.id === h.id))
    .map((h) => ({ hero: h, a: h as Rate, b: pb.pool.find((x) => x.id === h.id)! as Rate }))
    .sort((x, y) => y.a.matches + y.b.matches - (x.a.matches + x.b.matches))
    .slice(0, 6)

  const differences: Difference[] = byLabel([
    rateDifference({ kind: 'overall' }, pa.history.overall, pb.history.overall),
    rateDifference({ kind: 'ranked' }, pa.history.ranked, pb.history.ranked),
    pa.rank && pb.rank && pa.rank.badge !== pb.rank.badge
      ? { side: pa.rank.badge > pb.rank.badge ? 'a' : 'b', kind: 'rank', higher: pa.rank.badge > pb.rank.badge ? pa.rank.label : pb.rank.label, lower: pa.rank.badge > pb.rank.badge ? pb.rank.label : pa.rank.label }
      : null,
  ])
  differences.push(...groupDifferences(sharedHeroes.map((s) => ({ key: String(s.hero.id), label: s.hero.name, a: s.a, b: s.b })), 'hero'))

  const asMates = pa.mates.find((m) => m.accountId === pb.accountId) ?? null
  const asOpponents = pa.enemies.find((m) => m.accountId === pb.accountId) ?? null
  // Names stay null when the profile has none; the page shows its "Player <id>" fallback.
  return { sides: [pa, pb] as const, names: [pa.name, pb.name] as const, sharedHeroes, asMates, asOpponents, differences }
}

/** Build picker: the hero's most-favorited builds this week. */
export async function buildOptions(heroSlug: string) {
  const heroes = await getActiveHeroes()
  const hero = heroes.find((h) => slugify(h.name) === heroSlug)
  if (!hero) return []
  const builds = await searchBuilds({ heroId: hero.id, limit: 12 })
  return builds.map((b) => ({ value: `${heroSlug}:${b.hero_build.hero_build_id}`, name: b.hero_build.name.trim() || null, favorites: b.num_weekly_favorites ?? null }))
}
