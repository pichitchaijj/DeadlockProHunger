import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'
import en from '@/i18n/messages/en'
import { comparisonText, ordinal, peerComparison, trendRangeText, type PeerComparison, type PeerHero, type TrendRange } from '@/features/analyze/model'
import { sampleTier, SAMPLE_TIER_THRESHOLDS } from '@/lib/analytics/sampleTier'
import { wilsonInterval } from '@/lib/analytics/wilson'
import { dateFormat, formatInteger, formatPercent, formatPointDelta } from '@/lib/format'

/*
 * The Analyze workspace words its prose from the catalog (analyze.*). These checks pin the English catalog
 * to the exact sentences the page produced before localization (templates copied from the pre-localization
 * components), so the English output can't drift. The insight grid is the Insight Engine's and isn't covered.
 */

const t = createTranslator({ locale: 'en', messages: en, namespace: 'analyze' })
const compareT = createTranslator({ locale: 'en', messages: en, namespace: 'analyze.compare' })
const trendsT = createTranslator({ locale: 'en', messages: en, namespace: 'analyze.trends' })
const fmt = { percent: (x: number) => formatPercent(x), delta: (x: number) => formatPointDelta(x) }

// ── Pre-localization templates (features/analyze/components/Sections.tsx) ──

function oldComparison(c: PeerComparison, heroName: string, groupLabel: string, selfWinRate: number | null) {
  if (c.winRatePosition === null || selfWinRate === null) return `${heroName} has a Low sample in this scope, so it isn’t ranked or compared.`
  const versus =
    c.rest && c.versusRest === 'higher'
      ? `Higher than the other ${groupLabel} combined (${formatPercent(c.rest.winRate)}, ${formatPointDelta(selfWinRate - c.rest.winRate)}); the 95% intervals don’t overlap.`
      : c.rest && c.versusRest === 'lower'
        ? `Lower than the other ${groupLabel} combined (${formatPercent(c.rest.winRate)}, ${formatPointDelta(selfWinRate - c.rest.winRate)}); the 95% intervals don’t overlap.`
        : c.rest && c.versusRest === 'within'
          ? `Not clearly different from the other ${groupLabel} combined (${formatPercent(c.rest.winRate)}): the intervals overlap or the gap is under 1 point.`
          : ''
  return `${ordinal(c.winRatePosition)} highest win rate and ${ordinal(c.pickRatePosition ?? 0)} highest pick rate of ${c.ranked} ${groupLabel} with enough data. ${versus}`
}

const DAY_LABEL = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
function oldRange(range: TrendRange, windowLabel: string, rankLabel: string) {
  const dates = `${DAY_LABEL.format(range.from * 1000)} – ${DAY_LABEL.format(range.to * 1000)}`
  return `Daily values for the selected window, ${windowLabel}: ${dates} (${range.requestedDays} ${range.requestedDays === 1 ? 'day' : 'days'}), ${rankLabel}. Patch days are marked.${
    range.missingDays > 0 ? ` The source has no daily data for ${range.missingDays} of these days, so the charts show ${range.points.length}.` : ''
  }`
}

/* Synthetic inputs only (not real statistics). */
function hero(id: number, role: string, wins: number, matches: number, pickRate = 0.1): PeerHero {
  return { id, slug: `hero-${id}`, name: `Hero ${id}`, iconUrl: null, role, wins, matches, winRate: wins / matches, interval: wilsonInterval(wins, matches), sample: sampleTier(matches), pickRate }
}

describe('Analyze English wording: ordinals', () => {
  it('formats every position like the old ordinal()', () => {
    for (let n = 0; n <= 130; n++) {
      expect(compareT('standing', { win: n, pick: n, count: 5, group: 'x' })).toBe(`${ordinal(n)} highest win rate and ${ordinal(n)} highest pick rate of 5 x with enough data.`)
      expect(t('summary.pickWhy', { hero: 'Haze', rank: n, count: 38 })).toBe(`Share of matches with Haze in this scope: hero matches ÷ (all hero matches ÷ 12). ${ordinal(n)} most picked of 38 heroes.`)
    }
  })
})

describe('Analyze English wording: peer comparison', () => {
  const heroes = [
    hero(1, 'marksman', 5_600, 10_000, 0.3),
    hero(2, 'marksman', 4_900, 10_000, 0.4),
    hero(3, 'marksman', 5_000, 10_000, 0.2),
    hero(4, 'marksman', 90, 150, 0.01), // Low sample
    hero(5, 'mystic', 6_000, 10_000, 0.5),
    ...Array.from({ length: 20 }, (_, i) => hero(10 + i, 'brawler', 5_000 + i * 7, 10_000, 0.05 + i * 0.01)),
  ]
  const cases: Array<[PeerComparison, string]> = [
    [peerComparison(heroes, 1, 'role')!, 'Marksman heroes'], // higher
    [peerComparison(heroes, 2, 'role')!, 'Marksman heroes'], // lower
    [peerComparison(heroes, 3, 'role')!, 'Marksman heroes'], // within or lower
    [peerComparison(heroes, 4, 'role')!, 'Marksman heroes'], // Low sample
    [peerComparison(heroes, 12, 'all')!, 'all heroes'], // positions past 10 (11th–13th, 21st…)
    [peerComparison(heroes, 21, 'all')!, 'all heroes'],
    [peerComparison(heroes, 22, 'role')!, 'Brawler heroes'],
    [peerComparison([hero(1, 'marksman', 50, 100)], 1, 'role')!, 'Marksman heroes'], // no rest: no second sentence
  ]

  it('keeps every branch of the sentence (higher / lower / within / no rest / Low sample)', () => {
    const kinds = new Set<string>()
    for (const [c, group] of cases) {
      const self = c.rows.find((r) => r.selected)!
      kinds.add(String(c.versusRest))
      expect(comparisonText(c, { hero: self.name, group, selfWinRate: self.winRate }, (k, v) => compareT(k as 'standing', v), fmt)).toBe(oldComparison(c, self.name, group, self.winRate))
    }
    expect(kinds).toEqual(new Set(['higher', 'lower', 'within', 'null']))
  })

  it('keeps the group, title and filter wording', () => {
    expect(compareT('groupRole', { role: 'Marksman' })).toBe('Marksman heroes')
    expect(compareT('groupAll')).toBe('all heroes')
    expect(compareT('panelTitle', { hero: 'Haze', group: 'Assassin heroes' })).toBe('Haze among Assassin heroes')
  })
})

describe('Analyze English wording: trends and summary', () => {
  const DAY = 86_400
  const today = 20_368 * DAY
  const points = (n: number) => Array.from({ length: n }, (_, i) => ({ day: today - i * DAY, winRate: 0.5, pickRate: 0.1, matches: 1_000 }))
  const day = dateFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })

  it('keeps the trend range line (one day / many, with and without missing days)', () => {
    const ranges: TrendRange[] = [
      { points: points(7), from: today - 6 * DAY, to: today, requestedDays: 7, missingDays: 0 },
      { points: points(29), from: today - 29 * DAY, to: today, requestedDays: 30, missingDays: 1 },
      { points: points(1), from: today, to: today, requestedDays: 1, missingDays: 0 },
      { points: [], from: today, to: today, requestedDays: 1, missingDays: 1 },
    ]
    for (const r of ranges) {
      const dates = `${day.format(r.from * 1000)} – ${day.format(r.to * 1000)}`
      expect(trendRangeText(r, { window: 'last 7 days', rank: 'All ranks', dates }, (k, v) => trendsT(k as 'range', v))).toBe(oldRange(r, 'last 7 days', 'All ranks'))
    }
    expect(trendsT('fallback', { window: 'last 30 days', rank: 'Archon – Oracle' })).toBe('Daily values for last 30 days, Archon – Oracle.')
  })

  it('keeps the stat-card explanations and notes', () => {
    const v = { wins: formatInteger(5_612), matches: formatInteger(10_234), low: '53.9%', high: '55.9%' }
    expect(t('summary.winWhy', v)).toBe(`Won ${v.wins} of ${v.matches} matches. The 95% interval is ${v.low}–${v.high}.`)
    expect(t('summary.winWhyNoTrend', v)).toBe(`Won ${v.wins} of ${v.matches} matches. The 95% interval is ${v.low}–${v.high}. The weekly trend needs a non-Low sample in both weeks, so none is shown.`)
    expect(t.markup('summary.lowSample', { strong: (c) => `<b>${c}</b>`, matches: '312', threshold: formatInteger(SAMPLE_TIER_THRESHOLDS.moderate) })).toBe(
      `<b>Low sample:</b> 312 matches (under ${formatInteger(SAMPLE_TIER_THRESHOLDS.moderate)}). The numbers below are shown for reference only: they aren’t ranked, compared or used for insights. Try a longer window or a broader rank band.`,
    )
    expect(t('summary.noMatches', { hero: 'Haze' })).toBe('No matches for Haze in this scope, so there is nothing to measure. Try a longer window or a broader rank band.')
    expect(t('roles.heroCount', { count: 9 })).toBe('9 heroes')
    expect(t('roles.record', { wins: '1,234', matches: '2,500' })).toBe('1,234 wins / 2,500 hero-matches')
    expect(t('method.sampleText', { moderate: formatInteger(SAMPLE_TIER_THRESHOLDS.moderate), high: formatInteger(SAMPLE_TIER_THRESHOLDS.high) })).toBe(
      `Under ${formatInteger(SAMPLE_TIER_THRESHOLDS.moderate)} matches is a Low sample: shown muted, never ranked, compared or turned into an insight. Over ${formatInteger(SAMPLE_TIER_THRESHOLDS.high)} is High.`,
    )
    expect(t('matchups.bestDescription', { count: '24' })).toBe('24 lane opponents with enough games.')
    expect(t('controls.analyzing', { hero: 'Haze' })).toBe('(analyzing Haze)')
    expect(t.markup('builds.noTracked', { link: (c) => `<a>${c}</a>` })).toBe(
      'None of this week’s most-favorited builds has tracked matches in this scope, so there is no build performance to show here. A longer window often has some; the <a>Builds page</a> uses the last 30 days for the same rank band.',
    )
  })
})
