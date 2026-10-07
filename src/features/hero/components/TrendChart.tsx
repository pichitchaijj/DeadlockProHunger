import { InView } from '@/components/motion/InView'
import { formatInteger, formatPercent } from '@/lib/format'
import type { DayPoint } from '../model'

const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

type TrendChartProps = {
  points: DayPoint[]
  metric: 'winRate' | 'pickRate'
  label: string
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
export function TrendChart({ points, metric, label, markers = [], baseline }: TrendChartProps) {
  if (points.length < 2) return <p className="text-sm text-text-muted">Not enough daily data to draw a trend.</p>

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
  const summary = `${label} from ${formatPercent(values[0])} on ${DATE.format(first * 1000)} to ${formatPercent(values[values.length - 1])} on ${DATE.format(points[points.length - 1].day * 1000)}.`

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
              Patch
            </text>
          </g>
        ))}
        <path d={path} data-draw pathLength={1} fill="none" className="stroke-primary" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(points[points.length - 1].day)} cy={y(values[values.length - 1])} r={3.5} className="fill-highlight" />
        <text x={PAD.left} y={H - 6} className="fill-text-muted text-[11px]">
          {DATE.format(first * 1000)}
        </text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-text-muted text-[11px]">
          {DATE.format(points[points.length - 1].day * 1000)}
        </text>
      </svg>
      <figcaption className="text-caption text-text-muted">
        {summary} {baseline !== undefined && 'Dashed line: 50%.'} {visibleMarkers.length > 0 && 'Orange lines: patch dates.'} The latest day may be incomplete.
      </figcaption>
      <details className="text-sm">
        <summary className="cursor-pointer py-3 font-ui font-semibold text-primary hover:text-highlight">Show data</summary>
        <div className="mt-2 max-h-64 overflow-y-auto rounded-sm border border-border">
          <table className="w-full font-ui text-sm">
            <caption className="sr-only">{label} by day, the values behind the chart</caption>
            <thead className="sticky top-0 bg-surface text-eyebrow">
              <tr>
                <th scope="col" className="px-3 py-2 text-left">Day</th>
                <th scope="col" className="px-3 py-2 text-right">{label}</th>
                <th scope="col" className="px-3 py-2 text-right">Matches</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.day} className="border-t border-border">
                  <td className="px-3 py-1.5 text-text-muted">{DATE.format(p.day * 1000)}</td>
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
