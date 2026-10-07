'use client'

import { Link, usePathname } from '@/i18n/navigation'
import { isActivePath, type NavItem } from '@/config/navigation'
import { cx } from '@/lib/cx'

/**
 * Desktop primary navigation (≥ lg). Condensed uppercase labels with a
 * primary underline that grows in on the current section.
 */
export function PrimaryNav({ items }: { items: NavItem[] }) {
  // App path without the locale prefix (/th/heroes → /heroes), compared with the nav hrefs.
  const pathname = usePathname()

  return (
    <ul className="flex items-stretch">
      {items.map((item) => {
        const active = isActivePath(pathname, item.href)
        return (
          <li key={item.href} className="flex">
            <Link
              href={item.href}
              prefetch={item.built ? undefined : false}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'group relative flex items-center px-3.5 font-display text-[0.95rem] font-semibold tracking-[0.08em] uppercase',
                'transition-colors duration-(--dur-fast) ease-awaken',
                active ? 'text-text' : 'text-text-muted hover:text-text',
              )}
            >
              {item.label}
              <span
                aria-hidden="true"
                className={cx(
                  'absolute inset-x-3.5 -bottom-px h-0.5 origin-left bg-primary',
                  'transition-[transform,opacity] duration-(--dur-medium) ease-awaken',
                  active
                    ? 'scale-x-100 shadow-[0_0_12px_var(--color-primary)]'
                    : 'scale-x-0 opacity-0 group-hover:scale-x-100 group-hover:bg-steel group-hover:opacity-100',
                )}
              />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
