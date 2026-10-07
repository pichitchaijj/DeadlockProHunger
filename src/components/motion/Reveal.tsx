'use client'

import { useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'
import { cx } from '@/lib/cx'

type RevealProps = {
  children: ReactNode
  /** Position in a staggered group (0-based). Stagger is capped at 12 items in CSS. */
  index?: number
  className?: string
  as?: 'div' | 'li' | 'section' | 'article'
  /** `section`: whole page sections travel 20px; items (default) travel 8px. */
  variant?: 'item' | 'section'
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>

/**
 * "Data awakening" entrance: fade + rise (8px items, 20px sections).
 * Content in view on load animates from server-rendered CSS (works without JS).
 * Content below the fold waits until it scrolls into view.
 * Never wrap tables or table rows.
 */
export function Reveal({ children, index = 0, className, as: Tag = 'div', variant = 'item', ...rest }: RevealProps) {
  const ref = useRef<HTMLElement>(null)
  const [state, setState] = useState<'initial' | 'hidden' | 'shown'>('initial')

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (el.getBoundingClientRect().top < window.innerHeight) return // already seen on load

    setState('hidden')
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState('shown')
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <Tag
      {...rest}
      ref={ref as never}
      data-reveal-variant={variant === 'section' ? 'section' : undefined}
      data-reveal={state === 'hidden' ? 'hidden' : state === 'shown' ? 'shown' : ''}
      style={{ '--reveal-index': index } as CSSProperties}
      className={cx(className)}
    >
      {children}
    </Tag>
  )
}
