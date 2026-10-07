'use client'

import { Link, usePathname } from '@/i18n/navigation'
import { useState, type ReactNode } from 'react'
import { isActivePath, type NavItem } from '@/config/navigation'
import { cx } from '@/lib/cx'
import { Drawer } from '@/components/ui/Dialog'
import { AnalyzeIcon, BuildsIcon, ChevronRightIcon, HeroesIcon, HomeIcon, MatchesIcon, MenuIcon, ReticleIcon, SearchIcon } from '@/components/ui/icons'
import { useCommandPalette } from '../command/CommandPaletteProvider'
import { LoginPlaceholder } from './LoginPlaceholder'
import { LanguageSwitcher, type LanguageSwitcherLabels } from './LanguageSwitcher'
import { LaterMark, type NavLabels } from './MoreMenu'

/**
 * Hamburger + navigation drawer (< lg).
 * Large touch targets (≥ 48px), the current page marked with aria-current,
 * bottom safe-area spacing, and the drawer closes when a link is chosen.
 */
export function MobileNav({ primary, secondary, labels, languages }: { primary: NavItem[]; secondary: NavItem[]; labels: NavLabels; languages: LanguageSwitcherLabels }) {
  // App path without the locale prefix (/th/heroes → /heroes), compared with the nav hrefs.
  const pathname = usePathname()
  const { open: openSearch } = useCommandPalette()
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex size-11 items-center justify-center rounded-sm text-text hover:bg-surface-raised"
      >
        <MenuIcon />
      </button>

      <Drawer open={open} onClose={close} side="right" title="Menu">
        <nav aria-label="Mobile" className="flex flex-col gap-6">
          <button
            type="button"
            onClick={() => {
              close()
              openSearch()
            }}
            className="flex h-12 items-center gap-3 rounded-sm border border-border-control bg-surface-sunken px-4 text-left font-ui text-sm text-text-muted"
          >
            <SearchIcon size={18} />
            Search pages, players, matches…
          </button>

          <ul className="flex flex-col">
            {primary.map((item, i) => {
              const active = isActivePath(pathname, item.href)
              return (
                <li key={item.href} className="animate-awaken" style={{ animationDelay: `calc(${i} * var(--stagger-step))` }}>
                  <Link
                    href={item.href}
                    prefetch={item.built ? undefined : false}
                    onClick={close}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'flex min-h-13 items-center justify-between border-b border-border py-2 font-display text-2xl font-bold tracking-wide uppercase',
                      active ? 'text-text' : 'text-text-muted hover:text-text',
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className={cx('h-5 w-0.5', active ? 'bg-primary shadow-[0_0_10px_var(--color-primary)]' : 'bg-transparent')}
                      />
                      {SectionIcon[item.href] && <span className={active ? 'text-primary' : 'text-steel'}>{SectionIcon[item.href]}</span>}
                      {item.label}
                    </span>
                    <ChevronRightIcon size={18} className="text-text-muted" />
                  </Link>
                </li>
              )
            })}
          </ul>

          <div>
            <p className="mb-2 text-eyebrow" id="mobile-more-heading">
              {labels.more}
            </p>
            <ul aria-labelledby="mobile-more-heading" className="grid grid-cols-2 gap-2">
              {secondary.map((item) => {
                const active = isActivePath(pathname, item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      prefetch={item.built ? undefined : false}
                      onClick={close}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'flex min-h-12 items-center justify-between gap-2 rounded-sm border px-3 font-ui text-sm font-semibold',
                        active ? 'border-primary bg-primary/10 text-text' : 'border-border text-text-muted hover:text-text',
                      )}
                    >
                      {item.label}
                      {item.phase === 'later' && <LaterMark label={labels.later} />}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>

          <LanguageSwitcher variant="list" labels={languages} />

          <LoginPlaceholder variant="block" />
        </nav>
      </Drawer>
    </>
  )
}

/** Original section icons for the primary destinations (by href, so navigation.ts stays plain data). */
const SectionIcon: Record<string, ReactNode> = {
  '/': <HomeIcon size={22} />,
  '/meta': <ReticleIcon size={22} />,
  '/heroes': <HeroesIcon size={22} />,
  '/builds': <BuildsIcon size={22} />,
  '/matches': <MatchesIcon size={22} />,
  '/analyze': <AnalyzeIcon size={22} />,
}
