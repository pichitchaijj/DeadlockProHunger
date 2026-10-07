import type { ReactNode } from 'react'
import { cx } from '@/lib/cx'

type PageContainerProps = {
  children: ReactNode
  /** `page` = standard top/bottom spacing; `flush` = no vertical padding (full-bleed heroes). */
  spacing?: 'page' | 'flush'
  /** Narrow measure for reading-heavy pages (About, methodology). */
  width?: 'content' | 'reading'
  className?: string
}

/** Width-limited, gutter-padded page wrapper. Use once per page inside <main>. */
export function PageContainer({ children, spacing = 'page', width = 'content', className }: PageContainerProps) {
  return (
    <div
      className={cx(
        'page-container',
        width === 'reading' && 'max-w-3xl',
        spacing === 'page' && 'py-10 lg:py-14',
        className,
      )}
    >
      {children}
    </div>
  )
}
