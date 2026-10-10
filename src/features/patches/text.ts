import type { Locale } from '@/i18n/config'
import { dateFormat } from '@/lib/format'
import { humanize, sourceLabel, type PropChange, type PropLabel, type SiteUnit } from './diff'
import type { Mark, PatchSummary, Verdict, Window } from './model'

/*
 * Patch wording (pure): label references, marks, verdicts, titles and date windows in the reader's language
 * (catalog `patch`). The data stays locale-neutral; game data (names, asset labels, values, notes) passes through.
 */

export type PatchTranslate = (key: string, values?: Record<string, string | number>) => string

const DAY = 86_400

/** Catalog keys of the verdict identifiers (patch.verdicts). */
export const VERDICT_KEYS = { higher: 'higher', lower: 'lower', 'no clear change': 'none', 'not enough data': 'insufficient' } as const satisfies Record<Verdict, string>

export const markLabel = (mark: Mark, t: PatchTranslate) => t(`marks.${mark}`)
export const verdictLabel = (verdict: Verdict, t: PatchTranslate) => t(`verdicts.${VERDICT_KEYS[verdict]}`)

/** A property label: the game's own text, a humanized stat key (data), or this site's label from the catalog. */
export function propertyText(ref: PropLabel, t: PatchTranslate): string {
  if ('site' in ref) return t(`labels.${ref.site}`)
  return 'game' in ref ? ref.game : humanize(ref.stat)
}

/** A value with this site's unit word, if any ("3000 souls"); the game's own unit symbols are part of the value. */
export const valueText = (value: string, unit: SiteUnit | undefined, t: PatchTranslate) => (unit ? t(`values.${unit}`, { value }) : value)

/** A change's stable identity for React keys (English source label and values; never translated). */
export const changeId = (c: PropChange) => `${sourceLabel(c.property)}|${c.before}|${c.after}`

/** A patch's name: the feed's, or "{date} update" with the patch id (YYYY-MM-DD) when the feed names none. */
export const patchTitle = (p: Pick<PatchSummary, 'id' | 'title'>, t: PatchTranslate) => p.title ?? t('untitled', { date: p.id })

/**
 * UTC calendar formats for patch days. Patch days are 00:00 UTC, so formatting in UTC keeps the same calendar
 * day in every locale.
 */
const FORMATS = {
  day: { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' },
  long: { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' },
  short: { month: 'short', day: 'numeric', timeZone: 'UTC' },
  build: { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>

export type PatchDateStyle = keyof typeof FORMATS

/** Unix seconds → the locale's date in UTC. */
export const patchDate = (unix: number, style: PatchDateStyle, locale: Locale) => dateFormat(locale, FORMATS[style]).format(unix * 1000)

/** A window's days, first to last inclusive (`to` is exclusive): "Sep 22–Sep 28". */
export const windowRange = (w: Window, style: 'short' | 'day', locale: Locale, t: PatchTranslate) =>
  t('impact.range', { from: patchDate(w.from, style, locale), to: patchDate(w.to - DAY, style, locale) })
