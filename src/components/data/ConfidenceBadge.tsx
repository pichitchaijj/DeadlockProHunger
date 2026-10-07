import { useLocale, useTranslations } from 'next-intl'
import { sampleTier, type SampleScale, type SampleTier } from '@/lib/analytics/sampleTier'
import type { Interval } from '@/lib/analytics/wilson'
import { cx } from '@/lib/cx'
import { formatCompact, formatPercent } from '@/lib/format'

type ConfidenceBadgeProps = {
  /** Matches behind the statistic. */
  sampleSize: number
  /** Optional 95% interval; shown as a compact range bar. */
  interval?: Interval
  /** `player` uses the smaller per-player thresholds (lib/analytics/sampleTier). */
  scale?: SampleScale
  className?: string
}

const tones: Record<SampleTier, { dots: number; className: string }> = {
  low: { dots: 1, className: 'text-text-muted border-border-strong' },
  moderate: { dots: 2, className: 'text-text border-border-control' },
  high: { dots: 3, className: 'text-primary border-primary/50' },
}

/** Sample-size tier (Low / Moderate / High) with n, and optionally the 95% interval. */
export function ConfidenceBadge({ sampleSize, interval, scale = 'population', className }: ConfidenceBadgeProps) {
  const tier = sampleTier(sampleSize, scale)
  const { dots, className: tone } = tones[tier]
  const t = useTranslations('data')
  const locale = useLocale()
  const label = t(`sample.${tier}`)
  const description = interval
    ? t('confidenceInterval', { tier: label, count: sampleSize, low: formatPercent(interval.low), high: formatPercent(interval.high) })
    : t('confidence', { tier: label, count: sampleSize })

  return (
    <span
      className={cx(
        'inline-flex h-6 items-center gap-2 rounded-xs border px-1.5 font-ui text-caption whitespace-nowrap',
        tone,
        className,
      )}
      title={description}
    >
      <span aria-hidden="true" className="flex gap-0.5">
        {[1, 2, 3].map((i) => (
          <span key={i} className={cx('size-1.5 rounded-pill', i <= dots ? 'bg-current' : 'bg-steel')} />
        ))}
      </span>
      <span aria-hidden="true" className="tabular">
        n={formatCompact(sampleSize, locale)}
      </span>
      {interval && <IntervalBar interval={interval} />}
      <span className="sr-only">{description}</span>
    </span>
  )
}

/** 0–100% track with the interval highlighted and a 50% reference tick. */
function IntervalBar({ interval }: { interval: Interval }) {
  return (
    <span aria-hidden="true" className="relative h-1.5 w-12 rounded-pill bg-surface-sunken">
      <span className="absolute inset-y-0 left-1/2 w-px bg-steel" />
      <span
        className="absolute inset-y-0 rounded-pill bg-current"
        style={{ left: `${interval.low * 100}%`, width: `${Math.max(2, (interval.high - interval.low) * 100)}%` }}
      />
    </span>
  )
}
