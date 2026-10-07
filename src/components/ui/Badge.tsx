import { useTranslations } from 'next-intl'
import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '@/lib/cx'

export type BadgeTone = 'neutral' | 'primary' | 'positive' | 'negative' | 'warning' | 'special'

const tones: Record<BadgeTone, string> = {
  neutral: 'border-border-strong text-text-muted',
  primary: 'border-primary/50 text-primary bg-primary/10',
  positive: 'border-positive/50 text-positive bg-positive/10',
  negative: 'border-negative/50 text-negative bg-negative/10',
  warning: 'border-orange/50 text-orange bg-orange/10',
  // Pink text is only 4.18:1 on surface, so special uses light text on a pink tint.
  special: 'border-pink/70 text-text bg-pink/20',
}

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone
  icon?: ReactNode
}

/** Non-interactive status label. Use `Tag` for categories and removable chips. */
export function Badge({ tone = 'neutral', icon, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex h-6 items-center gap-1 rounded-xs border px-2 font-ui text-caption font-semibold tracking-wide uppercase whitespace-nowrap',
        tones[tone],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  )
}

/** Mock-data marker. Required on any UI rendering demo data. */
export function DemoDataBadge({ className }: { className?: string }) {
  const t = useTranslations('common')
  return (
    <Badge tone="special" className={className} title={t('demoDataTitle')}>
      {t('demoData')}
    </Badge>
  )
}
