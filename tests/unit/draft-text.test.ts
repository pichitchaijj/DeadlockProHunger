import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'
import en from '@/i18n/messages/en'
import { pp, relationIndex, weakPointText, weakPoints, type BalanceAxis, type DraftHero, type HeroRef, type HeroTotals, type Relation, type RelationIndex } from '@/features/draft/model'
import { formatInteger, formatPercent } from '@/lib/format'

/*
 * Draft Lab words its weak points and panel prose from the catalog (draft.*). These checks pin the English
 * catalog to the exact sentences the model and components produced before localization (templates copied
 * from the pre-localization code), so the English output can't drift.
 */

const t = createTranslator({ locale: 'en', messages: en, namespace: 'draft' })
const weak = createTranslator({ locale: 'en', messages: en, namespace: 'draft.weak' })

// ── Pre-localization weakPoints (features/draft/model.ts) ──
const BALANCE_LABELS: Record<BalanceAxis, string> = { damage: 'Hero damage', damageTaken: 'Damage taken (frontline)', objectiveDamage: 'Objective damage' }
function oldWeakPoints(idx: RelationIndex, heroes: DraftHero[], allies: number[], enemies: number[], balance: Record<BalanceAxis, number> | null) {
  const name = (id: number) => heroes.find((h) => h.id === id)?.name ?? `Hero ${id}`
  const out: Array<{ kind: string; title: string; detail: string }> = []
  for (const e of enemies) {
    const hit = allies.map((a) => idx.matchup(a, e)).filter((r): r is Relation => r?.clear === 'negative')
    if (hit.length) {
      out.push({
        kind: 'threat',
        title: `${name(e)}: lower results than expected for ${hit.map((r) => name(r.from)).join(' and ')}`,
        detail: hit.map((r) => `${name(r.from)} wins ${(r.winRate * 100).toFixed(1)}% vs ${name(e)}, expected ${(r.expected * 100).toFixed(1)}% (${pp(r.lift)}, n = ${r.matches.toLocaleString('en-US')})`).join(' · '),
      })
    }
  }
  allies.forEach((x, i) =>
    allies.slice(i + 1).forEach((y) => {
      const r = idx.synergy(x, y)
      if (r?.clear === 'negative') {
        out.push({ kind: 'clash', title: `${name(x)} + ${name(y)} win less together than expected`, detail: `${(r.winRate * 100).toFixed(1)}% together, expected ${(r.expected * 100).toFixed(1)}% (${pp(r.lift)}, n = ${r.matches.toLocaleString('en-US')})` })
      }
    }),
  )
  if (balance && allies.length >= 3) {
    for (const axis of Object.keys(BALANCE_LABELS) as BalanceAxis[]) {
      if (balance[axis] < 0.25) {
        out.push({ kind: 'balance', title: `Low ${BALANCE_LABELS[axis].toLowerCase()}`, detail: `Your picks average the ${Math.round(balance[axis] * 100)}th percentile of heroes on this per-match measure.` })
      }
    }
  }
  return out
}

/* Synthetic inputs: every hero has a 50% baseline; hero 4 is missing from the hero list (fallback name). */
const totals: HeroTotals[] = [1, 2, 3, 4, 5, 6].map((id) => ({ heroId: id, wins: 50_000, matches: 100_000, damage: 1, damageTaken: 1, objectiveDamage: 1 }))
const heroes: DraftHero[] = [
  { id: 1, slug: 'abrams', name: 'Abrams', role: 'brawler', iconUrl: null },
  { id: 2, slug: 'haze', name: 'Haze', role: 'assassin', iconUrl: null },
  { id: 3, slug: 'dynamo', name: 'Dynamo', role: 'mystic', iconUrl: null },
  { id: 5, slug: 'seven', name: 'Seven', role: 'mystic', iconUrl: null },
  { id: 6, slug: 'wraith', name: 'Wraith', role: 'marksman', iconUrl: null },
]
const idx = relationIndex(
  totals,
  [
    { a: 1, b: 2, wins: 4_300, matches: 10_000 }, // clash
    { a: 3, b: 4, wins: 41_234, matches: 100_000 }, // clash with the fallback hero, large n
  ],
  [
    { a: 1, b: 5, wins: 4_200, matches: 10_000 }, // Seven beats Abrams
    { a: 2, b: 5, wins: 4_400, matches: 12_345 }, // and Haze
    { a: 4, b: 6, wins: 4_100, matches: 9_000 }, // Wraith beats the fallback hero
  ],
)

const name = (hero: HeroRef) => hero.name ?? weak('heroFallback', { id: hero.id })
const words = (allies: number[], enemies: number[], balance: Record<BalanceAxis, number> | null) =>
  weakPoints(idx, heroes, allies, enemies, balance).map((p) => ({ kind: p.kind, ...weakPointText(p, (key, values) => weak(key as 'threat', values), name, (v) => formatInteger(v)) }))

describe('Draft English wording: weak points', () => {
  it('keeps threats (one and several allies), clashes, the fallback name and balance lines', () => {
    const balance = { damage: 0.1, damageTaken: 0.24, objectiveDamage: 0.6 }
    for (const [allies, enemies, b] of [
      [[1, 2], [5], null],
      [[1, 2, 3, 4], [5, 6], balance],
      [[3, 4], [6], null],
      [[1, 3, 6], [], { damage: 0.01, damageTaken: 0.2, objectiveDamage: 0.05 }],
    ] as const) {
      const next = words([...allies], [...enemies], b)
      expect(next).toEqual(oldWeakPoints(idx, heroes, [...allies], [...enemies], b))
      expect(next.length).toBeGreaterThan(0)
    }
  })
})

describe('Draft English wording: panels', () => {
  const rel = idx.matchup(1, 5)!
  const syn = idx.synergy(1, 2)!

  it('keeps the recommendation lines', () => {
    const r = t.markup('recs.otherPairings', { count: 1 })
    expect(r).toBe('1 other pairing not clear')
    expect(t('recs.otherPairings', { count: 3 })).toBe('3 other pairings not clear')
    expect(t('recs.withoutData', { count: 2 })).toBe('2 without enough data')
    expect(t('recs.with', { hero: 'Haze' })).toBe('With Haze')
    expect(t('recs.against', { hero: 'Haze' })).toBe('Against Haze')
    expect(t('recs.vsExpected', { rate: formatPercent(rel.winRate), expected: formatPercent(rel.expected), gap: pp(rel.lift) })).toBe(`${formatPercent(rel.winRate)} vs ${formatPercent(rel.expected)} expected (${pp(rel.lift)})`)
    expect(t('recs.newRole', { role: 'mystic' })).toBe('Would be your first mystic. Role coverage is shown as a fact; it isn’t scored.')
    expect([t('recs.status.clear'), t('recs.status.low'), t('recs.status.noise')]).toEqual(['clear', 'low sample', 'within noise or under 1pp'])
    expect(t('recs.rule.high')).toBe('At least 2 clear positive relationships and no clear negative one.')
  })

  it('keeps the relationship map lines', () => {
    expect(t('map.matchupPair', { a: 'Abrams', b: 'Seven' })).toBe('Abrams vs Seven')
    expect(t('map.synergyPair', { a: 'Abrams', b: 'Haze' })).toBe('Abrams + Haze')
    const fig = { rate: formatPercent(rel.winRate), expected: formatPercent(rel.expected), gap: pp(rel.lift) }
    expect(t('map.matchupResult', { a: 'Abrams', ...fig })).toBe(`Abrams wins ${fig.rate}, expected ${fig.expected} (${fig.gap})`)
    expect(t('map.synergyResult', { rate: formatPercent(syn.winRate), expected: formatPercent(syn.expected), gap: pp(syn.lift) })).toBe(`${formatPercent(syn.winRate)} together, expected ${formatPercent(syn.expected)} (${pp(syn.lift)})`)
    for (const [good, sample] of [[true, 'high'], [false, 'moderate']] as const) {
      expect(t('map.relationMeta', { favor: good ? t('map.favorsYou') : t('map.favorsEnemy'), n: '10,000', sample })).toBe(`${good ? 'Favors your team' : 'Favors the enemy'} · n = 10,000 · ${sample} sample`)
    }
    expect(t('map.none', { checked: '15', withData: '12' })).toBe('No clear relationships among these picks. 15 pairings checked, 12 with enough data; every one is within what the heroes’ individual win rates predict.')
    expect(t('map.summary', { count: 3, checked: '15' })).toBe('3 of 15 pairings differ clearly from expectation; the rest are within noise or lack data and aren’t drawn.')
  })

  it('keeps the board and balance lines', () => {
    expect(t('board.remove', { hero: 'Haze', side: t('board.sidesLower.allies') })).toBe('Remove Haze from your team')
    expect(t('board.addToSide', { hero: 'Haze', side: t('board.sidesLower.enemies') })).toBe('Add Haze to enemy team')
    expect(t.markup('board.addTo', { team: t('board.sidesLower.allies'), side: (chunks) => `<span>${chunks}</span>` })).toBe('Add to <span>your team</span>')
    expect(t('board.picked', { hero: 'Haze' })).toBe('Haze (picked)')
    expect(t('board.add', { hero: 'Haze' })).toBe('Add Haze')
    expect(t('balance.percentile', { value: 42 })).toBe('42th percentile')
    expect(t('scopeNote', { scope: 'Last 7 days, All ranks' })).toBe('Scope: Last 7 days, All ranks. Numbers under heroes are their win rates in this scope.')
  })
})
