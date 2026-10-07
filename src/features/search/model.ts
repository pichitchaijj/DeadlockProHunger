/*
 * Global search ranking. Pure: the server endpoint assembles inputs from cached sources.
 * Results are grouped in a fixed order; each group is capped so the palette stays scannable.
 */

export type SearchGroupId = 'heroes' | 'builds' | 'players' | 'matches' | 'items' | 'patches'

export const GROUP_LABELS: Record<SearchGroupId, string> = {
  heroes: 'Heroes',
  builds: 'Builds',
  players: 'Players',
  matches: 'Matches',
  items: 'Items',
  patches: 'Patches',
}
const GROUP_ORDER: SearchGroupId[] = ['heroes', 'builds', 'players', 'matches', 'items', 'patches']
export const GROUP_LIMIT = 5

export type SearchResult = {
  id: string
  label: string
  description: string
  /** internal: app route · external: opens a new tab · info: shown, not navigable */
  kind: 'internal' | 'external' | 'info'
  href?: string
  icon?: { type: 'hero' | 'item' | 'avatar'; src: string | null; name: string; slot?: string | null; tier?: number | null }
}
export type SearchGroup = { id: SearchGroupId; label: string; results: SearchResult[] }

export type SearchHero = { id: number; slug: string; name: string; role: string | null; iconUrl: string | null }
export type SearchItem = { id: number; slug: string; name: string; slot: string | null; tier: number | null; cost: number | null; icon: string | null }
export type SearchPatch = { title: string; day: number; link: string | null }
export type SearchBuild = { id: number; heroId: number; name: string; favorites: number | null }
export type SearchPlayer = { accountId: number; name: string; avatar: string | null; matches30d: number | null }

export const MIN_QUERY = 2
export const MAX_QUERY = 40

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * 0 exact · 1 prefix · 2 word prefix, or every query word starts a word ("mo krill" → "Mo & Krill")
 * · 3 substring · -1 no match. Lower is better.
 */
export function matchScore(text: string, query: string): number {
  const t = normalize(text)
  const q = normalize(query)
  if (!q || !t) return -1
  if (t === q) return 0
  if (t.startsWith(q)) return 1
  const words = t.split(' ')
  if (words.some((w) => w.startsWith(q))) return 2
  const parts = q.split(' ').filter((p) => p !== 'and')
  if (parts.length > 1 && parts.every((p) => words.some((w) => w.startsWith(p)))) return 2
  return t.includes(q) ? 3 : -1
}

function ranked<T>(list: T[], label: (x: T) => string, q: string, limit = GROUP_LIMIT): T[] {
  return list
    .map((x) => ({ x, s: matchScore(label(x), q) }))
    .filter((r) => r.s >= 0)
    .sort((a, b) => a.s - b.s || label(a.x).localeCompare(label(b.x)))
    .slice(0, limit)
    .map((r) => r.x)
}

const cap = (s: string | null) => (s ? s[0].toUpperCase() + s.slice(1) : '')

export function searchAll(
  query: string,
  data: { heroes: SearchHero[]; items: SearchItem[]; patches: SearchPatch[]; builds: SearchBuild[]; players: SearchPlayer[] },
): SearchGroup[] {
  const q = query.trim()
  if (q.length < MIN_QUERY) return []
  const heroById = new Map(data.heroes.map((h) => [h.id, h]))
  const groups: Record<SearchGroupId, SearchResult[]> = { heroes: [], builds: [], players: [], matches: [], items: [], patches: [] }

  const heroes = ranked(data.heroes, (h) => h.name, q)
  groups.heroes = heroes.map((h) => ({
    id: `hero-${h.id}`,
    label: h.name,
    description: h.role ? `${cap(h.role)} · hero overview, matchups and items` : 'Hero overview, matchups and items',
    kind: 'internal',
    href: `/heroes/${h.slug}`,
    icon: { type: 'hero', src: h.iconUrl, name: h.name },
  }))

  // Shortcuts for the best-matching hero lead each related group.
  const top = heroes[0] && matchScore(heroes[0].name, q) <= 2 ? heroes[0] : null
  if (top) {
    const icon = { type: 'hero' as const, src: top.iconUrl, name: top.name }
    groups.builds.push({ id: `hero-builds-${top.id}`, label: `${top.name} builds`, description: 'Meta, pro and community builds with tracked results', kind: 'internal', href: `/builds?hero=${top.slug}`, icon })
    groups.players.push({ id: `hero-players-${top.id}`, label: `Top ${top.name} players`, description: 'Hero leaderboard', kind: 'internal', href: `/leaderboard?hero=${top.slug}`, icon })
    groups.matches.push({ id: `hero-matches-${top.id}`, label: `Recent ${top.name} matches`, description: 'High-rank matches with this hero', kind: 'internal', href: `/matches?hero=${top.slug}`, icon })
  }

  for (const b of data.builds) {
    const hero = heroById.get(b.heroId)
    if (!hero || groups.builds.length >= GROUP_LIMIT) continue
    groups.builds.push({
      id: `build-${b.id}`,
      label: b.name,
      description: `${hero.name} build${b.favorites ? ` · ${b.favorites.toLocaleString('en-US')} favorites this week` : ''}`,
      kind: 'internal',
      href: `/builds/${hero.slug}/${b.id}`,
      icon: { type: 'hero', src: hero.iconUrl, name: hero.name },
    })
  }

  // Steam search is fuzzy ("zzx" for "zzqx"): keep names that contain the query (or the exact id), best match first.
  const playerScore = (p: SearchPlayer) => (String(p.accountId) === q ? 0 : matchScore(p.name, q))
  const players = data.players.filter((p) => playerScore(p) >= 0).sort((a, b) => playerScore(a) - playerScore(b))
  for (const p of players) {
    if (groups.players.length >= GROUP_LIMIT) break
    groups.players.push({
      id: `player-${p.accountId}`,
      label: p.name,
      description: `Player${p.matches30d ? ` · ${p.matches30d.toLocaleString('en-US')} matches in 30 days` : ''}`,
      kind: 'internal',
      href: `/players/${p.accountId}`,
      icon: { type: 'avatar', src: p.avatar, name: p.name },
    })
  }

  // A number may be a match ID or a SteamID3; offer both, the pages handle unknown IDs.
  if (/^\d{4,10}$/.test(q)) {
    groups.matches.push({ id: `match-${q}`, label: `Match ${q}`, description: 'Open match by ID', kind: 'internal', href: `/matches/${q}` })
    if (!groups.players.some((r) => r.id === `player-${q}`)) {
      groups.players.push({ id: `account-${q}`, label: `Player ${q}`, description: 'Open profile by SteamID3', kind: 'internal', href: `/players/${q}` })
    }
  }

  groups.items = ranked(data.items, (i) => i.name, q).map((i) => ({
    id: `item-${i.id}`,
    label: i.name,
    description: [i.slot ? cap(i.slot) : null, i.tier ? `Tier ${i.tier}` : null, i.cost ? `${i.cost.toLocaleString('en-US')} souls` : null].filter(Boolean).join(' · ') || 'Item',
    kind: 'internal',
    href: `/items/${i.slug}`,
    icon: { type: 'item', src: i.icon, name: i.name, slot: i.slot, tier: i.tier },
  }))

  groups.patches = data.patches
    .filter((p) => p.link && matchScore(p.title, q) >= 0)
    .slice(0, 3)
    .map((p) => ({
      id: `patch-${p.day}-${p.title}`,
      label: p.title,
      description: `${new Date(p.day * 1000).toISOString().slice(0, 10)} · opens the forum post`,
      kind: 'external',
      href: p.link!,
    }))

  return GROUP_ORDER.filter((g) => groups[g].length > 0).map((g) => ({ id: g, label: GROUP_LABELS[g], results: groups[g] }))
}
