import { cx } from '@/lib/cx'
import { gameAssetsEnabled } from './assets'

const NUMERALS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'] as const

type RankBadgeProps = {
  /** Tier name from /v1/assets/ranks, e.g. "Ascendant". `null` = no rank reported. */
  tierName: string | null
  /** 1–6; 0 or undefined for none. */
  subrank?: number
  /** Image URL (assets API) or our proxied rank image route. */
  src?: string
  size?: 'sm' | 'md'
  className?: string
}

/** Rank identifier: badge image when allowed, always with the rank in text. */
export function RankBadge({ tierName, subrank, src, size = 'md', className }: RankBadgeProps) {
  const label = tierName ? `${tierName}${subrank ? ` ${NUMERALS[subrank]}` : ''}` : 'Unranked'
  const px = size === 'sm' ? 20 : 28

  return (
    <span className={cx('inline-flex items-center gap-1.5 font-ui text-sm text-text whitespace-nowrap', className)}>
      {gameAssetsEnabled && src && tierName ? (
        // oxlint-disable-next-line nextjs/no-img-element -- remote hosts get next/image config in P2
        <img src={src} alt="" width={px} height={px} loading="lazy" decoding="async" />
      ) : (
        <span
          aria-hidden="true"
          className="inline-flex items-center justify-center rounded-xs border border-border-control font-display text-xs font-bold text-text-muted"
          style={{ width: px, height: px }}
        >
          {subrank ? NUMERALS[subrank] : '–'}
        </span>
      )}
      <span className={cx(!tierName && 'text-text-muted')}>{label}</span>
    </span>
  )
}
