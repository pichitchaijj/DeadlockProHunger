import { cx } from '@/lib/cx'
import { formatPercent } from '@/lib/format'

type WinRateProps = {
  /** Ratio 0–1. */
  value: number
  /** Muted styling for Low-sample values (docs/PRODUCT.md § Sample size). */
  muted?: boolean
  showBar?: boolean
  className?: string
}

/**
 * Win rate with a 50% reference bar. Above/below 50% is shown by bar
 * direction and position, not color alone.
 */
export function WinRate({ value, muted = false, showBar = true, className }: WinRateProps) {
  const offset = Math.min(0.5, Math.abs(value - 0.5)) * 100 // % of the half-track
  const above = value >= 0.5

  return (
    <span className={cx('inline-flex flex-col gap-1', className)}>
      <span className={cx('font-ui text-sm font-semibold tabular', muted ? 'text-text-muted' : 'text-text')}>
        {formatPercent(value)}
      </span>
      {showBar && (
        <span aria-hidden="true" className="relative h-1 w-16 rounded-pill bg-surface-sunken">
          <span className="absolute inset-y-[-2px] left-1/2 w-px bg-text-muted/60" />
          <span
            className={cx(
              'absolute inset-y-0 rounded-pill',
              muted ? 'bg-steel' : above ? 'bg-positive' : 'bg-negative',
            )}
            style={above ? { left: '50%', width: `${offset}%` } : { right: '50%', width: `${offset}%` }}
          />
        </span>
      )}
    </span>
  )
}
