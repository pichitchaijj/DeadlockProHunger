import Link from 'next/link'
import { sampleTier } from '@/lib/analytics/sampleTier'
import { cx } from '@/lib/cx'
import { cardClasses } from '@/components/ui/Card'
import { formatCompact, formatRelativeTime } from '@/lib/format'
import { ConfidenceBadge } from '@/components/data/ConfidenceBadge'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { WinRate } from './WinRate'

export type BuildCardProps = {
  name: string
  href: string
  heroName: string
  heroImageSrc?: string
  authorName?: string
  /** Unix ms of the build's last update. */
  updatedAt?: number
  tags?: string[]
  weeklyFavorites?: number
  /** `null` when no match data exists for this build yet; we say so instead of hiding it. */
  performance: { winRate: number; matches: number } | null
  className?: string
}

export function BuildCard({
  name,
  href,
  heroName,
  heroImageSrc,
  authorName,
  updatedAt,
  tags = [],
  weeklyFavorites,
  performance,
  className,
}: BuildCardProps) {
  const lowSample = performance ? sampleTier(performance.matches) === 'low' : false

  return (
    <article
      className={cx(
        cardClasses({ interactive: true }),
        'relative flex flex-col gap-3 p-(--spacing-card)',
        className,
      )}
    >
      <header className="flex items-start gap-3">
        <HeroPortrait name={heroName} src={heroImageSrc} size="sm" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-ui text-title font-semibold text-text">
            {/* Stretched link: the whole card is clickable, the title is the accessible name. */}
            <Link href={href} className="after:absolute after:inset-0 after:rounded-md hover:text-highlight">
              {name}
            </Link>
          </h3>
          <p className="truncate text-caption text-text-muted">
            {heroName}
            {authorName && <> · by {authorName}</>}
            {updatedAt !== undefined && <> · updated {formatRelativeTime(updatedAt)}</>}
          </p>
        </div>
      </header>

      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Build tags">
          {tags.map((tag) => (
            <li key={tag} className="rounded-pill border border-border-strong px-2 py-0.5 text-caption text-text-muted">
              {tag}
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-border pt-3">
        {performance ? (
          <div className="flex items-end gap-3">
            <div>
              <p className="text-caption text-text-muted">Win rate</p>
              <WinRate value={performance.winRate} muted={lowSample} />
            </div>
            <ConfidenceBadge sampleSize={performance.matches} />
          </div>
        ) : (
          <p className="text-caption text-text-muted">No match data for this build yet</p>
        )}
        {weeklyFavorites !== undefined && (
          <p className="text-caption text-text-muted tabular">
            {formatCompact(weeklyFavorites)} favorites this week
          </p>
        )}
      </footer>
    </article>
  )
}
