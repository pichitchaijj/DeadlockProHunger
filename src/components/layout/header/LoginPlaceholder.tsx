import { useId } from 'react'
import { cx } from '@/lib/cx'
import { UserIcon } from '@/components/ui/icons'

/**
 * Sign-in placeholder. Accounts arrive with the Personal Dashboard (Steam OpenID, post-MVP).
 * aria-disabled (not `disabled`) keeps it focusable so the explanation stays discoverable.
 */
export function LoginPlaceholder({ variant = 'compact', className }: { variant?: 'compact' | 'block'; className?: string }) {
  const hintId = useId()

  return (
    <span className={cx(variant === 'block' ? 'flex flex-col gap-1.5' : 'inline-flex', className)}>
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={hintId}
        title="Sign-in is coming later"
        className={cx(
          'inline-flex items-center justify-center gap-2 rounded-sm border border-border-control font-ui text-sm font-semibold',
          'cursor-not-allowed text-text-muted',
          variant === 'block' ? 'h-12 w-full' : 'h-10 px-3',
        )}
      >
        <UserIcon size={18} />
        Sign in
      </button>
      <span id={hintId} className={variant === 'block' ? 'text-caption text-text-muted' : 'sr-only'}>
        Accounts are coming later. Everything is available without signing in.
      </span>
    </span>
  )
}
