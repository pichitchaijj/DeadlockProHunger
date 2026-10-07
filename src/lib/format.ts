import { defaultLocale, formatLocales, type Locale } from '@/i18n/config'

/*
 * Formatting takes an optional locale (src/i18n/config.ts); without one it formats as English (en-US),
 * which is what every caller gets today. Intl formatters are built once per locale and options.
 */

const formatters = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat | Intl.RelativeTimeFormat>()

function memo<T extends Intl.NumberFormat | Intl.DateTimeFormat | Intl.RelativeTimeFormat>(key: string, make: () => T): T {
  let f = formatters.get(key)
  if (!f) formatters.set(key, (f = make()))
  return f as T
}

export function numberFormat(locale: Locale = defaultLocale, options: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  return memo(`n|${locale}|${JSON.stringify(options)}`, () => new Intl.NumberFormat(formatLocales[locale], options))
}

/** A date formatter for `locale`. Pass `timeZone: 'UTC'` as the site's date displays do. */
export function dateFormat(locale: Locale = defaultLocale, options: Intl.DateTimeFormatOptions = {}): Intl.DateTimeFormat {
  return memo(`d|${locale}|${JSON.stringify(options)}`, () => new Intl.DateTimeFormat(formatLocales[locale], options))
}

export function formatInteger(value: number, locale?: Locale): string {
  return numberFormat(locale, { maximumFractionDigits: 0 }).format(value)
}

/** 12400 → "12.4K" */
export function formatCompact(value: number, locale?: Locale): string {
  return numberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

/** 0.5213 → "52.1%" */
export function formatPercent(ratio: number, fractionDigits = 1): string {
  return `${(ratio * 100).toFixed(fractionDigits)}%`
}

/** Percentage-point delta: 0.031 → "+3.1pp", -0.004 → "−0.4pp" */
export function formatPointDelta(delta: number, fractionDigits = 1): string {
  const points = delta * 100
  const rounded = Number(points.toFixed(fractionDigits))
  if (rounded === 0) return `±${(0).toFixed(fractionDigits)}pp`
  const sign = rounded > 0 ? '+' : '−'
  return `${sign}${Math.abs(rounded).toFixed(fractionDigits)}pp`
}

/** 1934 → "32:14" (match clock) */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rest = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
]

/** Unix ms → "3 hours ago" / "yesterday". `now` is injectable for tests. */
export function formatRelativeTime(timestampMs: number, now = Date.now(), locale: Locale = defaultLocale): string {
  const relative = memo(`r|${locale}`, () => new Intl.RelativeTimeFormat(formatLocales[locale], { numeric: 'auto' }))
  const seconds = Math.round((timestampMs - now) / 1000)
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  // Under a minute: English keeps its wording; other locales use their own word for "now".
  return locale === defaultLocale ? 'just now' : relative.format(0, 'second')
}
