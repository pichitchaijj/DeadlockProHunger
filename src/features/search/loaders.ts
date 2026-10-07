import 'server-only'
import { getActiveHeroes, getPatchFeed } from '@/lib/deadlock/endpoints'
import { searchBuildsByName } from '@/lib/deadlock/buildEndpoints'
import { getShopItems } from '@/lib/deadlock/heroEndpoints'
import { searchProfiles } from '@/lib/deadlock/playerEndpoints'
import { slugify } from '@/features/meta/model'
import { forumPatches } from '@/features/meta/scope'
import { searchAll, type SearchGroup } from './model'
import { heroIconUrl } from '@/lib/deadlock/heroImages'

/**
 * Heroes, items and patches come from cached asset feeds (no per-query upstream cost).
 * Builds and players are per-query API searches, each cached for a few minutes.
 * Every source fails independently; `partial` tells the UI some groups may be missing.
 */
/** Search is interactive: no source may hold the answer longer than this (measured 20 s before, docs/QA.md). */
const SOURCE_BUDGET_MS = 3_000

export async function globalSearch(query: string): Promise<{ groups: SearchGroup[]; partial: boolean }> {
  let partial = false
  const soft = <T,>(p: Promise<T[]>): Promise<T[]> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const budget = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`search source over ${SOURCE_BUDGET_MS} ms`)), SOURCE_BUDGET_MS)
    })
    return Promise.race([p, budget])
      .catch((error) => {
        console.error('[search] source failed', error)
        partial = true
        return [] as T[]
      })
      .finally(() => clearTimeout(timer))
  }
  const [heroes, items, feed, builds, players] = await Promise.all([
    soft(getActiveHeroes()),
    soft(getShopItems()),
    soft(getPatchFeed()),
    soft(searchBuildsByName(query)),
    // Steam names: the endpoint also matches account ids.
    soft(searchProfiles(query, undefined, { timeoutMs: 2_500, retry: false })),
  ])
  const groups = searchAll(query, {
    heroes: heroes.map((h) => ({ id: h.id, slug: slugify(h.name), name: h.name, role: h.hero_type ?? null, iconUrl: heroIconUrl(h.images) })),
    items: items.flatMap((i) => (i.name ? [{ ...i, name: i.name }] : [])),
    patches: forumPatches(feed),
    builds: builds.map((b) => ({ id: b.hero_build.hero_build_id, heroId: b.hero_build.hero_id, name: b.hero_build.name.trim() || 'Untitled build', favorites: b.num_weekly_favorites ?? null })),
    players: players.map((p) => ({ accountId: p.account_id, name: p.personaname, avatar: p.avatarmedium ?? null, matches30d: p.matches_played_last_30d ?? null })),
  })
  return { groups, partial }
}
