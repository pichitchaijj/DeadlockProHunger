import type { ReactNode } from 'react'
import { cx } from '@/lib/cx'

type SectionHeaderProps = {
  title: string
  /** Small uppercase label above the title, e.g. the scope or category. */
  eyebrow?: ReactNode
  description?: ReactNode
  /** Right-aligned actions, e.g. a "View all" link or filters. */
  actions?: ReactNode
  /** Heading level; keep the page hierarchy intact (one h1 per page). */
  as?: 'h1' | 'h2' | 'h3'
  id?: string
  className?: string
}

const sizes = {
  h1: 'text-display-l',
  h2: 'text-display-m',
  h3: 'text-title font-ui normal-case tracking-normal',
} as const

export function SectionHeader({
  title,
  eyebrow,
  description,
  actions,
  as: Heading = 'h2',
  id,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cx('flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0 max-w-2xl">
        {eyebrow && <p className="mb-2 text-eyebrow">{eyebrow}</p>}
        <Heading id={id} className={cx('font-display font-bold uppercase text-text', sizes[Heading])}>
          {title}
        </Heading>
        {description && <p className="mt-2 text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
