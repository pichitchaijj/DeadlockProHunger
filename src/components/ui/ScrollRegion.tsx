import type { ReactNode } from 'react'
import { cx } from '@/lib/cx'

/**
 * A horizontally scrollable area keyboard users can scroll: it takes focus (Tab, then arrow keys)
 * and is announced by name (WCAG 2.1.1; axe `scrollable-region-focusable`). Use it when the scrolled
 * content has nothing focusable inside (a plain data table, an icon grid). A table full of links
 * already scrolls with focus and doesn't need it.
 */
export function ScrollRegion({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be focusable for keyboard scrolling
    <div role="region" aria-label={label} tabIndex={0} className={cx('overflow-x-auto rounded-sm', className)}>
      {children}
    </div>
  )
}
