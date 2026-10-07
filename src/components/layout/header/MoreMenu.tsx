'use client'

import { Link, usePathname } from '@/i18n/navigation'
import { useId } from 'react'
import { isActivePath, type NavItem } from '@/config/navigation'
import { cx } from '@/lib/cx'
import { ChevronDownIcon } from '@/components/ui/icons'
import { useDisclosureMenu } from '@/components/ui/useDisclosureMenu'

export type NavLabels = { more: string; later: string }

/**
 * "More" disclosure for secondary navigation (APG disclosure navigation pattern):
 * a button with aria-expanded controlling a list of links.
 * Escape closes and returns focus; ↓/↑ move between links; clicking outside closes (useDisclosureMenu).
 */
export function MoreMenu({ items, labels }: { items: NavItem[]; labels: NavLabels }) {
  // App path without the locale prefix (/th/heroes → /heroes), compared with the nav hrefs.
  const pathname = usePathname()
  const panelId = useId()
  const { open, setOpen, buttonRef, rootProps } = useDisclosureMenu('data-more-link')
  const hasActiveChild = items.some((item) => isActivePath(pathname, item.href))

  return (
    // Keyboard handling is delegated from the button and links inside this wrapper.
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
    <div {...rootProps} className="relative flex">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          'flex items-center gap-1 px-3.5 font-display text-[0.95rem] font-semibold tracking-[0.08em] uppercase',
          'transition-colors duration-(--dur-fast) ease-awaken',
          open || hasActiveChild ? 'text-text' : 'text-text-muted hover:text-text',
        )}
      >
        {labels.more}
        <ChevronDownIcon
          size={16}
          className={cx('transition-transform duration-(--dur-fast)', open && 'rotate-180')}
        />
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute top-full left-0 z-50 mt-px w-80 rounded-b-md border border-t-0 border-border-strong bg-surface p-2 shadow-overlay animate-scale-in"
      >
        <ul>
          {items.map((item) => {
            const active = isActivePath(pathname, item.href)
            return (
              <li key={item.href}>
                <Link
                  data-more-link
                  href={item.href}
                  prefetch={item.built ? undefined : false}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                  className={cx(
                    'flex items-start gap-3 rounded-sm px-3 py-2.5 transition-colors duration-(--dur-fast)',
                    active ? 'bg-surface-raised' : 'hover:bg-surface-raised',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cx('mt-1.5 size-1.5 shrink-0 rotate-45', active ? 'bg-primary' : 'bg-steel')}
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-ui text-sm font-semibold text-text">
                      {item.label}
                      {item.phase === 'later' && <LaterMark label={labels.later} />}
                    </span>
                    <span className="block text-caption text-text-muted">{item.description}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export function LaterMark({ label }: { label: string }) {
  return (
    <span className="rounded-xs border border-border-strong px-1 text-[0.625rem] font-semibold tracking-wide text-text-muted uppercase">
      {label}
    </span>
  )
}
