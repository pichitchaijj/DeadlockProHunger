import { InView } from '@/components/motion/InView'
import type { Locale } from '@/i18n/config'
import { dateFormat, formatInteger, formatPercent } from '@/lib/format'
import type { DayPoint } from '../model'

const DATE: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' }

/**
 * The chart's own text. Shared with pages that aren't localized yet (Analyze), so it doesn't translate
 * itself: without `labels` (and `locale` for dates) it stays English. Heroes passes its translations.
 */
export type TrendChartLabels = {
  tooFew: string
  summary: (v: { metric: string; from: string; fromDate: string; to: string; toDate: string }) => string
  baseline: string
  markers: string
  incomplete: string
  showData: string
  tableCaption: (metric: string) => string
  day: string
  matches: string
  patch: string
}

const LABELS: TrendChartLabels = {
  tooFew: 'Not enough daily data to draw a trend.',
  summary: ({ metric, from, fromDate, to, toDate }) => `${metric} from ${from} on ${fromDate} to ${to} on ${toDate}.`,
  baseline: 'Dashed line: 50%.',
  markers: 'Orange lines: patch dates.',
  incomplete: 'The latest day may be incomplete.',
  showData: 'Show data',
  tableCaption: (metric) => `${metric} by day, the values behind the chart`,
  day: 'Day',
  matches: 'Matches',
  patch: 'Patch',
}

type TrendChartProps = {
  points: DayPoint[]
  metric: 'winRate' | 'pickRate'
  /** The metric's name, as the caller shows it (e.g. "Win rate"). */
  label: string
  labels?: TrendChartLabels
  /** Locale for the dates; English when omitted. */
  locale?: Locale
  /** Patch days (unix seconds) drawn as markers. */
  markers?: Array<{ day: number; title: string }>
  /** Reference line, e.g. 0.5 for win rate. */
  baseline?: number
}

const W = 640
const H = 200
const PAD = { top: 12, right: 12, bottom: 24, left: 44 }

/**
 * Daily line chart with a draw-in reveal (CSS, no JS). Includes a text summary and
 * an expandable data table so the chart is never the only way to get the numbers.
 */
export function TrendChart({ points, metric, label, labels: t = LABELS, locale, markers = [], baseline }: TrendChartProps) {
  const day = (unixS: number) => dateFormat(locale, DATE).format(unixS * 1000)
  if (points.length < 2) return <p className="text-sm text-text-muted">{t.tooFew}</p>

  const values = points.map((p) => p[metric])
  const lo = Math.min(...values, baseline ?? Infinity)
  const hi = Math.max(...values, baseline ?? -Infinity)
  const pad = Math.max((hi - lo) * 0.15, 0.005)
  const min = lo - pad
  const max = hi + pad
  const first = points[0].day
  const span = points[points.length - 1].day - first || 1
  const x = (day: number) => PAD.left + ((day - first) / span) * (W - PAD.left - PAD.right)
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * (H - PAD.top - PAD.bottom)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.day).toFixed(1)},${y(p[metric]).toFixed(1)}`).join(' ')
  const ticks = [min + (max - min) * 0.1, (min + max) / 2, max - (max - min) * 0.1]
  const visibleMarkers = markers.filter((m) => m.day >= first && m.day <= points[points.length - 1].day)
  const summary = t.summary({ metric: label, from: formatPercent(values[0]), fromDate: day(first), to: formatPercent(values[values.length - 1]), toDate: day(points[points.length - 1].day) })

  return (
    <InView as="figure" className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="h-auto w-full overflow-visible">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-text-muted text-[11px]">
              {formatPercent(t, 1)}
            </text>
          </g>
        ))}
        {baseline !== undefined && (
          <line x1={PAD.left} x2={W - PAD.right} y1={y(baseline)} y2={y(baseline)} className="stroke-text-muted/60" strokeDasharray="3 4" strokeWidth={1} />
        )}
        {visibleMarkers.map((m) => (
          <g key={m.day}>
            <line x1={x(m.day)} x2={x(m.day)} y1={PAD.top} y2={H - PAD.bottom} className="stroke-orange/60" strokeDasharray="2 3" strokeWidth={1} />
            <text x={x(m.day) + 4} y={PAD.top + 8} className="fill-orange text-[10px]">
              {t.patch}
            </text>
          </g>
        ))}
        <path d={path} data-draw pathLength={1} fill="none" className="stroke-primary" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(points[points.length - 1].day)} cy={y(values[values.length - 1])} r={3.5} className="fill-highlight" />
        <text x={PAD.left} y={H - 6} className="fill-text-muted text-[11px]">
          {day(first)}
        </text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-text-muted text-[11px]">
          {day(points[points.length - 1].day)}
        </text>
      </svg>
      <figcaption className="text-caption text-text-muted">
        {summary} {baseline !== undefined && t.baseline} {visibleMarkers.length > 0 && t.markers} {t.incomplete}
      </figcaption>
      <details className="text-sm">
        <summary className="cursor-pointer py-3 font-ui font-semibold text-primary hover:text-highlight">{t.showData}</summary>
        <div className="mt-2 max-h-64 overflow-y-auto rounded-sm border border-border">
          <table className="w-full font-ui text-sm">
            <caption className="sr-only">{t.tableCaption(label)}</caption>
            <thead className="sticky top-0 bg-surface text-eyebrow">
              <tr>
                <th scope="col" className="px-3 py-2 text-left">{t.day}</th>
                <th scope="col" className="px-3 py-2 text-right">{label}</th>
                <th scope="col" className="px-3 py-2 text-right">{t.matches}</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.day} className="border-t border-border">
                  <td className="px-3 py-1.5 text-text-muted">{day(p.day)}</td>
                  <td className="px-3 py-1.5 text-right text-text tabular">{formatPercent(p[metric])}</td>
                  <td className="px-3 py-1.5 text-right text-text-muted tabular">{formatInteger(p.matches)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </InView>
  )
}
