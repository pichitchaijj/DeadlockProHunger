import { Link } from '@/i18n/navigation'
import type { ReactNode } from 'react'
import { cx } from '@/lib/cx'
import { CloseIcon } from './icons'

const base =
  'inline-flex h-7 items-center gap-1.5 rounded-pill border border-border-strong bg-surface-sunken px-3 font-ui text-xs text-text-muted whitespace-nowrap'
const interactive =
  'transition-colors duration-(--dur-fast) ease-awaken hover:border-border-control hover:text-text pointer-coarse:h-11'

type TagProps = {
  children: ReactNode
  icon?: ReactNode
  className?: string
  /** Renders the tag as a link (e.g. a build tag that filters a list). */
  href?: string
  /** Renders a remove button (e.g. an active filter chip). */
  onRemove?: () => void
  removeLabel?: string
}

/** Categorical label: build tags, hero roles, active filters. */
export function Tag({ children, icon, className, href, onRemove, removeLabel }: TagProps) {
  if (href) {
    return (
      <Link href={href} className={cx(base, interactive, className)}>
        {icon}
        {children}
      </Link>
    )
  }
  return (
    <span className={cx(base, onRemove && 'pr-1', className)}>
      {icon}
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? `Remove ${typeof children === 'string' ? children : 'tag'}`}
          className="inline-flex size-5 items-center justify-center rounded-pill text-text-muted hover:bg-surface-raised hover:text-text pointer-coarse:-my-2 pointer-coarse:size-11"
        >
          <CloseIcon size={14} />
        </button>
      )}
    </span>
  )
}
