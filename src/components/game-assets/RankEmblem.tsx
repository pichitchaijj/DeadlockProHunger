'use client'

import { useEffect, useRef, useState } from 'react'
import { cx } from '@/lib/cx'
import type { RankDisplay } from '@/lib/deadlock/rankAssets'
import { gameAssetsEnabled } from './assets'

/** One size scale for rank emblems everywhere: xs filters and inline text, sm rows/cards/tables, md panels, lg profile headers. */
export const RANK_ICON_PX = { xs: 16, sm: 20, md: 28, lg: 48 } as const
export type RankIconSize = keyof typeof RANK_ICON_PX

const NUMERALS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'] as const

type RankEmblemProps = {
  /** Resolved rank (lib/deadlock/rankAssets); null = no rank. */
  rank: RankDisplay | null
  size?: RankIconSize
  /** Accessible name. Pass '' when the rank is printed beside the emblem (docs/ACCESSIBILITY.md § Images). */
  alt: string
  className?: string
}

/**
 * The only component that renders rank emblem art (docs/ARCHITECTURE.md § IP/asset isolation).
 * Emblems aren't square, so they sit centred in a square box: every size lines up in rows.
 * Renders an original fallback (shield outline + subrank numeral) when assets are off, the rank has
 * no emblem, or the image fails to load (including before hydration). Same box either way.
 */
export function RankEmblem({ rank, size = 'sm', alt, className }: RankEmblemProps) {
  const px = RANK_ICON_PX[size]
  const src = rank?.src ?? null
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  // A server-rendered <img> can fail before hydration attaches onError; check its state on mount.
  useEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth === 0) setFailedSrc(src)
  }, [src])
  const showImage = gameAssetsEnabled && src !== null && failedSrc !== src

  return (
    <span className={cx('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: px, height: px }}>
      {showImage ? (
        // oxlint-disable-next-line nextjs/no-img-element -- remote asset host, isolated here like HeroImage
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          width={px}
          height={px}
          loading="lazy"
          decoding="async"
          onError={() => setFailedSrc(src)}
          className="size-full object-contain"
        />
      ) : (
        <RankFallback rank={rank} px={px} alt={alt} />
      )}
    </span>
  )
}

/** Original, asset-free emblem: a steel shield outline with the subrank numeral (or tier initial). */
function RankFallback({ rank, px, alt }: { rank: RankDisplay | null; px: number; alt: string }) {
  const mark = !rank ? '–' : rank.subrank ? NUMERALS[rank.subrank] : rank.name.slice(0, 1).toUpperCase()
  return (
    <span
      {...(alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true })}
      data-rank-fallback=""
      className="absolute inset-0 flex items-center justify-center text-steel"
    >
      <svg viewBox="0 0 20 20" className="absolute inset-0 size-full" aria-hidden="true">
        <path d="M10 1.5 17 4.5v5.2c0 4.2-2.9 7.3-7 8.8-4.1-1.5-7-4.6-7-8.8V4.5z" fill="var(--color-surface-sunken)" stroke="currentColor" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
      </svg>
      {px >= 20 && (
        <span aria-hidden="true" className={cx('relative font-display leading-none font-bold text-text-muted', px >= 40 ? 'text-sm' : 'text-[0.625rem]')}>
          {mark}
        </span>
      )}
    </span>
  )
}
