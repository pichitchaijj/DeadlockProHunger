import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { sampleTier } from '@/lib/analytics/sampleTier'
import { cx } from '@/lib/cx'
import { cardClasses } from '@/components/ui/Card'
import { ConfidenceBadge } from '@/components/data/ConfidenceBadge'
import { TrendBadge, type TrendDirection } from '@/components/data/TrendBadge'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { WinRate } from './WinRate'

export type HeroCardProps = {
  name: string
  href: string
  imageSrc?: string
  /** Optional role/playstyle line from hero metadata. */
  subtitle?: string
  stats?: {
    winRate: number
    /** Matches behind the win rate. The grid that holds the cards shows the shared ScopeLine. */
    matches: number
    trend?: { direction: TrendDirection; delta?: number }
  }
  className?: string
}

/** Hero tile for grids and lists. The whole card is one link. */
export function HeroCard({ name, href, imageSrc, subtitle, stats, className }: HeroCardProps) {
  const lowSample = stats ? sampleTier(stats.matches) === 'low' : false
  const t = useTranslations('cards')

  return (
    <Link
      href={href}
      className={cx(
        cardClasses({ interactive: true }),
        'group flex items-center gap-4 p-3',
        className,
      )}
    >
      <HeroPortrait name={name} src={imageSrc} size="md" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-title font-bold uppercase tracking-wide text-text group-hover:text-highlight">
          {name}
        </span>
        {subtitle && <span className="block truncate text-caption text-text-muted">{subtitle}</span>}
        {stats && (
          <span className="mt-1.5 flex flex-wrap items-center gap-2">
            <ConfidenceBadge sampleSize={stats.matches} />
            {stats.trend && !lowSample && <TrendBadge {...stats.trend} />}
          </span>
        )}
      </span>
      {stats && (
        <span className="text-right">
          <span className="sr-only">{t('winRate')} </span>
          <WinRate value={stats.winRate} muted={lowSample} />
        </span>
      )}
    </Link>
  )
}
