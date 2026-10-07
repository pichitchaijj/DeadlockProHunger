import { Link } from '@/i18n/navigation'
import type { ReactNode } from 'react'
import { cx } from '@/lib/cx'

export type FilterOption = {
  value: string
  label: string
  /** URL that applies this option. Filter state lives in the URL so views are shareable. */
  href: string
  /** Small leading visual (e.g. a rank band's emblems); decorative, the label carries the meaning. */
  icon?: ReactNode
}

type FilterProps = {
  /** Visible group label, e.g. "Rank" or "Window". */
  label: string
  options: FilterOption[]
  value: string
  className?: string
}

/**
 * Single-select preset filter rendered as links (no client JS).
 * Scrolls horizontally on narrow screens; the active option is marked with aria-current.
 */
export function Filter({ label, options, value, className }: FilterProps) {
  return (
    // min-w-0: inside grid/flex parents, the scrollable chip row must not stretch its track.
    <nav aria-label={`${label} filter`} className={cx('flex min-w-0 flex-col gap-2', className)}>
      <span className="text-eyebrow" aria-hidden="true">
        {label}
      </span>
      <ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin] md:flex-wrap md:overflow-visible">
        {options.map((option) => {
          const active = option.value === value
          return (
            <li key={option.value} className="shrink-0">
              <Link
                href={option.href}
                scroll={false}
                aria-current={active ? 'true' : undefined}
                className={cx(
                  'inline-flex h-9 items-center gap-1.5 rounded-pill border px-3.5 font-ui text-sm whitespace-nowrap pointer-coarse:h-11',
                  'transition-[background-color,border-color,color] duration-(--dur-fast) ease-awaken',
                  active
                    ? 'border-primary bg-primary font-medium text-on-primary'
                    : 'border-border-control text-text-muted hover:border-text-muted hover:text-text',
                )}
              >
                {option.icon}
                {option.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
