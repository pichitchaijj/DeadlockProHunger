import Link from 'next/link'
import { sampleTier } from '@/lib/analytics/sampleTier'
import { cx } from '@/lib/cx'
import { cardClasses } from '@/components/ui/Card'
import { formatInteger } from '@/lib/format'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { RankBadge } from '@/components/game-assets/RankBadge'
import { Avatar } from '@/components/ui/Avatar'
import type { RankDisplay } from '@/lib/deadlock/rankAssets'
import { WinRate } from './WinRate'

export type PlayerCardProps = {
  name: string
  href: string
  avatarSrc?: string
  /** Resolved rank (lib/deadlock/rankAssets); null = unranked. */
  rank: RankDisplay | null
  /** Recent-form summary; the containing view states the window. */
  recent?: { matches: number; winRate: number }
  topHeroes?: Array<{ name: string; imageSrc?: string }>
  /** Leaderboard position, when shown in a leaderboard. */
  position?: number
  className?: string
}

export function PlayerCard({
  name,
  href,
  avatarSrc,
  rank,
  recent,
  topHeroes = [],
  position,
  className,
}: PlayerCardProps) {
  return (
    <article
      className={cx(
        cardClasses({ interactive: true }),
        'relative flex items-center gap-4 p-3',
        className,
      )}
    >
      {position !== undefined && (
        <span className="w-8 shrink-0 text-center font-display text-display-m font-bold text-text-muted tabular">
          {position}
        </span>
      )}
      <Avatar name={name} src={avatarSrc} />
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-ui text-sm font-semibold text-text">
          <Link href={href} className="after:absolute after:inset-0 after:rounded-md hover:text-highlight">
            {name}
          </Link>
        </h3>
        <RankBadge rank={rank} className="font-ui text-sm text-text" />
      </div>

      {topHeroes.length > 0 && (
        <ul className="hidden gap-1 sm:flex" aria-label="Most played heroes">
          {topHeroes.slice(0, 3).map((hero) => (
            <li key={hero.name}>
              <HeroPortrait name={hero.name} src={hero.imageSrc} size="sm" />
            </li>
          ))}
        </ul>
      )}

      {recent && (
        <div className="text-right">
          <WinRate value={recent.winRate} muted={sampleTier(recent.matches) === 'low'} showBar={false} />
          <p className="text-caption text-text-muted tabular">{formatInteger(recent.matches)} matches</p>
        </div>
      )}
    </article>
  )
}
