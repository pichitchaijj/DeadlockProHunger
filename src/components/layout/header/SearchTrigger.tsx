'use client'

import { cx } from '@/lib/cx'
import { SearchIcon } from '@/components/ui/icons'
import { useCommandPalette } from '../command/CommandPaletteProvider'

/**
 * Opens the command palette. `field` looks like a search box with the shortcut hint
 * (wide screens); `icon` is a 44px icon button (narrow header).
 */
export function SearchTrigger({ variant = 'field', className }: { variant?: 'field' | 'icon'; className?: string }) {
  const { open, shortcutLabel } = useCommandPalette()

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={open}
        aria-label="Search"
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K"
        className={cx(
          'inline-flex size-11 items-center justify-center rounded-sm text-text-muted hover:bg-surface-raised hover:text-text',
          className,
        )}
      >
        <SearchIcon />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={open}
      aria-haspopup="dialog"
      aria-keyshortcuts="Control+K Meta+K"
      className={cx(
        'group flex h-10 items-center gap-2.5 rounded-sm border border-border-control bg-surface-sunken pr-2 pl-3',
        'font-ui text-sm text-text-muted transition-[border-color,color] duration-(--dur-fast) ease-awaken',
        'hover:border-text-muted hover:text-text',
        className,
      )}
    >
      <SearchIcon size={18} />
      <span className="mr-6">Search</span>
      <kbd className="ml-auto rounded-xs border border-border-strong bg-surface px-1.5 py-0.5 font-ui text-caption text-text-muted group-hover:text-text">
        {shortcutLabel}
      </kbd>
    </button>
  )
}
