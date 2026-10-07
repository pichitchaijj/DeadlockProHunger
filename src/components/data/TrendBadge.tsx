import { cx } from '@/lib/cx'
import { formatPointDelta } from '@/lib/format'
import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from '@/components/ui/icons'

export type TrendDirection = 'rising' | 'falling' | 'stable'

type TrendBadgeProps = {
  /**
   * Decided by the analytics layer (interval-overlap rule, docs/PRODUCT.md),
   * never inferred from the sign of `delta` alone.
   */
  direction: TrendDirection
  /** Change as a ratio, e.g. 0.031 → "+3.1pp". */
  delta?: number
  /** What the change is compared with, e.g. "vs previous 7 days". */
  comparison?: string
  /** Subtle attention pulse (plays twice, then stops). Use on the few trends that matter on a page. */
  pulse?: boolean
  className?: string
}

const config = {
  rising: { icon: ArrowUpIcon, label: 'Rising', className: 'text-positive border-positive/40 bg-positive/10' },
  falling: { icon: ArrowDownIcon, label: 'Falling', className: 'text-orange border-orange/40 bg-orange/10' },
  stable: { icon: MinusIcon, label: 'Stable', className: 'text-text-muted border-border-strong' },
} as const

/** Direction is always conveyed by icon + word, not color alone. */
export function TrendBadge({ direction, delta, comparison, pulse = false, className }: TrendBadgeProps) {
  const { icon: Icon, label, className: tone } = config[direction]
  const text = direction !== 'stable' && delta !== undefined ? `${label} ${formatPointDelta(delta)}` : label

  return (
    <span
      className={cx(
        'inline-flex h-6 items-center gap-1 rounded-xs border px-1.5 font-ui text-caption font-semibold whitespace-nowrap tabular',
        tone,
        pulse && direction !== 'stable' && 'animate-trend-pulse',
        className,
      )}
      title={comparison}
    >
      <Icon size={14} />
      {text}
      {comparison && <span className="sr-only">, {comparison}</span>}
    </span>
  )
}
