import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '@/lib/cx'

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  /** Required: icon-only controls need an accessible name. */
  label: string
  icon: ReactNode
  variant?: 'ghost' | 'outline'
  size?: 'sm' | 'md'
}

export function IconButton({
  label,
  icon,
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-sm text-text-muted',
        'transition-[background-color,border-color,color] duration-(--dur-fast) ease-awaken',
        'hover:text-text disabled:pointer-events-none disabled:opacity-45',
        variant === 'ghost' && 'hover:bg-surface-raised',
        variant === 'outline' && 'border border-border-control hover:border-primary',
        size === 'sm' ? 'size-9 pointer-coarse:size-11' : 'size-11',
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  )
}
