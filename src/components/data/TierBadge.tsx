import { useTranslations } from 'next-intl'
import type { Tier } from '@/lib/analytics/tiers'
import { cx } from '@/lib/cx'

const styles: Record<Tier, string> = {
  S: 'bg-primary text-on-primary border-primary',
  A: 'border-primary/60 text-primary bg-primary/10',
  B: 'border-border-control text-text',
  C: 'border-orange/50 text-orange',
}

/** Meta tier letter. `null` = not enough data for a tier (shown as an em dash, never as a low tier). */
export function TierBadge({ tier, size = 'md', className }: { tier: Tier | null; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const t = useTranslations('data')
  const box = size === 'lg' ? 'size-12 text-3xl' : size === 'sm' ? 'size-6 text-sm' : 'size-8 text-lg'
  return (
    <span
      title={tier ? t('tierTitle', { tier, rule: t(`tierRules.${tier}`) }) : t('noTierTitle')}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-xs border font-display font-extrabold leading-none',
        tier ? styles[tier] : 'border-dashed border-border-strong text-text-muted',
        box,
        className,
      )}
    >
      <span aria-hidden="true">{tier ?? '–'}</span>
      <span className="sr-only">{tier ? t('tier', { tier }) : t('noTier')}</span>
    </span>
  )
}
