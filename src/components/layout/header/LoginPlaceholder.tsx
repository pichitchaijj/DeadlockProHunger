import { useTranslations } from 'next-intl'
import { useId } from 'react'
import { cx } from '@/lib/cx'
import { UserIcon } from '@/components/ui/icons'

/**
 * Sign-in placeholder. Accounts arrive with the Personal Dashboard (Steam OpenID, post-MVP).
 * aria-disabled (not `disabled`) keeps it focusable so the explanation stays discoverable.
 */
export function LoginPlaceholder({ variant = 'compact', className }: { variant?: 'compact' | 'block'; className?: string }) {
  const hintId = useId()
  const t = useTranslations('header')

  return (
    <span className={cx(variant === 'block' ? 'flex flex-col gap-1.5' : 'inline-flex', className)}>
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={hintId}
        title={t('signInSoon')}
        className={cx(
          'inline-flex items-center justify-center gap-2 rounded-sm border border-border-control font-ui text-sm font-semibold',
          'cursor-not-allowed text-text-muted',
          variant === 'block' ? 'h-12 w-full' : 'h-10 px-3',
        )}
      >
        <UserIcon size={18} />
        {t('signIn')}
      </button>
      <span id={hintId} className={variant === 'block' ? 'text-caption text-text-muted' : 'sr-only'}>
        {t('accountsLater')}
      </span>
    </span>
  )
}
