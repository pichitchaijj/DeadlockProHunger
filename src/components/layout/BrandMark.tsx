import { cx } from '@/lib/cx'

/**
 * Logo system (docs/DESIGN.md § Logo). Every logo on the site renders through this component, from the
 * owner's master logo processed by `scripts/brand-assets.mjs` into `public/brand/`. A new master means
 * re-running that script, nothing else.
 *  - `horizontal` (default): mark + wordmark. Header and footer.
 *  - `icon`: the mark only. Tight spaces.
 *  - `primary`: the full logo with its tagline. Brand moments (not used in page chrome).
 * `compact` is the earlier name for `icon`.
 *
 * Local, pre-sized WebP with 1x/2x sources, so next/image adds nothing here. The files carry their own
 * width and height, so the header never shifts while they load.
 */
export type BrandMarkVariant = 'horizontal' | 'icon' | 'primary'

const FILES = {
  // 2095×495 crop → 32px tall at 1x.
  horizontal: { src: '/brand/logo-horizontal.webp', srcSet: '/brand/logo-horizontal.webp 1x, /brand/logo-horizontal@2x.webp 2x', width: 135, height: 32 },
  icon: { src: '/brand/logo-icon.webp', srcSet: '/brand/logo-icon.webp 1x, /brand/logo-icon@2x.webp 2x', width: 64, height: 64 },
  primary: { src: '/brand/logo-primary-640.webp', srcSet: '/brand/logo-primary-640.webp 640w, /brand/logo-primary.webp 960w', width: 960, height: 232 },
} as const

const SIZES: Record<BrandMarkVariant, string> = {
  // Steps down on small phones so the logo + search + menu fit in the header.
  horizontal: 'h-8 w-auto max-sm:h-7 max-[359px]:h-6',
  icon: 'h-8 w-auto',
  primary: 'h-auto w-full max-w-xl',
}

export function BrandMark({
  variant,
  compact = false,
  className,
  boot = false,
  priority = false,
}: {
  variant?: BrandMarkVariant
  compact?: boolean
  className?: string
  /**
   * A single short reveal on first load (off under reduced motion): a power-on fade for the small logo,
   * scale only for `primary`, which must be visible from the first frame (largest paint on Home).
   */
  boot?: boolean
  /** Eager, high-priority load (the Home hero's primary logo is the first thing on screen). */
  priority?: boolean
}) {
  const v: BrandMarkVariant = variant ?? (compact ? 'icon' : 'horizontal')
  const file = FILES[v]
  return (
    // oxlint-disable-next-line nextjs/no-img-element -- pre-optimized local WebP with a 1x/2x srcset; next/image would only add runtime
    <img
      src={file.src}
      srcSet={file.srcSet}
      // Primary is drawn at most 36rem (576px) wide; the browser picks 640w on 1x screens and phones.
      sizes={v === 'primary' ? '(min-width: 640px) 576px, 100vw' : undefined}
      width={file.width}
      height={file.height}
      alt="Deadlockprohunger"
      decoding="async"
      fetchPriority={priority || v === 'horizontal' ? 'high' : undefined}
      className={cx('block select-none', SIZES[v], boot && (v === 'primary' ? 'origin-left animate-logo-reveal' : 'animate-boot-frame'), className)}
    />
  )
}
