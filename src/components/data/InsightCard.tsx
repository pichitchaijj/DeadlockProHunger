import type { Insight } from '@/lib/analytics/insights'
import type { InsightText } from '@/lib/analytics/insightText'
import { cx } from '@/lib/cx'
import { cardClasses } from '@/components/ui/Card'
import { ConfidenceBadge } from './ConfidenceBadge'

/** The card's own words. It doesn't translate itself: a localized caller passes its labels; without them it stays English. */
export type InsightCardLabels = { why: string; hideExplanation: string; rule: string }

const LABELS: InsightCardLabels = { why: 'Why?', hideExplanation: 'Hide explanation', rule: 'Rule:' }

/**
 * One Insight Engine result (layer L1) with its "Why?" (layer L2): the metrics behind the
 * sentence, the rule it passed and any caveat. Native <details>, so it works without JavaScript.
 * `insight` carries the facts (tone, sample); `text` is its wording in the page's language
 * (lib/analytics/insightText).
 */
export function InsightCard({ insight, text, labels = LABELS, className }: { insight: Insight; text: InsightText; labels?: InsightCardLabels; className?: string }) {
  return (
    <article
      className={cx(
        cardClasses({ accent: insight.tone === 'positive' ? 'primary' : insight.tone === 'negative' ? 'warning' : 'none' }),
        'flex h-full flex-col gap-2 p-4',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <h3 className="text-eyebrow">{text.title}</h3>
        <ConfidenceBadge sampleSize={insight.sampleSize} />
      </header>
      <p className={cx('font-display text-title font-bold break-words uppercase', insight.tone === 'negative' ? 'text-orange' : 'text-text')}>{text.value}</p>
      <p className="text-sm text-text">{text.statement}</p>
      <p className="mt-auto text-caption text-text-muted">{text.context}</p>

      <details className="group border-t border-border pt-2">
        <summary className="inline-flex min-h-11 min-w-11 cursor-pointer list-none items-center font-ui text-sm font-medium text-primary hover:text-highlight [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">{labels.why}</span>
          <span className="hidden group-open:inline">{labels.hideExplanation}</span>
        </summary>
        <div className="mt-1 flex animate-awaken flex-col gap-3 text-sm text-text-muted">
          <dl className="flex flex-col gap-1.5">
            {text.metrics.map((m) => (
              <div key={m.id}>
                <dt className="text-caption text-text-muted">{m.label}</dt>
                <dd className="text-text tabular">{m.value}</dd>
              </div>
            ))}
          </dl>
          <p>
            <span className="font-medium text-text">{labels.rule} </span>
            {text.rule}
          </p>
          {text.caveat && <p>{text.caveat}</p>}
        </div>
      </details>
    </article>
  )
}
