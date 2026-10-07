import { cx } from '@/lib/cx'

type SkeletonProps = {
  /** Size with utility classes so the placeholder matches the final layout (no layout shift). */
  className?: string
  shape?: 'block' | 'text' | 'circle'
}

/** Decorative placeholder. Wrap groups in <LoadingState> for the accessible announcement. */
export function Skeleton({ className, shape = 'block' }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        // The sweep is a transform on ::after (globals.css); reduced motion turns it off there.
        'block bg-surface animate-shimmer',
        shape === 'text' && 'h-4 rounded-xs',
        shape === 'block' && 'rounded-md',
        shape === 'circle' && 'rounded-pill',
        className,
      )}
    />
  )
}
