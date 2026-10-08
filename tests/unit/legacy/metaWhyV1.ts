/*
 * Meta "Why?" wording v1, kept verbatim as the English regression oracle for tests/unit/meta-text.test.ts:
 * the pre-localization features/meta/model.ts whyFacts() (finished English facts) and the English
 * Home pulse "why" composition from features/home/loaders.ts. Test-only: never import it from src/.
 */
import { TIER_RULES } from '@/lib/analytics/tiers'
import { formatInteger, formatPercent, formatPointDelta } from '@/lib/format'
import type { MetaHero } from '@/features/meta/model'

type Totals = { wins: number; matches: number; kills: number; deaths: number; assists: number; netWorth: number }
type RoleStat = { role: string; winRate: number }
export type WhyFact = { label: string; text: string }

export type WhyContext = {
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

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}


// ── Home pulse "why" (features/home/loaders.ts) ──────────────────────

const whyText = (facts: WhyFact[]) => facts.map((f) => f.text).join(' ')
export const pulseWhy = {
  highestWinRate: (facts: WhyFact[]) => whyText(facts),
  mostPicked: (name: string, pickRate: number, facts: WhyFact[]) => `${name} appeared in ${(pickRate * 100).toFixed(1)}% of matches (pick rate = its matches ÷ total matches ÷ 12 slots). ${whyText(facts)}`,
  mover: (facts: WhyFact[]) => `Last 7 days vs the 7 before, and the two weeks’ intervals don’t overlap. ${whyText(facts)}`,
}
