import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { WinRate } from '@/components/cards/WinRate'
import { ConfidenceBadge } from '@/components/data/ConfidenceBadge'
import { TrendBadge } from '@/components/data/TrendBadge'
import { HeroImage } from '@/components/game-assets/HeroImage'
import { cx } from '@/lib/cx'
import { formatPercent } from '@/lib/format'
import { capitalize } from '@/features/meta/model'
import type { DirectoryHero } from '../loaders'

/**
 * Directory card. The art is only an identifier (HeroImage, isolated and replaceable);
 * name, role and numbers are always real text, so the card is complete without any artwork.
 */
export function HeroDirectoryCard({ hero, index }: { hero: DirectoryHero; index: number }) {
  const { stats } = hero
  const low = stats?.sample === 'low'
  const t = useTranslations('heroes.list')
  const winRate = useTranslations('cards')('winRate')

  return (
    <Link
      href={`/heroes/${hero.slug}`}
      className="elevate group flex h-full flex-col overflow-hidden rounded-md border border-border bg-surface shadow-card"
    >
      <span className="relative block aspect-[5/4] overflow-hidden border-b border-border">
        <HeroImage name={hero.name} src={hero.cardSrc} width={280} height={380} variant="card" zoomOnHover />
        {/* Legibility gradient + name: the identity is the text, not the art. The solid lower third keeps
            the name and role at ≥ 4.5:1 over bright art at every width (docs/ACCESSIBILITY.md § Contrast). */}
        <span aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-bg from-15% via-bg/75 via-40% to-transparent to-75%" />
        <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-3">
          <span className="font-display text-title font-bold tracking-wide text-text uppercase group-hover:text-highlight">{hero.name}</span>
          <span className="flex items-center gap-2 text-caption text-text-muted">
            {hero.role && <span>{capitalize(hero.role)}</span>}
            {hero.complexity !== null && <ComplexityDots value={hero.complexity} />}
          </span>
        </span>
      </span>

      {stats ? (
        <span className="flex flex-1 flex-col gap-3 p-3">
          <span className="grid grid-cols-2 gap-2">
            <span>
              <span className="block text-caption text-text-muted">{winRate}</span>
              <WinRate value={stats.winRate} muted={low} />
            </span>
            <span>
              <span className="block text-caption text-text-muted">{t('pickRate')}</span>
              <span className={cx('font-ui text-sm font-semibold tabular', low ? 'text-text-muted' : 'text-text')}>{formatPercent(stats.pickRate)}</span>
            </span>
          </span>
          <span className="mt-auto flex flex-wrap items-center gap-1.5">
            {stats.trend && stats.trend.direction !== 'stable' && (
              <span className="animate-scale-in" style={{ animationDelay: `${300 + Math.min(index, 11) * 40}ms` }}>
                <TrendBadge direction={stats.trend.direction} delta={stats.trend.delta} comparison={t('comparison')} />
              </span>
            )}
            <ConfidenceBadge sampleSize={stats.matches} />
          </span>
        </span>
      ) : (
        <span className="flex flex-1 items-center p-3 text-caption text-text-muted">{t('noMatches')}</span>
      )}
    </Link>
  )
}

/** The game's complexity rating (1–4) as filled dots, with a text equivalent. */
export function ComplexityDots({ value }: { value: number }) {
  const t = useTranslations('heroes.list')
  return (
    <span className="inline-flex items-center gap-1" title={t('complexity', { value })}>
      <span aria-hidden="true" className="flex gap-0.5">
        {[1, 2, 3, 4].map((i) => (
          // Inside a pressed (solid cyan) filter chip the diamonds switch to the chip's dark text color.
          <span key={i} className={cx('size-1.5 rotate-45', i <= value ? 'bg-primary [[aria-pressed=true]_&]:bg-on-primary' : 'bg-steel [[aria-pressed=true]_&]:bg-on-primary/30')} />
        ))}
      </span>
      <span className="sr-only">{t('complexityShort', { value })}</span>
    </span>
  )
}
