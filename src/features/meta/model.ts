import { pickRates, estimatedMatchCount } from '@/lib/analytics/pickRate'
import { sampleTier, type SampleTier } from '@/lib/analytics/sampleTier'
import { TIER_ORDER, TIER_RULES, tierFor, type Tier } from '@/lib/analytics/tiers'
import { trendBetween, type Trend } from '@/lib/analytics/trend'
import { wilsonInterval, type Interval } from '@/lib/analytics/wilson'
import { formatInteger, formatPercent, formatPointDelta } from '@/lib/format'
import type { HeroRole, MetaQuery } from './query'

/*
 * Pure Meta view model: raw API rows in, display-ready data out.
 * Everything shown on the page — including "Why?" — is derived here from metrics alone.
 */

const DAY = 86_400

export type MetaInputHero = { id: number; name: string; className: string; role: string | null; iconUrl: string | null }
export type MetaInputRow = {
  heroId: number
  day: number // unix seconds, UTC day start
  wins: number
  matches: number
  kills: number
  deaths: number
  assists: number
  netWorth: number
}

export type MetaInput = {
  heroes: MetaInputHero[]
  rows: MetaInputRow[]
  query: MetaQuery
  /** Unix seconds of the first UTC day in the selected window. */
  windowStart: number
  /** Unix seconds of today's UTC day start. */
  today: number
  scopeText: string
}

type Totals = { wins: number; matches: number; kills: number; deaths: number; assists: number; netWorth: number }

export type WhyFact = { label: string; text: string }

export type MetaHero = {
  id: number
  slug: string
  name: string
  iconUrl: string | null
  role: string | null
  tier: Tier | null
  sample: SampleTier
  wins: number
  matches: number
  winRate: number
  interval: Interval
  pickRate: number
  pickRank: number
  /** Last 7 days vs the 7 before; null when either week is Low sample. */
  trend: Trend | null
  /** The two weeks behind `trend`; null when either has no matches. */
  weeks: { current: { wins: number; matches: number }; previous: { wins: number; matches: number } } | null
  /** Daily win rates across the window; empty when any day is too small to plot honestly. */
  history: number[]
  why: WhyFact[]
}

export type RoleStat = { role: string; wins: number; matches: number; winRate: number; interval: Interval; heroes: number }

export type MetaModel = {
  heroes: MetaHero[]
  /** Rows for the table after role filter, low-sample filter and sort. */
  rows: MetaHero[]
  hiddenLowSample: number
  tiers: Record<Tier, MetaHero[]>
  summary: {
    matchesAnalyzed: number
    heroesWithData: number
    heroesTotal: number
    strongest: MetaHero[]
    rising: MetaHero[]
    falling: MetaHero[]
    mostPlayed: MetaHero | null
    highestWinRate: MetaHero | null
    roles: RoleStat[]
    /** True only when the top role's interval is entirely above every other role's. */
    roleLeaderIsClear: boolean
  }
}

const MIN_DAILY_MATCHES_FOR_HISTORY = 100

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function emptyTotals(): Totals {
  return { wins: 0, matches: 0, kills: 0, deaths: 0, assists: 0, netWorth: 0 }
}

function add(totals: Totals, row: MetaInputRow) {
  totals.wins += row.wins
  totals.matches += row.matches
  totals.kills += row.kills
  totals.deaths += row.deaths
  totals.assists += row.assists
  totals.netWorth += row.netWorth
}

export function buildMetaModel({ heroes, rows, query, windowStart, today, scopeText }: MetaInput): MetaModel {
  const currentWeekStart = today - 6 * DAY
  const previousWeekStart = today - 13 * DAY

  const window = new Map<number, Totals>()
  const currentWeek = new Map<number, Totals>()
  const previousWeek = new Map<number, Totals>()
  const daily = new Map<number, Map<number, Totals>>()
  const get = (map: Map<number, Totals>, id: number) => map.get(id) ?? map.set(id, emptyTotals()).get(id)!

  for (const row of rows) {
    if (row.day >= windowStart) {
      add(get(window, row.heroId), row)
      const days = daily.get(row.heroId) ?? daily.set(row.heroId, new Map()).get(row.heroId)!
      add(get(days, row.day), row)
    }
    if (row.day >= currentWeekStart) add(get(currentWeek, row.heroId), row)
    else if (row.day >= previousWeekStart) add(get(previousWeek, row.heroId), row)
  }

  const known = heroes.filter((hero) => (window.get(hero.id)?.matches ?? 0) > 0)
  const matchesByHero = new Map(known.map((hero) => [hero.id, window.get(hero.id)!.matches]))
  const picks = pickRates(matchesByHero)
  const pickOrder = [...picks.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)

  // Role and all-hero baselines for "Why?" comparisons.
  const all = emptyTotals()
  const byRole = new Map<string, Totals & { heroes: number }>()
  for (const hero of known) {
    const totals = window.get(hero.id)!
    add(all, { ...totals, heroId: hero.id, day: 0 })
    if (hero.role) {
      const role = byRole.get(hero.role) ?? byRole.set(hero.role, { ...emptyTotals(), heroes: 0 }).get(hero.role)!
      add(role, { ...totals, heroId: hero.id, day: 0 })
      role.heroes += 1
    }
  }
  const roles: RoleStat[] = [...byRole.entries()]
    .map(([role, t]) => ({ role, wins: t.wins, matches: t.matches, winRate: t.wins / t.matches, interval: wilsonInterval(t.wins, t.matches), heroes: t.heroes }))
    .sort((a, b) => b.winRate - a.winRate)
  const roleLeaderIsClear = roles.length > 1 && roles.slice(1).every((r) => roles[0].interval.low > r.interval.high)
  const avgNetWorth = all.matches > 0 ? all.netWorth / all.matches : 0

  const metaHeroes: MetaHero[] = known.map((hero) => {
    const t = window.get(hero.id)!
    const days = [...(daily.get(hero.id)?.entries() ?? [])].sort((a, b) => a[0] - b[0])
    const history = days.length >= 3 && days.every(([, d]) => d.matches >= MIN_DAILY_MATCHES_FOR_HISTORY) ? days.slice(-14).map(([, d]) => d.wins / d.matches) : []
    const cur = currentWeek.get(hero.id)
    const prev = previousWeek.get(hero.id)
    const trend = cur && prev ? trendBetween(cur, prev) : null
    const base = {
      id: hero.id,
      slug: slugify(hero.name),
      name: hero.name,
      iconUrl: hero.iconUrl,
      role: hero.role,
      tier: tierFor(t.wins, t.matches),
      sample: sampleTier(t.matches),
      wins: t.wins,
      matches: t.matches,
      winRate: t.wins / t.matches,
      interval: wilsonInterval(t.wins, t.matches),
      pickRate: picks.get(hero.id) ?? 0,
      pickRank: pickOrder.indexOf(hero.id) + 1,
      trend,
      weeks: cur && prev && cur.matches > 0 && prev.matches > 0 ? { current: { wins: cur.wins, matches: cur.matches }, previous: { wins: prev.wins, matches: prev.matches } } : null,
      history,
    }
    return {
      ...base,
      why: whyFacts(base, {
        totals: t,
        cur,
        prev,
        scopeText,
        heroCount: known.length,
        role: hero.role ? roles.find((r) => r.role === hero.role) ?? null : null,
        avgNetWorth,
      }),
    }
  })

  const ranked = (list: MetaHero[]) => sortHeroes(list, query)
  const inRole = query.role === 'all' ? metaHeroes : metaHeroes.filter((h) => h.role === query.role)
  const reliable = inRole.filter((h) => h.sample !== 'low')
  const tableRows = ranked(query.showLow ? inRole : reliable)

  const tiers = Object.fromEntries(TIER_ORDER.map((tier) => [tier, reliable.filter((h) => h.tier === tier).sort((a, b) => b.interval.low - a.interval.low)])) as Record<Tier, MetaHero[]>

  const byDelta = (direction: 'rising' | 'falling') =>
    reliable.filter((h) => h.trend?.direction === direction).sort((a, b) => Math.abs(b.trend!.delta) - Math.abs(a.trend!.delta)).slice(0, 3)

  const highSample = reliable.filter((h) => h.sample === 'high')

  return {
    heroes: metaHeroes,
    rows: tableRows,
    hiddenLowSample: query.showLow ? 0 : inRole.length - reliable.length,
    tiers,
    summary: {
      matchesAnalyzed: estimatedMatchCount(matchesByHero),
      heroesWithData: metaHeroes.filter((h) => h.sample !== 'low').length,
      heroesTotal: heroes.length,
      strongest: [...tiers.S, ...tiers.A].slice(0, 3),
      rising: byDelta('rising'),
      falling: byDelta('falling'),
      mostPlayed: [...reliable].sort((a, b) => b.pickRate - a.pickRate)[0] ?? null,
      highestWinRate: [...highSample].sort((a, b) => b.winRate - a.winRate)[0] ?? null,
      roles,
      roleLeaderIsClear,
    },
  }
}

export function sortHeroes(list: MetaHero[], query: Pick<MetaQuery, 'sort' | 'dir'>): MetaHero[] {
  const sign = query.dir === 'asc' ? -1 : 1
  const tierRank = (h: MetaHero) => (h.tier ? TIER_ORDER.indexOf(h.tier) : TIER_ORDER.length)
  const compare: Record<MetaQuery['sort'], (a: MetaHero, b: MetaHero) => number> = {
    // Tier first (S → C, then no tier), then by how far the interval sits above 50%.
    tier: (a, b) => tierRank(a) - tierRank(b) || b.interval.low - a.interval.low,
    winRate: (a, b) => b.winRate - a.winRate,
    pickRate: (a, b) => b.pickRate - a.pickRate,
    matches: (a, b) => b.matches - a.matches,
  }
  return [...list].sort((a, b) => sign * compare[query.sort](a, b))
}

type WhyContext = {
  totals: Totals
  cur: Totals | undefined
  prev: Totals | undefined
  scopeText: string
  heroCount: number
  role: RoleStat | null
  avgNetWorth: number
}

/** Plain statements of observed numbers. No causes, no speculation. */
export function whyFacts(hero: Omit<MetaHero, 'why'>, ctx: WhyContext): WhyFact[] {
  const facts: WhyFact[] = [
    {
      label: 'Result',
      text: `Won ${formatPercent(hero.winRate)} of ${formatInteger(hero.matches)} matches (${ctx.scopeText}).`,
    },
    {
      label: 'Certainty',
      text:
        hero.sample === 'low'
          ? `Only ${formatInteger(hero.matches)} matches: too few to place in a tier.`
          : `95% interval ${formatPercent(hero.interval.low)}–${formatPercent(hero.interval.high)}. ${
              hero.tier ? `Tier ${hero.tier}: ${TIER_RULES[hero.tier].toLowerCase()}.` : ''
            }`,
    },
    {
      label: 'Popularity',
      text: `Picked in ${formatPercent(hero.pickRate)} of matches, ${ordinal(hero.pickRank)} most picked of ${ctx.heroCount} heroes.`,
    },
  ]

  if (ctx.cur && ctx.prev && ctx.cur.matches > 0 && ctx.prev.matches > 0) {
    const curRate = ctx.cur.wins / ctx.cur.matches
    const prevRate = ctx.prev.wins / ctx.prev.matches
    const verdict = !hero.trend
      ? 'One of the weeks has too few matches to call a trend.'
      : hero.trend.direction === 'stable'
        ? 'The two weeks’ intervals overlap, so this is treated as stable.'
        : `The two weeks’ intervals do not overlap, so this counts as ${hero.trend.direction}.`
    facts.push({
      label: 'Trend',
      text: `Last 7 days ${formatPercent(curRate)} (${formatInteger(ctx.cur.matches)} matches) vs the 7 days before ${formatPercent(prevRate)} (${formatInteger(ctx.prev.matches)}): ${formatPointDelta(curRate - prevRate)}. ${verdict}`,
    })
  } else {
    facts.push({
      label: 'Trend',
      text: `No matches in ${ctx.cur?.matches ? 'the 7 days before' : 'the last 7 days'} for this scope, so no trend can be computed.`,
    })
  }

  if (ctx.role && hero.role) {
    facts.push({
      label: 'Role',
      text: `${capitalize(hero.role)} heroes together won ${formatPercent(ctx.role.winRate)} in this scope; ${hero.name} is ${formatPointDelta(hero.winRate - ctx.role.winRate)} from that.`,
    })
  }

  const t = ctx.totals
  if (t.matches > 0) {
    const perMatch = (n: number) => (n / t.matches).toFixed(1)
    const netWorth = t.netWorth / t.matches
    const nwDiff = ctx.avgNetWorth > 0 ? (netWorth - ctx.avgNetWorth) / ctx.avgNetWorth : 0
    facts.push({
      label: 'Per match',
      text: `Average K/D/A ${perMatch(t.kills)} / ${perMatch(t.deaths)} / ${perMatch(t.assists)}. Average final souls ${formatInteger(Math.round(netWorth))} (${nwDiff >= 0 ? '+' : '−'}${Math.abs(nwDiff * 100).toFixed(0)}% vs the all-hero average).`,
    })
  }
  return facts
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${suffix}`
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export type { HeroRole }
