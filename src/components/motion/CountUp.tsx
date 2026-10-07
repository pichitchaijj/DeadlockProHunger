'use client'

import { useEffect, useRef, useState } from 'react'
import { cx } from '@/lib/cx'
import { formatCompact, formatDuration, formatInteger, formatPercent } from '@/lib/format'

export type CountUpFormat = 'integer' | 'compact' | 'percent' | 'duration'

const formatters: Record<CountUpFormat, (value: number) => string> = {
  integer: (v) => formatInteger(v),
  compact: (v) => formatCompact(v),
  percent: (v) => formatPercent(v),
  duration: (v) => formatDuration(v), // seconds → m:ss
}

type CountUpProps = {
  value: number
  /** Named formatter (functions can't be passed from server components). `percent` expects a ratio. */
  format: CountUpFormat
  /** Defaults to the SLOW token (650ms). */
  durationMs?: number
  className?: string
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

/** Content visible at mount only counts up if the page has just loaded (avoids a final → 0 flash later). */
const FRESH_LOAD_MS = 1500

/**
 * Counts from 0 to `value` when first seen: on a fresh page load, or when scrolled into view.
 * The final value is rendered on the server and announced to screen readers;
 * the animated digits are aria-hidden. Use tabular figures to avoid width jitter.
 * Disabled for prefers-reduced-motion.
 */
export function CountUp({ value, format, durationMs = 650, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const toText = formatters[format]
  const [display, setDisplay] = useState(value)

  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const visibleAtMount = el.getBoundingClientRect().top < window.innerHeight
    if (visibleAtMount && performance.now() > FRESH_LOAD_MS) return // keep the server-rendered value
    let frame = 0
    let settle = 0

    const run = () => {
      let start: number | undefined
      const tick = (now: number) => {
        start ??= now // first frame defines t = 0, so progress is never negative
        const t = Math.min(1, Math.max(0, (now - start) / durationMs))
        setDisplay(value * easeOut(t))
        if (t < 1) frame = requestAnimationFrame(tick)
      }
      setDisplay(0)
      frame = requestAnimationFrame(tick)
      // Never leave a wrong number on screen: settle on the real value even if frames stall
      // (background tabs, throttled devices).
      settle = window.setTimeout(() => setDisplay(value), durationMs + 150)
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        run()
        observer.disconnect()
      }
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      clearTimeout(settle)
    }
  }, [value, durationMs])

  return (
    // The final value sits invisibly in the same grid cell, so the box keeps its final width
    // while digits count up: no layout shift.
    <span ref={ref} className={cx('inline-grid', className)}>
      <span aria-hidden="true" className="invisible col-start-1 row-start-1 tabular">
        {toText(value)}
      </span>
      <span aria-hidden="true" className="col-start-1 row-start-1 text-right tabular">
        {toText(display)}
      </span>
      <span className="sr-only">{toText(value)}</span>
    </span>
  )
}
