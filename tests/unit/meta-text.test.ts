import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'
import type { Locale } from '@/i18n/config'
import en from '@/i18n/messages/en'
import ja from '@/i18n/messages/ja'
import ko from '@/i18n/messages/ko'
import th from '@/i18n/messages/th'
import zhCN from '@/i18n/messages/zh-CN'
import { makeScopeWording } from '@/components/data/scopeWording'
import { whyFacts, type MetaHero } from '@/features/meta/model'
import { makeMetaFormat, whyFactText, whyParagraph, type MetaTranslate, type WhyIntro } from '@/features/meta/text'
import type { ScopeRef } from '@/lib/analytics/scope'
import type { Tier } from '@/lib/analytics/tiers'
import { wilsonInterval } from '@/lib/analytics/wilson'
import { englishScope } from './helpers/scopeEnglish'
import * as v1 from './legacy/metaWhyV1'

/*
 * Meta "Why?" facts are data, worded by features/meta/text.ts from the catalog (meta.why). The regression
 * oracle is the pre-localization wording, kept verbatim in ./legacy/metaWhyV1.ts (whyFacts + the Home pulse
 * composition): every case runs the same hero and context through both, and the English formatter must
 * reproduce the old label and text exactly.
 */

const LOCALES: Array<[Locale, typeof en]> = [['en', en], ['th', th], ['ja', ja], ['ko', ko], ['zh-CN', zhCN]]

function wording(locale: Locale, messages: typeof en) {
  const t = createTranslator({ locale, messages, namespace: 'meta.why' })
  const scopeT = createTranslator({ locale, messages, namespace: 'scope' })
  const scope = makeScopeWording((key, values) => scopeT(key as 'joined', values), locale)
  const translate: MetaTranslate = (key, values) => t(key as 'result', values)
  const format = makeMetaFormat(locale, scope.scope)
  return { fact: (f: Parameters<typeof whyFactText>[0]) => whyFactText(f, translate, format), paragraph: (facts: Parameters<typeof whyParagraph>[0], intro?: WhyIntro) => whyParagraph(facts, intro, translate, format) }
}
const EN = wording('en', en)

// ── Case generator ─────────────────────────────────────────────────

type Totals = { wins: number; matches: number; kills: number; deaths: number; assists: number; netWorth: number }
const totals = (matches: number, winRate: number, perMatch = { k: 5.24, d: 4.05, a: 7.95, nw: 31_250.4 }): Totals => ({
  wins: Math.round(matches * winRate),
  matches,
  kills: matches * perMatch.k,
  deaths: matches * perMatch.d,
  assists: matches * perMatch.a,
  netWorth: matches * perMatch.nw,
})

type Case = {
  name: string
  hero: Omit<MetaHero, 'why'>
  ctx: Parameters<typeof whyFacts>[1]
}

const SCOPES: ScopeRef[] = [
  { window: { kind: 'days', days: 7 }, rank: { kind: 'all' } },
  { window: { kind: 'patch', since: Date.UTC(2026, 8, 29) / 1000 }, rank: { kind: 'band', from: { tier: 8, name: 'Oracle' }, to: { tier: 9, name: 'Phantom' } }, ranked: true },
  { window: { kind: 'days', days: 30 }, rank: { kind: 'band', from: { tier: 11, name: 'Eternus' }, to: { tier: 11, name: 'Eternus' } } },
]

/** A role baseline: only `role` and `winRate` are read by "Why?". */
const roleStat = (r: { role: string; winRate: number } | null) => (r ? { ...r, wins: 0, matches: 0, interval: { low: r.winRate, high: r.winRate }, heroes: 2 } : null)

function heroCase(o: {
  name?: string
  matches?: number
  winRate?: number
  tier?: Tier | null
  low?: boolean
  pickRank?: number
  role?: string | null
  trend?: MetaHero['trend']
  cur?: Totals | undefined
  prev?: Totals | undefined
  roleStat?: { role: string; winRate: number } | null
  avgNetWorth?: number
  scope?: ScopeRef
  perMatch?: Totals
}): Case {
  const matches = o.matches ?? 14_000
  const winRate = o.winRate ?? 0.56
  const wins = Math.round(matches * winRate)
  const hero: Omit<MetaHero, 'why'> = {
    id: 1,
    slug: 'mo-and-krill',
    name: o.name ?? 'Mo & Krill',
    iconUrl: null,
    role: o.role === undefined ? 'brawler' : o.role,
    tier: o.tier === undefined ? 'S' : o.tier,
    sample: o.low ? 'low' : matches > 1000 ? 'high' : 'moderate',
    wins,
    matches,
    winRate: wins / matches,
    interval: wilsonInterval(wins, matches),
    pickRate: 0.1834,
    pickRank: o.pickRank ?? 1,
    trend: o.trend === undefined ? { direction: 'rising', delta: 0.08 } : o.trend,
    weeks: null,
    history: [],
  }
  return {
    name: JSON.stringify(o),
    hero,
    ctx: {
      totals: o.perMatch ?? totals(matches, winRate),
      cur: 'cur' in o ? o.cur : totals(7_000, 0.6),
      prev: 'prev' in o ? o.prev : totals(7_000, 0.52),
      scope: o.scope ?? SCOPES[0],
      heroCount: 38,
      role: roleStat(o.roleStat === undefined ? { role: 'brawler', winRate: 0.512 } : o.roleStat),
      avgNetWorth: o.avgNetWorth ?? 30_000,
    },
  }
}

const CASES: Case[] = [
  // Every tier, a low sample, and the (unreachable today) non-low untiered branch.
  ...(['S', 'A', 'B', 'C'] as const).map((tier) => heroCase({ tier })),
  heroCase({ low: true, tier: null, matches: 70, winRate: 0.8 }),
  heroCase({ tier: null }),
  // Every ordinal branch.
  ...[1, 2, 3, 4, 5, 10, 11, 12, 13, 14, 21, 22, 23, 24, 31, 101, 102, 103, 111, 112, 113, 121].map((pickRank) => heroCase({ pickRank })),
  // Trend: rising, falling, stable, too few, and both missing-week variants (absent or zero matches).
  heroCase({ trend: { direction: 'falling', delta: -0.06 }, cur: totals(7_000, 0.47), prev: totals(7_000, 0.55) }),
  heroCase({ trend: { direction: 'stable', delta: 0.004 }, cur: totals(7_000, 0.5), prev: totals(7_000, 0.5) }),
  heroCase({ trend: null, cur: totals(150, 0.5), prev: totals(7_000, 0.5) }),
  heroCase({ trend: null, cur: totals(7_000, 0.5), prev: totals(7_000, 0.5) }),
  heroCase({ trend: null, cur: totals(7_000, 0.5), prev: undefined }),
  heroCase({ trend: null, cur: totals(7_000, 0.5), prev: totals(0, 0) }),
  heroCase({ trend: null, cur: undefined, prev: totals(7_000, 0.5) }),
  heroCase({ trend: null, cur: totals(0, 0), prev: totals(7_000, 0.5) }),
  heroCase({ trend: null, cur: undefined, prev: undefined }),
  heroCase({ trend: { direction: 'rising', delta: 0 }, cur: totals(7_000, 0.5), prev: totals(7_000, 0.5) }),
  // Role present, role absent (no hero role, no role stats), and below / equal to the role.
  heroCase({ role: null }),
  heroCase({ roleStat: null }),
  heroCase({ role: 'mystic', roleStat: { role: 'mystic', winRate: 0.56 } }),
  heroCase({ winRate: 0.44, roleStat: { role: 'brawler', winRate: 0.512 } }),
  // Souls above, below and equal to the average; no average; no matches (no Per match fact).
  heroCase({ avgNetWorth: 35_000 }),
  heroCase({ avgNetWorth: 31_250.4 }),
  heroCase({ avgNetWorth: 0 }),
  heroCase({ perMatch: { wins: 0, matches: 0, kills: 0, deaths: 0, assists: 0, netWorth: 0 } }),
  heroCase({ perMatch: totals(1_000, 0.5, { k: 12.35, d: 0.05, a: 21.95, nw: 1_234_567.5 }) }),
  // Large numbers and every scope shape.
  heroCase({ matches: 12_345_678, winRate: 0.5012 }),
  ...SCOPES.map((scope) => heroCase({ scope })),
]

const legacy = (c: Case) => v1.whyFacts(c.hero, { ...c.ctx, scopeText: englishScope.scope(c.ctx.scope) })

describe('English matches the original "Why?" wording', () => {
  it.each(CASES.map((c) => [c.name, c] as const))('%s', (_, c) => {
    const facts = whyFacts(c.hero, c.ctx)
    const old = legacy(c)
    expect(facts.map(EN.fact).map(({ label, text }) => ({ label, text }))).toEqual(old)
  })

  it('states ordinals in English exactly as before', () => {
    const expected: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 11: '11th', 12: '12th', 13: '13th', 21: '21st', 22: '22nd', 23: '23rd', 101: '101st', 111: '111th' }
    for (const [rank, ordinal] of Object.entries(expected)) {
      const c = heroCase({ pickRank: Number(rank) })
      const popularity = whyFacts(c.hero, c.ctx).find((f) => f.kind === 'popularity')!
      expect(EN.fact(popularity).text).toBe(`Picked in 18.3% of matches, ${ordinal} most picked of 38 heroes.`)
    }
  })

  it('composes the Home pulse "Why?" exactly as before', () => {
    for (const c of CASES) {
      const facts = whyFacts(c.hero, c.ctx)
      const old = legacy(c)
      expect(EN.paragraph(facts)).toBe(v1.pulseWhy.highestWinRate(old))
      expect(EN.paragraph(facts, { kind: 'mostPicked', hero: c.hero.name, pickRate: c.hero.pickRate })).toBe(v1.pulseWhy.mostPicked(c.hero.name, c.hero.pickRate, old))
      expect(EN.paragraph(facts, { kind: 'mover' })).toBe(v1.pulseWhy.mover(old))
    }
  })
})

describe('facts are data', () => {
  it('carry no sentences: every string is a kind, game data or a scope value', () => {
    const c = heroCase({ scope: SCOPES[1] })
    const strings: string[] = []
    const walk = (v: unknown) => {
      if (typeof v === 'string') strings.push(v)
      else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    walk(whyFacts(c.hero, c.ctx))
    for (const s of strings) expect(['result', 'certainty', 'popularity', 'trend', 'noTrend', 'role', 'perMatch', 'S', 'brawler', 'Mo & Krill', 'rising', 'days', 'patch', 'band', 'Oracle', 'Phantom', 'all']).toContain(s)
  })

  it('give each fact a stable id (its kind), unique within a hero', () => {
    for (const c of CASES) {
      const ids = whyFacts(c.hero, c.ctx).map((f) => EN.fact(f).id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})

describe('every locale', () => {
  const ENGLISH = /\b(Won|matches|Only|interval|Tier|Picked|most picked|heroes|Last 7 days|days before|weeks|No matches|together|Average|souls|appeared|pick rate|slots|Result|Certainty|Popularity|Trend|Role|Per match)\b/

  it.each(LOCALES)('%s words every branch with no raw keys, braces or English UI words', (locale, messages) => {
    const w = wording(locale, messages)
    for (const c of CASES) {
      const facts = whyFacts(c.hero, c.ctx)
      const texts = [
        ...facts.flatMap((f) => [w.fact(f).label, w.fact(f).text]),
        w.paragraph(facts, { kind: 'mostPicked', hero: c.hero.name, pickRate: c.hero.pickRate }),
        w.paragraph(facts, { kind: 'mover' }),
      ]
      for (const text of texts) {
        expect(text.length).toBeGreaterThan(0)
        expect(text).not.toMatch(/[{}]|\b(meta|why|labels|certainty|trend|pulse|rules)\.[a-zA-Z]/)
        if (locale !== 'en') expect(text.replace(/Mo & Krill|Oracle|Phantom|Eternus|K\/D\/A|Wilson/g, '')).not.toMatch(ENGLISH)
      }
      // Hero names, roles (game data) and the numbers pass through.
      const all = texts.join(' ')
      expect(all).toContain('Mo & Krill')
      expect(all).toContain(`${(c.hero.winRate * 100).toFixed(1)}%`)
      if (c.hero.role && c.ctx.role) expect(all).toContain(c.hero.role.charAt(0).toUpperCase() + c.hero.role.slice(1))
    }
  })

  it.each(LOCALES)('%s formats counts in the locale and keeps tier letters', (locale, messages) => {
    const w = wording(locale, messages)
    const c = heroCase({ matches: 12_345_678, winRate: 0.5012, tier: 'B' })
    const text = whyFacts(c.hero, c.ctx).map((f) => w.fact(f).text).join(' ')
    expect(text).toContain(new Intl.NumberFormat(locale).format(12_345_678))
    expect(text).toContain('B')
  })
})
