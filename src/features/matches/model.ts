/*
 * Pure mapping from API match data to readable view models.
 * Nothing raw reaches the UI: team ids become "Team 1/2", badges become rank names,
 * enum strings become plain words, timestamps become dates.
 */

const NUMERALS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI']

export type HeroLite = { id: number; name: string; slug: string; iconUrl: string | null }

export type MatchPlayer = {
  accountId: number
  hero: HeroLite
  kills: number
  deaths: number
  assists: number
  netWorth: number | null
  focus: boolean
}

export type MatchTeam = { label: 'Team 1' | 'Team 2'; won: boolean; players: MatchPlayer[]; netWorth: number | null }

export type MatchRow = {
  id: number
  startedAt: number // unix ms
  durationS: number
  mode: 'Ranked' | 'Unranked'
  rank: string | null
  patch: string | null
  teams: [MatchTeam, MatchTeam]
  /** The filtered hero's or player's side, when a filter gives the match a perspective. */
  focus: { label: string; won: boolean; kda: string } | null
}

type RawMatch = {
  match_id: number
  start_time: string
  winning_team: string
  duration_s: number
  match_mode: string
  average_badge?: number | null
  players: Array<{ account_id: number; hero_id: number; team: string; kills: number; deaths: number; assists: number; net_worth?: number | null }>
}

export function rankName(badge: number | null | undefined, tierNames: Map<number, string>): string | null {
  if (!badge) return null
  const tier = Math.floor(badge / 10)
  return `${tierNames.get(tier) ?? `Tier ${tier}`} ${NUMERALS[badge % 10] ?? ''}`.trim()
}

const PATCH_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** Readable label ("Sep 29") of the latest patch dated on or before the match (patches newest first, days in unix seconds). */
export function patchFor(startedAtMs: number, patches: Array<{ title: string; day: number }>): string | null {
  const patch = patches.find((p) => p.day * 1000 <= startedAtMs)
  return patch ? PATCH_DATE.format(patch.day * 1000) : null
}

/** "2026-10-06 10:47:00" (UTC) → unix ms. */
export function parseUtc(value: string): number {
  return Date.parse(`${value.replace(' ', 'T')}Z`)
}

export function toMatchRow(
  raw: RawMatch,
  ctx: {
    heroes: Map<number, HeroLite>
    tierNames: Map<number, string>
    patches: Array<{ title: string; day: number }>
    focusHeroId: number | null
    focusAccountId: number | null
    focusLabel: string | null
  },
): MatchRow {
  const startedAt = parseUtc(raw.start_time)
  const team = (id: 'Team0' | 'Team1', label: MatchTeam['label']): MatchTeam => {
    const players = raw.players
      .filter((p) => p.team === id)
      .map((p) => ({
        accountId: p.account_id,
        hero: ctx.heroes.get(p.hero_id) ?? { id: p.hero_id, name: 'Unknown hero', slug: '', iconUrl: null },
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        netWorth: p.net_worth ?? null,
        focus: p.account_id === ctx.focusAccountId || (ctx.focusAccountId === null && p.hero_id === ctx.focusHeroId),
      }))
    const worths = players.map((p) => p.netWorth)
    return { label, won: raw.winning_team === id, players, netWorth: worths.every((w) => w !== null) ? worths.reduce<number>((n, w) => n + w!, 0) : null }
  }
  const teams: [MatchTeam, MatchTeam] = [team('Team0', 'Team 1'), team('Team1', 'Team 2')]
  const focused = teams.flatMap((t) => t.players.map((p) => ({ p, won: t.won }))).find(({ p }) => p.focus)

  return {
    id: raw.match_id,
    startedAt,
    durationS: raw.duration_s,
    mode: raw.match_mode === 'Ranked' ? 'Ranked' : 'Unranked',
    rank: rankName(raw.average_badge, ctx.tierNames),
    patch: patchFor(startedAt, ctx.patches),
    teams,
    focus: focused ? { label: ctx.focusLabel ?? focused.p.hero.name, won: focused.won, kda: `${focused.p.kills} / ${focused.p.deaths} / ${focused.p.assists}` } : null,
  }
}

// ── Live (watch tab) ─────────────────────────────────────────────────

export type LiveMatch = {
  id: number
  minutes: number | null
  /** Team 1 share of total net worth, 0–1. */
  team1Share: number | null
  spectators: number
  ranked: boolean
  heroes: [HeroLite[], HeroLite[]]
}

type RawActive = {
  match_id?: number | null
  start_time?: number | null
  duration_s?: number | null
  game_mode_parsed?: string | null
  match_mode_parsed?: string | null
  net_worth_team_0?: number | null
  net_worth_team_1?: number | null
  spectators?: number | null
  players?: Array<{ hero_id?: number | null; team?: number | null }> | null
}

/** Normal-mode watch-tab matches, most watched first. Raw enum strings are mapped, never shown. */
export function liveSummary(active: RawActive[], heroes: Map<number, HeroLite>, nowMs: number) {
  const normal = active.filter((m) => m.game_mode_parsed?.endsWith('GameModeNormal') && m.match_id)
  const ranked = normal.filter((m) => m.match_mode_parsed === 'Ranked').length
  const featured: LiveMatch[] = [...normal]
    .sort((a, b) => (b.spectators ?? 0) - (a.spectators ?? 0))
    .slice(0, 4)
    .map((m) => {
      const total = (m.net_worth_team_0 ?? 0) + (m.net_worth_team_1 ?? 0)
      const elapsedS = m.duration_s ?? (m.start_time != null ? Math.max(0, nowMs / 1000 - m.start_time) : null)
      const side = (team: number) =>
        (m.players ?? []).filter((p) => p.team === team && p.hero_id != null && heroes.has(p.hero_id)).map((p) => heroes.get(p.hero_id!)!)
      return {
        id: m.match_id!,
        minutes: elapsedS === null ? null : Math.floor(elapsedS / 60),
        team1Share: total > 0 ? (m.net_worth_team_0 ?? 0) / total : null,
        spectators: m.spectators ?? 0,
        ranked: m.match_mode_parsed === 'Ranked',
        heroes: [side(0), side(1)],
      }
    })
  return { total: normal.length, ranked, featured }
}
