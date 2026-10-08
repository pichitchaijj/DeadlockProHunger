import type { RankTier, ScopeRank, ScopeRef, ScopeWindow, StatScope } from './scope'

/*
 * Scope wording: a scope (lib/analytics/scope.ts) → the words a page shows, from the catalog (scope.*).
 * Pure: the caller passes the translator and formatters for its locale. Rank tier names are game data and
 * pass through unchanged; only the words around them are translated. With the English catalog the output
 * matches the original English labels (tests/unit/scope-text.test.ts).
 */

/** Reads the `scope` namespace. */
export type ScopeTranslate = (key: string, values?: Record<string, string | number>) => string

export type ScopeFormat = {
  /** Patch start (unix seconds, UTC day) → "Sep 29". */
  date: (unixSec: number) => string
  /** Sample size → "12,400". */
  integer: (value: number) => string
  /** Snapshot time (unix ms) → "08 Oct 2026 14:05". */
  snapshot: (ms: number) => string
}

/**
 * The window's words. `label` is the standalone form ("Last 7 days"); `inSentence` the form used inside a
 * sentence ("last 7 days"); `short` drops the patch start date (filter chips).
 */
export function windowText(w: ScopeWindow, t: ScopeTranslate, f: ScopeFormat, opts: { inSentence?: boolean; short?: boolean } = {}): string {
  if (w.kind === 'text') return w.text
  const form = opts.inSentence ? 'inSentence' : 'label'
  if (w.kind === 'days') return t(`window.${form}.days`, { days: w.days })
  return w.since === null || opts.short ? t(`window.${form}.patch`) : t(`window.${form}.patchSince`, { date: f.date(w.since) })
}

const tierName = (tier: RankTier, t: ScopeTranslate) => tier.name ?? t('rank.tier', { tier: tier.tier })

/** The rank band's words: "All ranks", "Oracle – Phantom" (tier names are data), "every rank band". */
export function rankText(r: ScopeRank, t: ScopeTranslate): string {
  if (r.kind === 'text') return r.text
  if (r.kind === 'all') return t('rank.all')
  if (r.kind === 'everyBand') return t('rank.everyBand')
  return r.from.tier === r.to.tier ? tierName(r.from, t) : t('rank.band', { from: tierName(r.from, t), to: tierName(r.to, t) })
}

/** The rank with the page's narrowing: "All ranks · Ranked only", "Oracle – Phantom · Haze players". */
export function rankScopeText(s: ScopeRef, t: ScopeTranslate): string {
  let rank = rankText(s.rank, t)
  if (s.ranked) rank = t('rank.rankedOnly', { rank })
  if (s.hero) rank = t('rank.heroPlayers', { rank, hero: s.hero })
  return rank
}

/** "Last 7 days, All ranks": the scope inside a sentence or a description. */
export function scopeText(s: ScopeRef, t: ScopeTranslate, f: ScopeFormat): string {
  return t('joined', { window: windowText(s.window, t, f), rank: rankScopeText(s, t) })
}

/** "Last 7 days · All ranks · n = 12,400": the line every statistic carries (ScopeLine). */
export function scopeLine(s: StatScope | ScopeRef, t: ScopeTranslate, f: ScopeFormat): string {
  const values = { window: windowText(s.window, t, f), rank: rankScopeText(s, t) }
  const sample = 'sampleSize' in s ? s.sampleSize : undefined
  return sample !== undefined ? t('lineSample', { ...values, count: f.integer(sample) }) : t('line', values)
}
