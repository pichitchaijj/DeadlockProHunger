import 'server-only'
import { wilsonInterval } from '@/lib/analytics/wilson'
import { sampleTier } from '@/lib/analytics/sampleTier'
import { formatCompact, formatPercent } from '@/lib/format'
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
    rateDifference('', sA, sB),
    sA && sB ? ratioDifference('Picked more often', sA.pickRate, sB.pickRate, (v) => formatPercent(v)) : null,
    sA?.trend?.direction === 'rising' && sB?.trend?.direction !== 'rising' ? { side: 'a', text: 'Rising this week', detail: 'Last 7 days vs the 7 before: intervals don’t overlap' } : null,
    sB?.trend?.direction === 'rising' && sA?.trend?.direction !== 'rising' ? { side: 'b', text: 'Rising this week', detail: 'Last 7 days vs the 7 before: intervals don’t overlap' } : null,
  ])
  differences.push(...groupDifferences(groups('length'), (l) => `in matches ${l.toLowerCase()}`, 'match lengths'))
  differences.push(...groupDifferences(groups('rank'), (l) => `at ${l}`, 'rank bands'))
  if (lane && lane.sample !== 'low' && (lane.interval.low > 0.5 || lane.interval.high < 0.5)) {
    const aWins = lane.interval.low > 0.5
    differences.push({
      side: aWins ? 'a' : 'b',
      text: `Wins the lane matchup against ${aWins ? ctxB.hero.name : ctxA.hero.name}`,
      detail: `${ctxA.hero.name} wins ${formatPercent(lane.winRate)} of ${lane.matches.toLocaleString('en-US')} lane matchups vs ${ctxB.hero.name}`,
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
    sameHero ? rateDifference('', da.stats, db.stats) : null,
    ratioDifference('More favorites this week', da.build.weeklyFavorites ?? 0, db.build.weeklyFavorites ?? 0, (v) => formatCompact(v), 2),
  ])
  if (!sameHero) {
    for (const [side, d] of [['a', da], ['b', db]] as const) {
      if (d.stats && d.stats.sample !== 'low' && d.heroWinRate !== null && d.stats.interval.low > d.heroWinRate) {
        differences.push({ side, text: `Above its hero’s overall win rate`, detail: `${formatPercent(d.stats.winRate)} vs ${d.hero.name} ${formatPercent(d.heroWinRate)} (interval entirely above)` })
      }
    }
  }
  return { sides: [da, db] as const, sameHero, shared, onlyA, onlyB, differences }
}

// ── Player vs player ─────────────────────────────────────────────────

export async function getPlayerCompare(q: CompareQuery) {
  const [pa, pb] = await Promise.all([getPlayerProfile(Number(q.a)), getPlayerProfile(Number(q.b))])
  if (!pa || !pb) return null
  const nameA = pa.name ?? `Player ${pa.accountId}`
  const nameB = pb.name ?? `Player ${pb.accountId}`

  const sharedHeroes = pa.pool
    .filter((h) => pb.pool.some((x) => x.id === h.id))
    .map((h) => ({ hero: h, a: h as Rate, b: pb.pool.find((x) => x.id === h.id)! as Rate }))
    .sort((x, y) => y.a.matches + y.b.matches - (x.a.matches + x.b.matches))
    .slice(0, 6)

  const differences: Difference[] = byLabel([
    rateDifference('overall', pa.history.overall, pb.history.overall),
    rateDifference('in ranked matches', pa.history.ranked, pb.history.ranked),
    pa.rank && pb.rank && pa.rank.badge !== pb.rank.badge
      ? { side: pa.rank.badge > pb.rank.badge ? 'a' : 'b', text: 'Higher current rank', detail: `${pa.rank.badge > pb.rank.badge ? pa.rank.label : pb.rank.label} vs ${pa.rank.badge > pb.rank.badge ? pb.rank.label : pa.rank.label}` }
      : null,
  ])
  differences.push(...groupDifferences(sharedHeroes.map((s) => ({ key: String(s.hero.id), label: s.hero.name, a: s.a, b: s.b })), (l) => `on ${l}`, 'shared heroes'))

  const asMates = pa.mates.find((m) => m.accountId === pb.accountId) ?? null
  const asOpponents = pa.enemies.find((m) => m.accountId === pb.accountId) ?? null
  return { sides: [pa, pb] as const, names: [nameA, nameB] as const, sharedHeroes, asMates, asOpponents, differences }
}

/** Build picker: the hero's most-favorited builds this week. */
export async function buildOptions(heroSlug: string) {
  const heroes = await getActiveHeroes()
  const hero = heroes.find((h) => slugify(h.name) === heroSlug)
  if (!hero) return []
  const builds = await searchBuilds({ heroId: hero.id, limit: 12 })
  return builds.map((b) => ({ value: `${heroSlug}:${b.hero_build.hero_build_id}`, name: b.hero_build.name.trim() || 'Untitled build', favorites: b.num_weekly_favorites ?? null }))
}
