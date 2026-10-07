import { cx } from '@/lib/cx'
import type { RankDisplay } from '@/lib/deadlock/rankAssets'
import { RankEmblem, type RankIconSize } from './RankEmblem'

type RankBadgeProps = {
  /** Resolved rank from lib/deadlock/rankAssets (rankFromBadge / rankFromTier). `null` = no rank reported. */
  rank: RankDisplay | null
  /**
   * `compact`: emblem + "Oracle IV" on one line, in the surrounding text style (rows, cards, tables).
   * `full`: larger emblem + name + metal ("Diamond") stacked (profile headers).
   */
  variant?: 'compact' | 'full'
  /** Defaults: compact `sm`, full `lg`. Use `xs` inside running text and filters. */
  size?: RankIconSize
  /** Hide the printed name (tight spaces); the emblem then carries it as alt text. */
  iconOnly?: boolean
  /** Text for no rank. */
  emptyLabel?: string
  className?: string
}

/** Rank identifier: the emblem is the visual, the rank name always stays readable beside it. */
export function RankBadge({ rank, variant = 'compact', size, iconOnly = false, emptyLabel = 'Unranked', className }: RankBadgeProps) {
  const label = rank?.label ?? emptyLabel

  if (iconOnly) return <RankEmblem rank={rank} size={size ?? 'sm'} alt={label} className={className} />

  if (variant === 'full') {
    return (
      <span className={cx('inline-flex items-center gap-3', className)}>
        <RankEmblem rank={rank} size={size ?? 'lg'} alt="" />
        <span className="flex flex-col gap-0.5 leading-tight">
          <span className={cx('font-ui font-semibold', rank ? 'text-text' : 'text-text-muted')}>{label}</span>
          {rank?.metal && (
            <span className="text-caption text-text-muted">
              <span className="sr-only">Tier: </span>
              {rank.metal}
            </span>
          )}
        </span>
      </span>
    )
  }

  return (
    <span className={cx('inline-flex items-center gap-1.5 align-middle whitespace-nowrap', className)}>
      <RankEmblem rank={rank} size={size ?? 'sm'} alt="" />
      <span className={cx(!rank && 'text-text-muted')}>{label}</span>
    </span>
  )
}

/** A rank band's first and last tier emblems ("Initiate – Sentinel"), decorative: the band name is printed beside it. */
export function RankBandIcons({ ranks, size = 'xs', className }: { ranks: [RankDisplay, RankDisplay] | null; size?: RankIconSize; className?: string }) {
  if (!ranks) return null
  return (
    <span aria-hidden="true" className={cx('inline-flex items-center -space-x-1', className)}>
      <RankEmblem rank={ranks[0]} size={size} alt="" />
      {ranks[1].tier !== ranks[0].tier && <RankEmblem rank={ranks[1]} size={size} alt="" />}
    </span>
  )
}
