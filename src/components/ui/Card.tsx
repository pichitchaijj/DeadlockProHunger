import type { HTMLAttributes } from 'react'
import { cx } from '@/lib/cx'

/**
 * The one card surface (docs/DESIGN.md § Cards): navy surface, hairline steel border, 8px radius,
 * near-flat shadow. Every card type (hero, build, match, player, stat, insight, trend, analytics)
 * is this surface plus its own content; pages don't invent new card styles.
 *
 * accent: `primary` = positive/current, `warning` = attention/trend (orange),
 * `featured` = the one focal card on a screen (cyan border + restrained glow).
 */
export type CardAccent = 'none' | 'primary' | 'warning' | 'featured'

const accents: Record<CardAccent, string> = {
  none: 'border-border',
  primary: 'border-primary/40',
  warning: 'border-orange/40',
  featured: 'border-primary/50 shadow-glow',
}

export function cardClasses({ interactive = false, accent = 'none', className }: { interactive?: boolean; accent?: CardAccent; className?: string } = {}) {
  return cx(interactive && 'elevate', 'rounded-md border bg-surface shadow-card', accents[accent], className)
}

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: 'article' | 'section' | 'div' | 'li'
  interactive?: boolean
  accent?: CardAccent
}

export function Card({ as: Tag = 'div', interactive, accent, className, ...props }: CardProps) {
  return <Tag className={cardClasses({ interactive, accent, className })} {...props} />
}
