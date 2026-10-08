import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'
import en from '@/i18n/messages/en'
import { clearlyHigher, differenceText, groupDifferences, rateDifference, ratioDifference, type Difference, type Group, type GroupKind, type Rate, type WinRateContext } from '@/features/compare/model'
import { wilsonInterval } from '@/lib/analytics/wilson'
import { sampleTier } from '@/lib/analytics/sampleTier'
import { formatCompact, formatInteger, formatPercent } from '@/lib/format'

/*
 * Compare words its differences and prose from the catalog (compare.*). These checks pin the English
 * catalog to the exact sentences the model, loaders and views produced before localization (templates
 * copied from the pre-localization code), so the English output can't drift.
 */

const rate = (wins: number, matches: number): Rate => ({ winRate: wins / matches, interval: wilsonInterval(wins, matches), matches, sample: sampleTier(matches) })
const d = createTranslator({ locale: 'en', messages: en, namespace: 'compare.differences' })
const t = createTranslator({ locale: 'en', messages: en, namespace: 'compare' })
const lengths = createTranslator({ locale: 'en', messages: en, namespace: 'heroes.parts.lengths' })
const words = (x: Difference) =>
  differenceText(x, (key, values) => d(key as 'winRate', values), {
    percent: (v) => formatPercent(v),
    integer: (v) => formatInteger(v),
    compact: (v) => formatCompact(v),
    groupLabel: (group, key, label) => (group === 'length' ? lengths(key as 'short') : label),
  })

// ── Pre-localization templates (features/compare/model.ts and loaders.ts) ──

function oldRate(context: string, a: Rate, b: Rate) {
  const winner = clearlyHigher(a, b)
  if (!winner) return null
  const [w, l] = winner === 'a' ? [a, b] : [b, a]
  return {
    side: winner,
    text: `Higher win rate${context ? ` ${context}` : ''}`,
    detail: `${formatPercent(w.winRate)} vs ${formatPercent(l.winRate)} (intervals don’t overlap; n = ${w.matches.toLocaleString('en-US')} vs ${l.matches.toLocaleString('en-US')})`,
  }
}

function oldGroups(groups: Group[], phrase: (label: string) => string, unit: string) {
  const compared = groups.filter((g) => g.a && g.b && g.a.matches > 0 && g.b.matches > 0)
  const found = groups.flatMap((g) => {
    const x = g.a && g.b ? oldRate(phrase(g.label), g.a, g.b) : null
    return x ? [{ ...x, label: g.label }] : []
  })
  return (['a', 'b'] as const).flatMap((side) => {
    const mine = found.filter((x) => x.side === side)
    if (mine.length === 0) return []
    if (mine.length === 1) return [{ side, text: mine[0].text, detail: mine[0].detail }]
    const text = `Higher win rate in ${mine.length === compared.length ? `all ${compared.length}` : `${mine.length} of ${compared.length}`} ${unit}`
    return [{ side, text, detail: mine.map((x) => `${x.label}: ${x.detail.split(' (')[0]}`).join(' · ') + ' (each interval separated)' }]
  })
}

const OLD_PHRASE: Record<GroupKind, [(label: string) => string, string]> = {
  length: [(l) => `in matches ${l.toLowerCase()}`, 'match lengths'],
  rank: [(l) => `at ${l}`, 'rank bands'],
  hero: [(l) => `on ${l}`, 'shared heroes'],
}

const hi = rate(5_600, 10_000)
const lo = rate(5_000, 10_000)
const big = rate(61_234, 112_000)

describe('Compare English wording: differences', () => {
  it('keeps every single win-rate statement', () => {
    const cases: Array<[WinRateContext, string]> = [
      [{ kind: 'all' }, ''],
      [{ kind: 'overall' }, 'overall'],
      [{ kind: 'ranked' }, 'in ranked matches'],
      [{ kind: 'length', key: 'short', label: 'Under 25 min' }, 'in matches under 25 min'],
      [{ kind: 'length', key: 'standard', label: '25–35 min' }, 'in matches 25–35 min'],
      [{ kind: 'length', key: 'long', label: 'Over 35 min' }, 'in matches over 35 min'],
      [{ kind: 'rank', key: 'top', label: 'Eternus – Ascendant' }, 'at Eternus – Ascendant'],
      [{ kind: 'hero', key: '6', label: 'Abrams' }, 'on Abrams'],
    ]
    for (const [context, old] of cases) {
      for (const [a, b] of [[hi, lo], [lo, big]]) {
        const next = rateDifference(context, a, b)!
        const prev = oldRate(old, a, b)!
        expect(next.side).toBe(prev.side)
        expect(words(next)).toEqual({ text: prev.text, detail: prev.detail })
      }
    }
  })

  it('keeps merged group statements (all / some) for every group kind', () => {
    const labels: Record<GroupKind, Array<[string, string]>> = {
      length: [['short', 'Under 25 min'], ['standard', '25–35 min'], ['long', 'Over 35 min']],
      rank: [['low', 'Initiate – Seeker'], ['mid', 'Alchemist – Arcanist'], ['high', 'Ritualist – Emissary']],
      hero: [['6', 'Abrams'], ['7', 'Wraith'], ['13', 'Haze']],
    }
    for (const kind of ['length', 'rank', 'hero'] as const) {
      const [k1, k2, k3] = labels[kind]
      for (const third of [rate(5_800, 10_000), rate(5_000, 10_000)]) {
        const groups: Group[] = [
          { key: k1[0], label: k1[1], a: hi, b: lo },
          { key: k2[0], label: k2[1], a: rate(5_700, 10_000), b: lo },
          { key: k3[0], label: k3[1], a: third, b: rate(5_010, 10_000) },
        ]
        const next = groupDifferences(groups, kind).map((x) => ({ side: x.side, ...words(x) }))
        expect(next).toEqual(oldGroups(groups, ...OLD_PHRASE[kind]))
      }
    }
  })

  it('keeps the ratio, trend, lane, build and rank statements', () => {
    expect(words(ratioDifference('pickRate', 0.12, 0.05)!)).toEqual({ text: 'Picked more often', detail: `${formatPercent(0.12)} vs ${formatPercent(0.05)}` })
    expect(words(ratioDifference('favorites', 1_240, 310, 2)!)).toEqual({ text: 'More favorites this week', detail: `${formatCompact(1_240)} vs ${formatCompact(310)}` })
    expect(words({ side: 'a', kind: 'rising' })).toEqual({ text: 'Rising this week', detail: 'Last 7 days vs the 7 before: intervals don’t overlap' })
    const lane = { winRate: 0.547, matches: 12_345 }
    expect(words({ side: 'a', kind: 'lane', heroA: 'Abrams', heroB: 'Haze', opponent: 'Haze', ...lane })).toEqual({
      text: 'Wins the lane matchup against Haze',
      detail: `Abrams wins ${formatPercent(lane.winRate)} of ${lane.matches.toLocaleString('en-US')} lane matchups vs Haze`,
    })
    expect(words({ side: 'b', kind: 'aboveHero', hero: 'Wraith', winRate: 0.56, heroWinRate: 0.51 })).toEqual({
      text: 'Above its hero’s overall win rate',
      detail: `${formatPercent(0.56)} vs Wraith ${formatPercent(0.51)} (interval entirely above)`,
    })
    expect(words({ side: 'a', kind: 'rank', higher: 'Oracle IV', lower: 'Archon II' })).toEqual({ text: 'Higher current rank', detail: 'Oracle IV vs Archon II' })
  })
})

describe('Compare English wording: page prose', () => {
  it('keeps the sentences built from data', () => {
    expect(t('parts.noDifferences', { scope: 'Last 7 days, All ranks' })).toBe('No clear differences in Last 7 days, All ranks: every compared win-rate interval overlaps, and no other measure differs enough to call.')
    expect(t('parts.noneAhead', { name: 'Abrams' })).toBe('No measure where Abrams is clearly ahead.')
    expect(t('parts.barValue', { rate: '52.1%', count: String(12345) })).toBe('52.1% over 12345 matches')
    expect(t('parts.barsLegend', { scale: '40%–60%' })).toBe('Scale 40%–60%, center line 50%, whisker = 95% interval; faded = low sample.')
    expect(t('parts.sparkLabel', { nameA: 'Abrams', a: t('parts.sparkRange', { from: '50.0%', to: '52.0%' }), nameB: 'Haze', b: t('parts.sparkNoData') })).toBe('Daily win rate: Abrams 50.0% to 52.0%; Haze no data.')
    expect(t('heroes.laneWins', { rate: '54.7%' })).toBe('54.7% wins')
    expect(t('heroes.laneMatchups', { count: '1,234' })).toBe('1,234 lane matchups between them.')
    expect(t('heroes.together', { rate: '51.0%', count: '980' })).toBe('On the same team: 51.0% over 980 matches.')
    expect(t('heroes.matchups', { hero: 'Abrams' })).toBe('Abrams: matchups')
    expect(t('heroes.synergy', { hero: 'Abrams' })).toBe('Abrams: synergy')
    expect(t('builds.vsHero', { delta: '+1.2pp', hero: 'Abrams' })).toBe('+1.2pp vs Abrams')
    expect(t('builds.itemsSummary', { shared: 7, onlyA: 3, a: 'Gun Abrams', onlyB: 4, b: 'Spirit Abrams' })).toBe('7 shared · 3 only in Gun Abrams · 4 only in Spirit Abrams')
    expect(t('builds.only', { build: 'Gun Abrams' })).toBe('Only Gun Abrams')
    expect(t('players.mates', { count: '12', name: 'Ann', rate: '58.3%' })).toBe('Teammates in 12 matches; Ann won 58.3% of them.')
    expect(t('players.opponents', { count: '4', name: 'Ann', rate: '25.0%' })).toBe('Opponents in 4 matches; Ann won 25.0%.')
    expect(t('pickers.player', { side: 'A' })).toBe('Player A (SteamID3)')
    expect(t('pickers.hero', { side: 'B' })).toBe('Hero B')
    expect(t('pickers.set', { side: 'A' })).toBe('Set A')
    expect(t('pickers.favoritesWeek', { count: '1.2K' })).toBe('1.2K favorites/wk')
    expect(t.markup('pickers.needId', { link: (chunks) => `<a>${chunks}</a>` })).toBe('Need an ID? <a>Search players</a> and copy it from their profile.')
  })
})
