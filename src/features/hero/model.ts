import { compareGroups, type Comparison } from '@/lib/analytics/compare'
import { highPerformingBuild, itemTrend, pairing, patchShift, popularBuild, rankInsights, rankPopularity, splitPerformance, winRateShift, type Insight } from '@/lib/analytics/insights'
import { pickRates } from '@/lib/analytics/pickRate'
import { RANK_BANDS, rankBandLabel, type RankBandId } from '@/lib/analytics/rankBands'
import { sampleTier, type SampleTier } from '@/lib/analytics/sampleTier'
import { wilsonInterval, type Interval } from '@/lib/analytics/wilson'
import { formatDuration, formatPointDelta } from '@/lib/format'

/*
 * Pure Hero Detail model. Every number and sentence is derived from API rows here;
 * nothing is inferred beyond what the metrics state.
 */

const DAY = 86_400

export type HeroRef = { id: number; name: string; slug: string; iconUrl: string | null }

export type Pairing = HeroRef & { wins: number; matches: number; winRate: number; interval: Interval; sample: SampleTier }

function scorePairing(ref: HeroRef, wins: number, matches: number): Pairing {
  return { ...ref, wins, matches, winRate: wins / matches, interval: wilsonInterval(wins, matches), sample: sampleTier(matches) }
}

// ── Matchups and synergies ───────────────────────────────────────────

type CounterRow = { hero_id: number; enemy_hero_id: number; wins: number; matches_played: number }
type SynergyRow = { hero_id1: number; hero_id2: number; wins: number; matches_played: number }

/**
 * Opponents ranked for the hero. "Best" sorts by the interval's lower bound and
 * "worst" by its upper bound, so a small sample can't top either list by luck.
 */
export function matchupsFor(heroId: number, rows: CounterRow[], heroes: Map<number, HeroRef>) {
  const list = rows
    .filter((r) => r.hero_id === heroId && r.matches_played > 0 && heroes.has(r.enemy_hero_id))
    .map((r) => scorePairing(heroes.get(r.enemy_hero_id)!, r.wins, r.matches_played))
  return {
    all: list,
    best: [...list].sort((a, b) => b.interval.low - a.interval.low),
    worst: [...list].sort((a, b) => a.interval.high - b.interval.high),
  }
}

/** Same-team partners, ranked by interval lower bound. Pair order in the API is not fixed. */
export function synergiesFor(heroId: number, rows: SynergyRow[], heroes: Map<number, HeroRef>): Pairing[] {
  return rows
    .filter((r) => (r.hero_id1 === heroId || r.hero_id2 === heroId) && r.matches_played > 0)
    .map((r) => ({ partner: r.hero_id1 === heroId ? r.hero_id2 : r.hero_id1, r }))
    .filter(({ partner }) => heroes.has(partner))
    .map(({ partner, r }) => scorePairing(heroes.get(partner)!, r.wins, r.matches_played))
    .sort((a, b) => b.interval.low - a.interval.low)
}

// ── Splits: rank and match length ────────────────────────────────────

/** Groups the hero's per-badge rows into rank bands (badge 0 = no badge, excluded). */
export function byRank(heroId: number, rows: Array<{ hero_id: number; bucket: number; wins: number; matches: number }>, tierNames: Map<number, string>): Comparison<RankBandId> {
  return compareGroups(
    RANK_BANDS.filter((band) => band.tiers).map((band) => {
      const [from, to] = band.tiers!
      const inBand = rows.filter((r) => r.hero_id === heroId && r.bucket > 0 && Math.floor(r.bucket / 10) >= from && Math.floor(r.bucket / 10) <= to)
      return {
        key: band.id,
        label: rankBandLabel(band, tierNames),
        wins: inBand.reduce((n, r) => n + r.wins, 0),
        matches: inBand.reduce((n, r) => n + r.matches, 0),
      }
    }),
  )
}

export const MATCH_LENGTHS = [
  { key: 'short', label: 'Under 25 min', min: undefined, max: 1_500 },
  { key: 'standard', label: '25–35 min', min: 1_500, max: 2_100 },
  { key: 'long', label: 'Over 35 min', min: 2_100, max: undefined },
] as const
export type MatchLengthKey = (typeof MATCH_LENGTHS)[number]['key']

export function byMatchLength(heroId: number, perRange: Array<Array<{ hero_id: number; wins: number; matches: number }>>): Comparison<MatchLengthKey> {
  return compareGroups(
    MATCH_LENGTHS.map((range, i) => {
      const row = perRange[i]?.find((r) => r.hero_id === heroId)
      return { key: range.key, label: range.label, wins: row?.wins ?? 0, matches: row?.matches ?? 0 }
    }),
  )
}

// ── Ability order ────────────────────────────────────────────────────

export const ABILITY_PREFIX = 8

export type AbilityOrder = { sequence: number[]; wins: number; matches: number; share: number; winRate: number; interval: Interval; sample: SampleTier }

/**
 * Groups full upgrade sequences by their first {@link ABILITY_PREFIX} upgrades.
 * Full sequences are confounded by game length (longer games allow more upgrades),
 * so comparing openings of equal length is the fair view.
 */
export function abilityOpenings(rows: Array<{ abilities: number[]; wins: number; matches: number }>, limit = 4): AbilityOrder[] {
  const groups = new Map<string, { sequence: number[]; wins: number; matches: number }>()
  let total = 0
  for (const row of rows) {
    if (row.abilities.length < ABILITY_PREFIX) continue
    const sequence = row.abilities.slice(0, ABILITY_PREFIX)
    const key = sequence.join(',')
    const group = groups.get(key) ?? groups.set(key, { sequence, wins: 0, matches: 0 }).get(key)!
    group.wins += row.wins
    group.matches += row.matches
    total += row.matches
  }
  return [...groups.values()]
    .sort((a, b) => b.matches - a.matches)
    .slice(0, limit)
    .map((g) => ({ ...g, share: total > 0 ? g.matches / total : 0, winRate: g.wins / g.matches, interval: wilsonInterval(g.wins, g.matches), sample: sampleTier(g.matches) }))
}

// ── Items ────────────────────────────────────────────────────────────

export type ShopItemRef = { id: number; name: string | null; slot: string | null; tier: number | null; cost: number | null; icon: string | null }

export type ProgressionItem = ShopItemRef & { buyRate: number; avgBuyTimeS: number; winRate: number; matches: number; sample: SampleTier }

export const ITEM_PHASES = [
  { key: 'early', label: 'Early (0–10 min)', until: 600 },
  { key: 'mid', label: 'Mid (10–25 min)', until: 1_500 },
  { key: 'late', label: 'Late (25+ min)', until: Infinity },
] as const

/** Items bought in at least this share of the hero's matches count as "core". */
export const CORE_BUY_RATE = 0.15

/**
 * Item progression: commonly bought shop items, ordered by average buy time and grouped by phase.
 * Buy rate = matches with the item ÷ the hero's matches in the same scope.
 */
export function itemProgression(
  rows: Array<{ item_id: number; wins: number; matches: number; avg_buy_time_s: number }>,
  shop: Map<number, ShopItemRef>,
  heroMatches: number,
) {
  const items: ProgressionItem[] = rows
    .filter((r) => shop.has(r.item_id) && heroMatches > 0 && r.matches / heroMatches >= CORE_BUY_RATE)
    .map((r) => ({
      ...shop.get(r.item_id)!,
      buyRate: r.matches / heroMatches,
      avgBuyTimeS: r.avg_buy_time_s,
      winRate: r.wins / r.matches,
      matches: r.matches,
      sample: sampleTier(r.matches),
    }))
    .sort((a, b) => a.avgBuyTimeS - b.avgBuyTimeS)
  let from = 0
  return ITEM_PHASES.map((phase) => {
    const inPhase = items.filter((i) => i.avgBuyTimeS >= from && i.avgBuyTimeS < phase.until)
    from = phase.until
    return { ...phase, items: inPhase }
  })
}

// ── Builds ───────────────────────────────────────────────────────────

export type HeroBuild = {
  id: number
  name: string
  updatedAt: number | null
  /** null when the source reports none. */
  weeklyFavorites: number | null
  stats: { wins: number; matches: number; winRate: number; sample: SampleTier } | null
  categories: Array<{ name: string; items: ShopItemRef[] }>
}

type BuildInput = {
  hero_build: { hero_build_id: number; name: string; last_updated_timestamp?: number | null; details: { mod_categories?: Array<{ name: string; mods?: Array<{ ability_id: number }> | null }> | null } }
  num_weekly_favorites?: number | null
}

/** Joins builds with their game-start win rates. Builds with stats come first (by matches), then by favorites. */
export function buildsWithStats(builds: BuildInput[], stats: Array<{ hero_build_id: number; wins: number; matches: number }>, shop: Map<number, ShopItemRef>): HeroBuild[] {
  const byId = new Map(stats.map((s) => [s.hero_build_id, s]))
  return builds
    .map((b) => {
      const s = byId.get(b.hero_build.hero_build_id)
      return {
        id: b.hero_build.hero_build_id,
        name: b.hero_build.name.trim() || 'Untitled build',
        updatedAt: b.hero_build.last_updated_timestamp ? b.hero_build.last_updated_timestamp * 1000 : null,
        weeklyFavorites: b.num_weekly_favorites || null,
        stats: s ? { wins: s.wins, matches: s.matches, winRate: s.wins / s.matches, sample: sampleTier(s.matches) } : null,
        categories: (b.hero_build.details.mod_categories ?? [])
          .map((c) => ({ name: categoryLabel(c.name), items: (c.mods ?? []).map((m) => shop.get(m.ability_id)).filter((i): i is ShopItemRef => Boolean(i)) }))
          .filter((c) => c.items.length > 0),
      }
    })
    .sort((a, b) => (b.stats?.matches ?? -1) - (a.stats?.matches ?? -1) || (b.weeklyFavorites ?? 0) - (a.weeklyFavorites ?? 0))
}

/**
 * Build section names are free text written by authors (any language), except the game's
 * localization tokens ("#Citadel_HeroBuilds_EarlyGame"), which we translate.
 */
export function categoryLabel(raw: string): string {
  const name = raw.trim()
  const token = /^#Citadel_HeroBuilds_(\w+)$/.exec(name)
  if (token) {
    const words = token[1].replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
    return words.charAt(0).toUpperCase() + words.slice(1)
  }
  return name || 'Untitled section'
}

// ── Trends and patches ───────────────────────────────────────────────

export type DayPoint = { day: number; winRate: number; pickRate: number; matches: number }

type DayRow = { hero_id: number; bucket: number; wins: number; matches: number }

/** Daily win rate and pick rate for one hero (pick rate needs every hero's matches that day). */
export function dailySeries(heroId: number, rows: DayRow[]): DayPoint[] {
  const days = new Map<number, Map<number, number>>()
  const wins = new Map<number, number>()
  for (const r of rows) {
    const day = days.get(r.bucket) ?? days.set(r.bucket, new Map()).get(r.bucket)!
    day.set(r.hero_id, (day.get(r.hero_id) ?? 0) + r.matches)
    if (r.hero_id === heroId) wins.set(r.bucket, (wins.get(r.bucket) ?? 0) + r.wins)
  }
  return [...days.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, perHero]) => (perHero.get(heroId) ?? 0) > 0)
    .map(([day, perHero]) => {
      const matches = perHero.get(heroId)!
      return { day, matches, winRate: (wins.get(day) ?? 0) / matches, pickRate: pickRates(perHero).get(heroId) ?? 0 }
    })
}

export type PatchImpact = {
  title: string
  day: number
  link: string | null
  before: { wins: number; matches: number } | null
  after: { wins: number; matches: number } | null
  /** Facts only: whether the 7-day windows' intervals separate. */
  verdict: 'higher' | 'lower' | 'no clear change' | 'not enough data'
}

/** Win rate in the 7 days before vs the 7 days from each patch (shorter if the next patch came sooner). */
export function patchImpacts(heroId: number, rows: DayRow[], patches: Array<{ title: string; day: number; link: string | null }>, today: number): PatchImpact[] {
  const sum = (from: number, to: number) => {
    const inRange = rows.filter((r) => r.hero_id === heroId && r.bucket >= from && r.bucket < to)
    const matches = inRange.reduce((n, r) => n + r.matches, 0)
    return matches > 0 ? { wins: inRange.reduce((n, r) => n + r.wins, 0), matches } : null
  }
  return patches.map((patch, i) => {
    const next = i > 0 ? patches[i - 1].day : today + DAY
    const before = sum(patch.day - 7 * DAY, patch.day)
    const after = sum(patch.day, Math.min(patch.day + 7 * DAY, next))
    let verdict: PatchImpact['verdict'] = 'not enough data'
    if (before && after && sampleTier(before.matches) !== 'low' && sampleTier(after.matches) !== 'low') {
      const b = wilsonInterval(before.wins, before.matches)
      const a = wilsonInterval(after.wins, after.matches)
      verdict = a.low > b.high ? 'higher' : a.high < b.low ? 'lower' : 'no clear change'
    }
    return { ...patch, before, after, verdict }
  })
}

// ── Insights (Insight Engine, lib/analytics/insights.ts) ─────────────

/**
 * Pick shares per rank band from the all-hero by-badge rows: the hero's matches and every
 * hero's matches in the band (Σ ÷ 12 estimates the band's matches). Badge 0 = no rank, excluded.
 */
export function rankPickBands(heroId: number, rows: Array<{ hero_id: number; bucket: number; matches: number }>, tierNames: Map<number, string>) {
  return RANK_BANDS.filter((band) => band.tiers).map((band) => {
    const [from, to] = band.tiers!
    const inBand = rows.filter((r) => r.bucket > 0 && Math.floor(r.bucket / 10) >= from && Math.floor(r.bucket / 10) <= to)
    return {
      label: rankBandLabel(band, tierNames),
      heroMatches: inBand.filter((r) => r.hero_id === heroId).reduce((n, r) => n + r.matches, 0),
      allHeroMatches: inBand.reduce((n, r) => n + r.matches, 0),
    }
  })
}

type WinLossPair = { wins: number; matches: number }

export type HeroInsightInput = {
  name: string
  winRate: number
  /** Scope text of the selected window and rank, e.g. "Last 30 days, All ranks". */
  scope: string
  /** Scope of the week-over-week comparison (rank only; the weeks are fixed). */
  weekScope: string
  /** Scope of the rank splits (all ranks, selected window). */
  rankScope: string
  weeks: { current: WinLossPair; previous: WinLossPair } | null
  /** The latest patch in the last ~7 weeks, with the hero's 7 days either side; `inWeeks` when it falls in the last 14 days. */
  patch: { title: string; before: WinLossPair | null; after: WinLossPair | null; inWeeks: boolean } | null
  length: Comparison<MatchLengthKey>
  rank: Comparison<RankBandId>
  rankPicks: ReturnType<typeof rankPickBands>
  matchups: { best: Pairing[]; worst: Pairing[] }
  synergies: Pairing[]
  builds: HeroBuild[]
  items: Array<{ name: string; current: { buyers: number; heroMatches: number }; previous: { buyers: number; heroMatches: number } }>
}

/** Every Insight Engine result for a hero, most informative first. Each appears only if its rule passes. */
export function heroInsights(i: HeroInsightInput): Insight[] {
  const weeks = { currentLabel: 'The last 7 days', previousLabel: 'The 7 days before' }
  const tracked = i.builds.flatMap((b) => (b.stats ? [{ name: b.name, wins: b.stats.wins, matches: b.stats.matches }] : []))
  const best = i.matchups.best[0]
  const worst = i.matchups.worst[0]
  const partner = i.synergies[0]
  const weekly = i.weeks ? winRateShift({ subject: i.name, ...i.weeks, ...weeks, scope: i.weekScope }) : null
  const patch = i.patch?.before && i.patch.after ? patchShift({ subject: i.name, patch: i.patch.title, before: i.patch.before, after: i.patch.after, scope: i.weekScope }) : null
  // A patch inside the two compared weeks mostly restates the weekly change; keep it only if it adds something.
  const rate = (w: WinLossPair) => w.wins / w.matches
  const patchUp = i.patch?.before && i.patch.after ? rate(i.patch.after) > rate(i.patch.before) : null
  const sameStory = weekly && patch && i.patch?.inWeeks && patchUp === (weekly.kind === 'rising')
  return rankInsights([
    weekly,
    sameStory ? null : patch,
    rankPopularity({ subject: i.name, bands: i.rankPicks, scope: i.rankScope }),
    splitPerformance({ subject: i.name, by: 'rank', comparison: i.rank, scope: i.rankScope }),
    splitPerformance({ subject: i.name, by: 'length', comparison: i.length, scope: i.scope }),
    highPerformingBuild({ subject: i.name, heroWinRate: i.winRate, builds: tracked, scope: i.scope }),
    only('strong-matchup', best && pairing({ subject: i.name, other: best.name, wins: best.wins, matches: best.matches, relation: 'lane', scope: i.scope })),
    only('weak-matchup', worst && pairing({ subject: i.name, other: worst.name, wins: worst.wins, matches: worst.matches, relation: 'lane', scope: i.scope })),
    itemTrend({ subject: i.name, items: i.items, ...weeks, scope: i.weekScope }),
    partner ? pairing({ subject: i.name, other: partner.name, wins: partner.wins, matches: partner.matches, relation: 'ally', scope: i.scope }) : null,
    popularBuild({ subject: i.name, builds: tracked, scope: i.scope }),
  ])
}

/** The top-ranked opponent can still be a negative matchup (and vice versa); keep only the expected kind. */
const only = (kind: Insight['kind'], insight: Insight | null | undefined) => (insight?.kind === kind ? insight : null)

export function describeDelta(a: number, b: number): string {
  return formatPointDelta(a - b)
}

export { formatDuration }
