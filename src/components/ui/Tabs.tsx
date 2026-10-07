'use client'

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from '@/lib/cx'

export type TabItem = {
  value: string
  label: ReactNode
  content: ReactNode
}

type TabsProps = {
  items: TabItem[]
  /** Accessible name for the tab list, e.g. "Hero sections". */
  label: string
  defaultValue?: string
  /** Controlled value (e.g. synced to a `?tab=` search param by the caller). */
  value?: string
  onValueChange?: (value: string) => void
  className?: string
}

/**
 * WAI-ARIA tabs with automatic activation:
 * ←/→ move between tabs, Home/End jump to the first/last tab.
 */
export function Tabs({ items, label, defaultValue, value, onValueChange, className }: TabsProps) {
  const baseId = useId()
  const [internal, setInternal] = useState(defaultValue ?? items[0]?.value)
  const active = value ?? internal
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  function select(next: string) {
    if (value === undefined) setInternal(next)
    onValueChange?.(next)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = items.findIndex((item) => item.value === active)
    const last = items.length - 1
    const target =
      event.key === 'ArrowRight'
        ? index === last ? 0 : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0 ? last : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
    if (target === null) return
    event.preventDefault()
    select(items[target].value)
    tabRefs.current[target]?.focus()
  }

  return (
    <div className={className}>
      {/* oxlint-disable-next-line jsx-a11y/interactive-supports-focus -- APG: tabs are focusable, not the tablist */}
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]"
      >
        {items.map((item, i) => {
          const selected = item.value === active
          return (
            <button
              key={item.value}
              ref={(el) => {
                tabRefs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.value}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.value}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(item.value)}
              className={cx(
                'relative -mb-px h-11 shrink-0 px-4 font-ui text-sm font-medium whitespace-nowrap',
                'border-b-2 transition-colors duration-(--dur-fast) ease-awaken',
                selected
                  ? 'border-primary text-text'
                  : 'border-transparent text-text-muted hover:text-text',
              )}
            >
              {item.label}
            </button>
          )
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.value}
          role="tabpanel"
          id={`${baseId}-panel-${item.value}`}
          aria-labelledby={`${baseId}-tab-${item.value}`}
          hidden={item.value !== active}
          tabIndex={0}
          className="pt-6 focus-visible:outline-offset-4"
        >
          {item.value === active && <div className="animate-awaken">{item.content}</div>}
        </div>
      ))}
    </div>
  )
}
