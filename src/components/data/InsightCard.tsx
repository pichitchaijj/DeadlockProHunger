import type { Insight } from '@/lib/analytics/insights'
import { cx } from '@/lib/cx'
import { cardClasses } from '@/components/ui/Card'
import { ConfidenceBadge } from './ConfidenceBadge'

/**
 * One Insight Engine result (layer L1) with its "Why?" (layer L2): the metrics behind the
 * sentence, the rule it passed and any caveat. Native <details>, so it works without JavaScript.
 */
export function InsightCard({ insight, className }: { insight: Insight; className?: string }) {
  return (
    <article
      className={cx(
        cardClasses({ accent: insight.tone === 'positive' ? 'primary' : insight.tone === 'negative' ? 'warning' : 'none' }),
        'flex h-full flex-col gap-2 p-4',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <h3 className="text-eyebrow">{insight.title}</h3>
        <ConfidenceBadge sampleSize={insight.sampleSize} />
      </header>
      <p className={cx('font-display text-title font-bold break-words uppercase', insight.tone === 'negative' ? 'text-orange' : 'text-text')}>{insight.value}</p>
      <p className="text-sm text-text">{insight.statement}</p>
      <p className="mt-auto text-caption text-text-muted">{insight.context}</p>

      <details className="group border-t border-border pt-2">
        <summary className="inline-flex min-h-11 min-w-11 cursor-pointer list-none items-center font-ui text-sm font-medium text-primary hover:text-highlight [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Why?</span>
          <span className="hidden group-open:inline">Hide explanation</span>
        </summary>
        <div className="mt-1 flex animate-awaken flex-col gap-3 text-sm text-text-muted">
          <dl className="flex flex-col gap-1.5">
            {insight.metrics.map((m) => (
              <div key={m.label}>
                <dt className="text-caption text-text-muted">{m.label}</dt>
                <dd className="text-text tabular">{m.value}</dd>
              </div>
            ))}
          </dl>
          <p>
            <span className="font-medium text-text">Rule: </span>
            {insight.rule}
          </p>
          {insight.caveat && <p>{insight.caveat}</p>}
        </div>
      </details>
    </article>
  )
}
