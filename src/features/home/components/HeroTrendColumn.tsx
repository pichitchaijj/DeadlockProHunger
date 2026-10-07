import Link from 'next/link'
import { ConfidenceBadge } from '@/components/data/ConfidenceBadge'
import { Sparkline } from '@/components/data/Sparkline'
import { TrendBadge } from '@/components/data/TrendBadge'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { Reveal } from '@/components/motion/Reveal'
import { cx } from '@/lib/cx'
import { formatPercent } from '@/lib/format'
import type { HeroTrendList } from '../types'

type HeroTrendColumnProps = {
  list: HeroTrendList
  tone: 'primary' | 'orange'
  /** Offsets the stagger so columns reveal one after another. */
  revealOffset?: number
}

/** One trend list (trending / rising / falling): ranked rows that reveal on scroll. */
export function HeroTrendColumn({ list, tone, revealOffset = 0 }: HeroTrendColumnProps) {
  const headingId = `trend-${list.title.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <div className="flex flex-col rounded-md border border-border bg-surface shadow-card">
      <header className="border-b border-border px-(--spacing-card) py-4">
        <h3 id={headingId} className="flex items-center gap-2 font-ui text-title font-semibold text-text">
          <span aria-hidden="true" className={cx('h-4 w-1', tone === 'orange' ? 'bg-orange' : 'bg-primary')} />
          {list.title}
        </h3>
        <p className="mt-1 text-sm text-text-muted">{list.description}</p>
      </header>

      {list.heroes.length === 0 && (
        <p className="px-(--spacing-card) py-6 text-sm text-text-muted">None this week: no hero moved beyond normal week-to-week variation.</p>
      )}
      <ol aria-labelledby={headingId} className="flex flex-col divide-y divide-border">
        {list.heroes.map((hero, i) => (
          <Reveal as="li" key={hero.slug} index={revealOffset + i}>
            <Link
              href={`/heroes/${hero.slug}`}
              className="group flex items-center gap-3 px-(--spacing-card) py-3.5 transition-colors duration-(--dur-fast) hover:bg-surface-raised"
            >
              <span aria-hidden="true" className="w-4 font-display text-lg font-bold text-text-muted tabular">
                {i + 1}
              </span>
              <HeroPortrait name={hero.name} src={hero.imageSrc} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-ui text-sm font-semibold text-text group-hover:text-highlight">
                  {hero.name}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                  <TrendBadge direction={hero.direction} delta={hero.delta} comparison="vs previous 7 days" />
                  <ConfidenceBadge sampleSize={hero.matches} className="max-sm:hidden" />
                </span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <span className="font-ui text-sm font-semibold text-text tabular">
                  <span className="sr-only">{list.metricLabel} </span>
                  {formatPercent(hero.value)}
                </span>
                {hero.history.length > 1 && (
                  <Sparkline
                    values={hero.history}
                    tone={tone}
                    width={64}
                    height={20}
                    summary={`${list.metricLabel} moved from ${formatPercent(hero.history[0])} to ${formatPercent(hero.value)} over the window.`}
                  />
                )}
              </span>
            </Link>
          </Reveal>
        ))}
      </ol>

      <p className="mt-auto border-t border-border px-(--spacing-card) py-2.5 text-caption text-text-muted">
        {list.metricLabel} · change vs previous 7 days
      </p>
    </div>
  )
}
