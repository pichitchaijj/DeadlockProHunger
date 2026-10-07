'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { isActivePath, secondaryNav } from '@/config/navigation'
import { cx } from '@/lib/cx'
import { ChevronDownIcon } from '@/components/ui/icons'

/**
 * "More" disclosure for secondary navigation (APG disclosure navigation pattern):
 * a button with aria-expanded controlling a list of links.
 * Escape closes and returns focus; ↓/↑ move between links; clicking outside closes.
 */
export function MoreMenu() {
  const pathname = usePathname()
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const hasActiveChild = secondaryNav.some((item) => isActivePath(pathname, item.href))

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && open) {
      setOpen(false)
      buttonRef.current?.focus()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const links = [...(rootRef.current?.querySelectorAll<HTMLAnchorElement>('[data-more-link]') ?? [])]
    if (!open || links.length === 0) return
    event.preventDefault()
    const index = links.indexOf(document.activeElement as HTMLAnchorElement)
    const next = event.key === 'ArrowDown' ? (index + 1) % links.length : (index - 1 + links.length) % links.length
    links[next].focus()
  }

  return (
    // Keyboard handling is delegated from the button and links inside this wrapper.
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={rootRef}
      className="relative flex"
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
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
        More
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
          {secondaryNav.map((item) => {
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
                      {item.phase === 'later' && <LaterMark />}
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

export function LaterMark() {
  return (
    <span className="rounded-xs border border-border-strong px-1 text-[0.625rem] font-semibold tracking-wide text-text-muted uppercase">
      Later
    </span>
  )
}
