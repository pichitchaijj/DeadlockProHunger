import type { Locale } from '@/i18n/config'
import type { ScopeRef } from '@/lib/analytics/scope'
import { formatInteger, formatPercent, formatPointDelta, numberFormat } from '@/lib/format'
import type { WhyFact, WhyFactKind } from './model'
import { capitalize } from './model'

/*
 * Pure wording of Meta "Why?" facts (catalog `meta.why`). The facts are data (features/meta/model.ts);
 * the caller supplies the translator and the locale's formats, so the same facts serve every locale.
 */

export type MetaTranslate = (key: string, values?: Record<string, string | number>) => string

export type MetaFormat = {
  /** Ratio → "54.2%" (or "12%" with 0 digits). */
  percent: (ratio: number, digits?: number) => string
  /** Signed percentage-point change → "+2.4pp". */
  delta: (change: number) => string
  /** Count → "12,400" in the locale's grouping. */
  integer: (value: number) => string
  /** One-decimal average → "6.4". */
  decimal: (value: number) => string
  /** A scope in sentence form → "Last 7 days, All ranks" (shared scope catalog). */
  scope: (scope: ScopeRef) => string
  /** Between joined sentences: a space, or nothing where the script doesn't space sentences. */
  separator: string
}

/** Scripts that don't put a space between sentences. */
const UNSPACED: ReadonlySet<Locale> = new Set(['ja', 'zh-CN'])

/** The locale's formats for Meta wording; `scope` is the shared scope wording's sentence form. */
export function makeMetaFormat(locale: Locale, scope: (scope: ScopeRef) => string): MetaFormat {
  const decimal = numberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return {
    percent: (v, digits) => formatPercent(v, digits),
    delta: (v) => formatPointDelta(v),
    integer: (v) => formatInteger(v, locale),
    // Rounded as the original toFixed(1) did (exact binary value), then written in the locale's digits.
    decimal: (v) => decimal.format(Number(v.toFixed(1))),
    scope,
    separator: UNSPACED.has(locale) ? '' : ' ',
  }
}

export type WhyFactText = { id: WhyFactKind; label: string; text: string }

/** What a Home pulse card adds before its hero's facts. */
export type WhyIntro = { kind: 'mostPicked'; hero: string; pickRate: number } | { kind: 'mover' }

/** Label key per fact: the missing-week variant sits in the Trend slot. */
const LABEL: Record<WhyFactKind, string> = {
  result: 'result',
  certainty: 'certainty',
  popularity: 'popularity',
  trend: 'trend',
  noTrend: 'trend',
  role: 'role',
  perMatch: 'perMatch',
}

export function whyFactText(fact: WhyFact, t: MetaTranslate, f: MetaFormat): WhyFactText {
  return { id: fact.kind, label: t(`labels.${LABEL[fact.kind]}`), text: factSentence(fact, t, f) }
}

function factSentence(fact: WhyFact, t: MetaTranslate, f: MetaFormat): string {
  switch (fact.kind) {
    case 'result':
      return t('result', { winRate: f.percent(fact.winRate), matches: f.integer(fact.matches), scope: f.scope(fact.scope) })
    case 'certainty':
      if (fact.lowSample) return t('certainty.low', { matches: f.integer(fact.matches) })
      return t('certainty.interval', {
        low: f.percent(fact.interval.low),
        high: f.percent(fact.interval.high),
        tier: fact.tier ? t('certainty.tier', { tier: fact.tier, rule: t(`certainty.rules.${fact.tier}`) }) : '',
      })
    case 'popularity':
      return t('popularity', { pickRate: f.percent(fact.pickRate), rank: fact.pickRank, count: f.integer(fact.heroCount) })
    case 'trend':
      return t('trend.weeks', {
        current: f.percent(fact.current.winRate),
        currentMatches: f.integer(fact.current.matches),
        previous: f.percent(fact.previous.winRate),
        previousMatches: f.integer(fact.previous.matches),
        delta: f.delta(fact.delta),
        verdict: t(`trend.verdict.${fact.direction ?? 'tooFew'}`),
      })
    case 'noTrend':
      return t('trend.missing', { missing: fact.missing })
    case 'role':
      return t('role', { role: capitalize(fact.role), winRate: f.percent(fact.roleWinRate), hero: fact.hero, delta: f.delta(fact.delta) })
    case 'perMatch':
      return t('perMatch', {
        kills: f.decimal(fact.kills),
        deaths: f.decimal(fact.deaths),
        assists: f.decimal(fact.assists),
        souls: f.integer(Math.round(fact.netWorth)),
        sign: fact.netWorthDiff >= 0 ? 'plus' : 'minus',
        diff: f.percent(Math.abs(fact.netWorthDiff), 0),
      })
  }
}

/** A hero's facts as one paragraph (Home pulse "Why?"), after the card's own intro. */
export function whyParagraph(facts: WhyFact[], intro: WhyIntro | undefined, t: MetaTranslate, f: MetaFormat): string {
  const sentences = facts.map((fact) => factSentence(fact, t, f))
  if (intro?.kind === 'mostPicked') sentences.unshift(t('pulse.mostPicked', { hero: intro.hero, pickRate: f.percent(intro.pickRate) }))
  if (intro?.kind === 'mover') sentences.unshift(t('pulse.mover'))
  return sentences.join(f.separator)
}
