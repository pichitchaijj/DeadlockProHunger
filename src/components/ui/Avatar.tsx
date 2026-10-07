import { cx } from '@/lib/cx'

type AvatarProps = {
  name: string
  /** Public Steam avatar URL. */
  src?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = { sm: 32, md: 40, lg: 64 } as const

/** Player avatar with an initial fallback. Not a game asset. */
export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const px = sizes[size]
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-pill border border-border-strong bg-surface-sunken',
        className,
      )}
      style={{ width: px, height: px }}
    >
      {src ? (
        // oxlint-disable-next-line nextjs/no-img-element -- remote hosts get next/image config in P2
        <img src={src} alt="" width={px} height={px} loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        <span aria-hidden="true" className="font-ui text-sm font-semibold text-text-muted">
          {name.trim().slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  )
}
