import { cx } from '@/lib/cx'
import { formatPercent } from '@/lib/format'

type RadialMetricProps = {
  /** Share of the whole, 0–1 (e.g. a win rate or pick rate). */
  value: number
  /** What the number is, shown under the ring and used in the accessible name. */
  label: string
  /** Optional reference mark on the ring (e.g. 0.5 for win rate). */
  reference?: number
  tone?: 'primary' | 'orange' | 'pink'
  size?: number
  /** Low-sample values render muted (same rule as every other statistic). */
  muted?: boolean
  className?: string
}

const strokes = { primary: 'stroke-chart-1', orange: 'stroke-chart-2', pink: 'stroke-chart-3' } as const

/**
 * Ring gauge with the value in the center (docs/DESIGN.md § Data visualization). For a single share
 * that reads at a glance; never for comparing several values (use bars). The number is real text, so
 * it is readable without the ring, and the ring itself is decorative for screen readers.
 */
export function RadialMetric({ value, label, reference, tone = 'primary', size = 88, muted = false, className }: RadialMetricProps) {
  const clamped = Math.min(1, Math.max(0, value))
  const stroke = 7
  const r = (size - stroke) / 2
  const c = size / 2
  const text = formatPercent(clamped)
  // The reference tick sits on the ring at its share of the circle, starting at 12 o'clock.
  const refAngle = reference === undefined ? null : reference * 2 * Math.PI - Math.PI / 2
  return (
    <figure className={cx('inline-flex flex-col items-center gap-2', className)}>
      <div className="relative animate-fade-in" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false" className="-rotate-90">
          <circle cx={c} cy={c} r={r} fill="none" strokeWidth={stroke} className="stroke-chart-grid" />
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={`${clamped} 1`}
            className={muted ? 'stroke-chart-muted' : strokes[tone]}
          />
        </svg>
        {refAngle !== null && (
          <span
            aria-hidden="true"
            className="absolute h-2.5 w-0.5 bg-text-muted"
            style={{ left: c + r * Math.cos(refAngle), top: c + r * Math.sin(refAngle), transform: `translate(-50%, -50%) rotate(${(reference ?? 0) * 360}deg)` }}
          />
        )}
        <span className={cx('absolute inset-0 grid place-items-center font-display text-heading-md font-bold tabular', muted ? 'text-text-muted' : 'text-text')}>{text}</span>
      </div>
      <figcaption className="text-caption text-text-muted">{label}</figcaption>
    </figure>
  )
}
