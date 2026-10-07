const LOCALE = 'en-US'

const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 })

export function formatInteger(value: number): string {
  return integer.format(value)
}

/** 12400 → "12.4K" */
export function formatCompact(value: number): string {
  return compact.format(value)
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

const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })
const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
]

/** Unix ms → "3 hours ago" / "yesterday". `now` is injectable for tests. */
export function formatRelativeTime(timestampMs: number, now = Date.now()): string {
  const seconds = Math.round((timestampMs - now) / 1000)
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}
