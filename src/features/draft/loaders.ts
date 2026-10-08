import 'server-only'
import { getActiveHeroes, getHeroTotals } from '@/lib/deadlock/endpoints'
import { getHeroCounters, getHeroSynergies } from '@/lib/deadlock/heroEndpoints'
import { slugify } from '@/features/meta/model'
import { resolveScope } from '@/features/meta/scope'
import { balanceProfile, draftRelations, recommendations, relationIndex, teamBalance, weakPoints, type DraftHero } from './model'
import type { DraftQuery } from './query'
import { heroIconUrl } from '@/lib/deadlock/heroImages'

/** Four cached calls per scope (heroes, totals, synergy matrix, counter matrix), shared by every draft. */
export async function getDraftData(query: DraftQuery) {
  const scope = await resolveScope({ window: query.window, rank: query.rank, mode: 'all' })
  const [apiHeroes, totalsRaw, synRaw, vsRaw] = await Promise.all([
    getActiveHeroes(),
    getHeroTotals(scope.statsQuery),
    getHeroSynergies(scope.statsQuery),
    // Any lane: draft relationships are about the whole match, not the laning phase.
    getHeroCounters(scope.statsQuery, false),
  ])
  const heroes: DraftHero[] = apiHeroes
    .map((h) => ({ id: h.id, slug: slugify(h.name), name: h.name, role: h.hero_type ?? null, iconUrl: heroIconUrl(h.images) }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const bySlug = new Map(heroes.map((h) => [h.slug, h]))
  const allies = query.allies.map((s) => bySlug.get(s)).filter((h): h is DraftHero => Boolean(h))
  const enemies = query.enemies.map((s) => bySlug.get(s)).filter((h): h is DraftHero => Boolean(h))
  const allyIds = allies.map((h) => h.id)
  const enemyIds = enemies.map((h) => h.id)

  const totals = totalsRaw.map((t) => ({ heroId: t.hero_id, wins: t.wins, matches: t.matches, damage: t.total_player_damage, damageTaken: t.total_player_damage_taken, objectiveDamage: t.total_boss_damage }))
  const idx = relationIndex(
    totals,
    synRaw.map((r) => ({ a: r.hero_id1, b: r.hero_id2, wins: r.wins, matches: r.matches_played })),
    vsRaw.map((r) => ({ a: r.hero_id, b: r.enemy_hero_id, wins: r.wins, matches: r.matches_played })),
  )
  const profile = balanceProfile(totals)
  const allyBalance = teamBalance(profile, allyIds)

  return {
    scope: scope.selected,
    windows: scope.windows,
    rankRefs: scope.rankRefs,
    ranks: scope.ranks,
    heroes,
    allies,
    enemies,
    baseWinRate: idx.base,
    relations: draftRelations(idx, allyIds, enemyIds),
    recommendations: recommendations(idx, heroes, allyIds, enemyIds),
    weakPoints: weakPoints(idx, heroes, allyIds, enemyIds, allyBalance),
    balance: { allies: allyBalance, enemies: teamBalance(profile, enemyIds) },
  }
}
export type DraftData = Awaited<ReturnType<typeof getDraftData>>
