import { createTranslator, useLocale, useTranslations } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import en from '@/i18n/messages/en'
import type { RankBandId } from '@/lib/analytics/rankBands'
import type { ScopeRank, ScopeRef, ScopeWindow, StatScope } from '@/lib/analytics/scope'
import { rankScopeText, rankText, scopeLine, scopeText, windowText, type ScopeFormat, type ScopeTranslate } from '@/lib/analytics/scopeText'
import { dateFormat, formatInteger } from '@/lib/format'

/*
 * The shared scope's words for one locale (catalog `scope.*`, lib/analytics/scopeText). Pages and server
 * components get it here and pass plain strings on, so scope values stay locale-neutral data and client
 * components (filters, the hero directory) only ever receive finished labels.
 */

export type ScopeWording = {
  window: (w: ScopeWindow, opts?: { inSentence?: boolean; short?: boolean }) => string
  rank: (r: ScopeRank) => string
  /** Rank with ranked-only / hero narrowing. */
  rankScope: (s: ScopeRef) => string
  /** "Last 7 days, All ranks". */
  scope: (s: ScopeRef) => string
  /** "Last 7 days · All ranks · n = 12,400". */
  line: (s: StatScope | ScopeRef) => string
  /** "· Data from 08 Oct 2026 14:05 UTC". */
  snapshot: (ms: number) => string
  /** Filter-chip labels for every window or rank band. */
  windowLabels: <K extends string>(windows: Record<K, ScopeWindow>, opts?: { short?: boolean }) => Record<K, string>
  rankLabels: (ranks: Record<RankBandId, ScopeRank>) => Record<RankBandId, string>
}

const DAY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' }
const SNAPSHOT: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }

export function makeScopeWording(t: ScopeTranslate, locale: Locale): ScopeWording {
  const format: ScopeFormat = {
    date: (sec) => dateFormat(locale, DAY).format(sec * 1000),
    integer: (n) => formatInteger(n, locale),
    // English keeps its original "08 Oct 2026 14:05" form.
    snapshot: (ms) => (locale === 'en' ? new Date(ms).toUTCString().slice(5, 22) : dateFormat(locale, SNAPSHOT).format(ms)),
  }
  const map = <K extends string, V>(record: Record<K, V>, fn: (v: V) => string) => Object.fromEntries(Object.entries(record).map(([k, v]) => [k, fn(v as V)])) as Record<K, string>
  return {
    window: (w, opts) => windowText(w, t, format, opts),
    rank: (r) => rankText(r, t),
    rankScope: (s) => rankScopeText(s, t),
    scope: (s) => scopeText(s, t, format),
    line: (s) => scopeLine(s, t, format),
    snapshot: (ms) => t('snapshot', { time: format.snapshot(ms) }),
    windowLabels: (windows, opts) => map(windows, (w) => windowText(w, t, format, opts)),
    rankLabels: (ranks) => map(ranks, (r) => rankText(r, t)),
  }
}

/** For server components that render synchronously (hooks). */
export function useScopeWording(): ScopeWording {
  const t = useTranslations('scope')
  const locale = useLocale() as Locale
  return makeScopeWording((key, values) => t(key as 'joined', values), locale)
}

/**
 * For async server components. Pages not localized yet (Meta, Patch) pass 'en' so their sentences stay
 * wholly English: the request config loads the URL's locale whatever `getTranslations` is asked for, so
 * English comes from the English catalog directly.
 */
export async function getScopeWording(locale?: 'en'): Promise<ScopeWording> {
  if (locale === 'en') return englishScopeWording()
  const [t, active] = await Promise.all([getTranslations('scope'), getLocale()])
  return makeScopeWording((key, values) => t(key as 'joined', values), active as Locale)
}

let english: ScopeWording | null = null

/**
 * English scope wording, outside any request (loaders building English prose for features not localized
 * yet: Meta's "Why?" facts). The same catalog and formatter as every locale.
 */
export function englishScopeWording(): ScopeWording {
  if (!english) {
    const t = createTranslator({ locale: 'en', messages: en, namespace: 'scope' })
    english = makeScopeWording((key, values) => t(key as 'joined', values), 'en')
  }
  return english
}
