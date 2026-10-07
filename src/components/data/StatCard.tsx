import type { ReactNode } from 'react'
import type { StatScope } from '@/lib/analytics/scope'
import { cx } from '@/lib/cx'
import { cardClasses } from '@/components/ui/Card'
import { CountUp, type CountUpFormat } from '@/components/motion/CountUp'
import { ConfidenceBadge } from './ConfidenceBadge'
import { ScopeLine } from './ScopeLine'
import type { Interval } from '@/lib/analytics/wilson'

type StatCardProps = {
  /** The question the number answers, as a short label: "Win rate", "Most picked". */
  label: string
  value: number
  format: CountUpFormat
  /** Optional subject next to the value, e.g. a hero name. */
  subject?: ReactNode
  /** Usually a TrendBadge. */
  delta?: ReactNode
  /** Required: window, rank scope, sample size, source. */
  scope: StatScope
  /** Optional 95% interval; shown with the sample tier when scope has a sample size. */
  interval?: Interval
  /** Plain-language "Why?" explanation (layer L2), revealed on demand. */
  why?: ReactNode
  /** Optional sparkline or action link under the value. */
  footer?: ReactNode
  /**
   * Set false when the surrounding section already shows the same ScopeLine
   * (e.g. a row of cards sharing one scope). The sample-size badge always stays.
   */
  showScope?: boolean
  /** Restrained glow for the single focal card on a page. */
  featured?: boolean
  className?: string
}

/** Insight card (layer L1): one number that answers one question, with its context. */
export function StatCard({
  label,
  value,
  format,
  subject,
  delta,
  scope,
  interval,
  why,
  footer,
  showScope = true,
  featured = false,
  className,
}: StatCardProps) {
  return (
    <article
      className={cx(
        cardClasses({ accent: featured ? 'featured' : 'none' }),
        'flex flex-col gap-3 p-(--spacing-card)',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <h3 className="text-eyebrow">{label}</h3>
        {scope.sampleSize !== undefined && (
          <ConfidenceBadge sampleSize={scope.sampleSize} interval={interval} />
        )}
      </header>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <CountUp
          value={value}
          format={format}
          className="font-display text-display-l font-bold text-text"
        />
        {subject && <span className="font-ui text-title font-semibold text-text">{subject}</span>}
        {delta}
      </div>

      {footer}

      {showScope ? <ScopeLine scope={scope} className="mt-auto" /> : <div className="mt-auto" />}

      {why && (
        <details className="group border-t border-border pt-3">
          <summary className="inline-flex min-h-11 min-w-11 cursor-pointer list-none items-center font-ui text-sm font-medium text-primary hover:text-highlight [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Why?</span>
            <span className="hidden group-open:inline">Hide explanation</span>
          </summary>
          <div className="mt-2 animate-awaken text-sm text-text-muted">{why}</div>
        </details>
      )}
    </article>
  )
}
