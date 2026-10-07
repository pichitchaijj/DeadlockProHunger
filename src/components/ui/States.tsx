import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { cx } from '@/lib/cx'
import { AlertIcon, ReticleIcon } from './icons'
import { Skeleton } from './Skeleton'

type StateFrameProps = {
  icon: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  tone?: 'neutral' | 'error'
  className?: string
  role?: 'status' | 'alert'
}

function StateFrame({ icon, title, description, action, tone = 'neutral', className, role }: StateFrameProps) {
  return (
    <div
      role={role}
      className={cx(
        'flex flex-col items-center gap-3 rounded-md border border-dashed px-6 py-10 text-center',
        tone === 'error' ? 'border-negative/50' : 'border-border-strong',
        className,
      )}
    >
      <span className={cx(tone === 'error' ? 'text-negative' : 'text-steel')}>{icon}</span>
      <p className="font-display text-display-m font-bold uppercase text-text">{title}</p>
      {description && <p className="max-w-md text-sm text-text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

type EmptyStateProps = {
  title: string
  /** Explain why it's empty and what the user can do. */
  description?: ReactNode
  action?: ReactNode
  className?: string
}

/** Nothing to show, e.g. no matches yet, or every row is below the sample threshold. */
export function EmptyState(props: EmptyStateProps) {
  return <StateFrame icon={<ReticleIcon size={40} />} {...props} />
}

type ErrorStateProps = {
  title?: string
  description?: ReactNode
  /** Typically a retry Button or a link back. */
  action?: ReactNode
  className?: string
}

/** Plain-language failure. Never shows placeholder numbers. Defaults come from `errors.generic`. */
export function ErrorState({ title, description, ...props }: ErrorStateProps) {
  const t = useTranslations('errors.generic')
  return (
    <StateFrame icon={<AlertIcon size={40} />} tone="error" role="alert" title={title ?? t('title')} description={description ?? t('description')} {...props} />
  )
}

type LoadingStateProps = {
  /** Announced to screen readers, e.g. "Loading hero statistics". */
  label: string
  /** Skeleton layout matching the final content. Defaults to a few text lines. */
  children?: ReactNode
  className?: string
}

/** Accessible loading wrapper: a polite status announcement plus decorative skeletons. */
export function LoadingState({ label, children, className }: LoadingStateProps) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children ?? (
        <div className="flex flex-col gap-3">
          <Skeleton shape="text" className="w-1/3" />
          <Skeleton shape="text" className="w-full" />
          <Skeleton shape="text" className="w-5/6" />
        </div>
      )}
    </div>
  )
}
