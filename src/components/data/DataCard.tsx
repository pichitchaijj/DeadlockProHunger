import type { ReactNode } from 'react'
import type { StatScope } from '@/lib/analytics/scope'
import { cx } from '@/lib/cx'
import { cardClasses } from '@/components/ui/Card'
import { ScopeLine } from './ScopeLine'

type DataCardProps = {
  title: string
  /** Heading level for the title; keep the page outline intact. */
  headingLevel?: 'h2' | 'h3'
  description?: ReactNode
  /** Required when the body shows statistics. */
  scope?: StatScope
  /** Header actions, e.g. a Filter, a Tooltip, or a "View all" link. */
  actions?: ReactNode
  /** Source / methodology note at the bottom. */
  note?: ReactNode
  children: ReactNode
  className?: string
}

/** Generic container for a chart, list or table (layers L2/L3) with its context. */
export function DataCard({
  title,
  headingLevel: Heading = 'h3',
  description,
  scope,
  actions,
  note,
  children,
  className,
}: DataCardProps) {
  return (
    <section className={cardClasses({ className: cx('flex flex-col', className) })}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-(--spacing-card) py-4">
        <div className="min-w-0">
          <Heading className="font-ui text-title font-semibold text-text">{title}</Heading>
          {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
          {scope && <ScopeLine scope={scope} className="mt-2" />}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className="flex-1 p-(--spacing-card)">{children}</div>
      {note && (
        <footer className="border-t border-border px-(--spacing-card) py-3 text-caption text-text-muted">
          {note}
        </footer>
      )}
    </section>
  )
}
