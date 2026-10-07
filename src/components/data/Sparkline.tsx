import { cx } from '@/lib/cx'

type SparklineProps = {
  values: number[]
  /** Text equivalent for screen readers, e.g. "Win rate rose from 49.8% to 52.1% over 7 days." */
  summary: string
  /** Optional reference value drawn as a dashed line (e.g. 0.5 for win rate). */
  baseline?: number
  tone?: 'primary' | 'orange' | 'muted'
  width?: number
  height?: number
  className?: string
}

const strokes = {
  primary: 'stroke-primary',
  orange: 'stroke-orange',
  muted: 'stroke-text-muted',
} as const

/** Minimal trend line with a "graph reveal" draw animation (CSS only, no JS). */
export function Sparkline({
  values,
  summary,
  baseline,
  tone = 'primary',
  width = 120,
  height = 32,
  className,
}: SparklineProps) {
  if (values.length < 2) return null
  const all = baseline === undefined ? values : [...values, baseline]
  const min = Math.min(...all)
  const max = Math.max(...all)
  const range = max - min || 1
  const pad = 2
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2)
  const y = (v: number) => pad + (1 - (v - min) / range) * (height - pad * 2)
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const last = values[values.length - 1]

  return (
    <svg
      role="img"
      aria-label={summary}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cx('overflow-visible', className)}
    >
      {baseline !== undefined && (
        <line
          x1={pad}
          x2={width - pad}
          y1={y(baseline)}
          y2={y(baseline)}
          className="stroke-steel"
          strokeDasharray="2 3"
          strokeWidth={1}
        />
      )}
      <polyline
        data-draw
        pathLength={1}
        points={points}
        fill="none"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={strokes[tone]}
      />
      <circle cx={x(values.length - 1)} cy={y(last)} r={2.5} className={cx('fill-current', tone === 'orange' ? 'text-orange' : tone === 'muted' ? 'text-text-muted' : 'text-highlight')} />
    </svg>
  )
}
