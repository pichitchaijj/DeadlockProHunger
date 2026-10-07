'use client'

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { cx } from '@/lib/cx'

type TooltipProps = {
  /** Short supplementary text. Never put information here that isn't available elsewhere. */
  content: ReactNode
  /** A single focusable trigger element, e.g. an IconButton or a <button>. */
  children: ReactElement<{ 'aria-describedby'?: string }>
  side?: 'top' | 'bottom'
  className?: string
}

/**
 * Opens on hover and keyboard focus, closes on Escape, blur or pointer leave.
 * The trigger is described by the tooltip via aria-describedby.
 */
export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const id = useId()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <span
      className={cx('relative inline-flex', className)}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {isValidElement(children) ? cloneElement(children, { 'aria-describedby': id }) : children}
      <span
        id={id}
        role="tooltip"
        className={cx(
          'pointer-events-none absolute left-1/2 z-50 w-max max-w-64 -translate-x-1/2 rounded-sm border border-border-strong',
          'bg-surface-raised px-3 py-2 font-ui text-caption text-text shadow-overlay',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          open ? 'animate-scale-in' : 'hidden',
        )}
      >
        {content}
      </span>
    </span>
  )
}
