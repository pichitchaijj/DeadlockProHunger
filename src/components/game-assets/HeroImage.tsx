'use client'

import { useEffect, useRef, useState } from 'react'
import { cx } from '@/lib/cx'
import { gameAssetsEnabled, monogram } from './assets'

type HeroImageProps = {
  /** Hero name: used as alt text and for the fallback monogram. */
  name: string
  /** Asset URL from /v1/assets/heroes. Optional: the fallback is a complete design on its own. */
  src?: string | null
  /** Intrinsic pixel size of the source, for layout stability. */
  width: number
  height: number
  /** `icon` = square identifier; `card` = portrait tile that fills its container. */
  variant?: 'icon' | 'card'
  /** Scale the art slightly when an ancestor with `group` is hovered. */
  zoomOnHover?: boolean
  /**
   * The name is already printed next to the image (a labelled row or button): use alt="" so screen
   * readers don't say it twice (docs/ACCESSIBILITY.md § Images). Standalone images keep the name.
   */
  decorative?: boolean
  className?: string
}

/**
 * The only component that renders hero artwork (docs/ARCHITECTURE.md § IP/asset isolation).
 * Game art is a data identifier here, never branding. Renders an original fallback when:
 *  - NEXT_PUBLIC_GAME_ASSETS=off (kill switch),
 *  - no URL is available, or
 *  - the remote asset fails to load.
 * The fallback has the same box, so layouts never shift.
 */
export function HeroImage({ name, src, width, height, variant = 'icon', zoomOnHover = false, decorative = false, className }: HeroImageProps) {
  const [failed, setFailed] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  // A server-rendered <img> can fail before hydration attaches onError; check its state on mount.
  useEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth === 0) setFailed(true)
  }, [src])
  const showImage = gameAssetsEnabled && Boolean(src) && !failed

  return (
    <span
      className={cx(
        'relative isolate block overflow-hidden bg-surface-sunken',
        variant === 'card' ? 'size-full' : 'shrink-0',
        className,
      )}
      style={variant === 'icon' ? { width, height } : undefined}
    >
      {showImage ? (
        // oxlint-disable-next-line nextjs/no-img-element -- remote asset host, isolated here; next/image config arrives with P2 data wiring
        <img
          ref={imgRef}
          src={src!}
          alt={decorative ? '' : name}
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className={cx(
            'size-full object-cover',
            variant === 'card' && 'object-top',
            zoomOnHover && 'transition-transform duration-(--dur-medium) ease-awaken group-hover:scale-[1.04] motion-reduce:transform-none',
          )}
        />
      ) : (
        <HeroFallback name={name} variant={variant} decorative={decorative} />
      )}
    </span>
  )
}

/** Original, asset-free identifier: tactical grid, diagonal cut and a monogram. */
function HeroFallback({ name, variant, decorative }: { name: string; variant: 'icon' | 'card'; decorative: boolean }) {
  return (
    <span {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': name })} className="bg-tactical-grid absolute inset-0 flex items-center justify-center">
      {variant === 'card' && (
        <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(135deg,transparent_45%,color-mix(in_srgb,var(--color-primary)_8%,transparent)_45%,color-mix(in_srgb,var(--color-primary)_8%,transparent)_55%,transparent_55%)]" />
      )}
      <span
        aria-hidden="true"
        className={cx(
          'relative font-display font-bold tracking-wide text-text', // the visible identifier when art is missing: full-contrast text
          variant === 'card' && 'text-5xl', // icons inherit size from their frame
        )}
      >
        {monogram(name)}
      </span>
    </span>
  )
}
