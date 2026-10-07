'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { cx } from '@/lib/cx'

type InViewProps = {
  children: ReactNode
  className?: string
  as?: 'div' | 'ul' | 'ol' | 'figure' | 'section'
}

/**
 * Plays the CSS animations inside (graph draw, bar growth, item assembly, timeline markers)
 * when the group first scrolls into view, instead of on page load where they'd finish unseen.
 *
 * Server-rendered animations start before hydration, so a below-the-fold group is first
 * restarted (animation: none + reflow) and held paused at frame 0; that happens off-screen.
 * Groups visible at load just keep playing. Without JS or with reduced motion, nothing waits.
 */
export function InView({ children, className, as: Tag = 'div' }: InViewProps) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (el.getBoundingClientRect().top < window.innerHeight) return // visible at load: already playing

    el.dataset.motion = 'reset'
    void el.offsetWidth // reflow so the animations restart from the beginning
    el.dataset.motion = 'paused'

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        delete el.dataset.motion
        observer.disconnect()
      }
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      delete el.dataset.motion
    }
  }, [])

  return (
    <Tag ref={ref as never} className={cx(className)}>
      {children}
    </Tag>
  )
}
