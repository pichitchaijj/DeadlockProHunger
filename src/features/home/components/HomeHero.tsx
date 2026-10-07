import { useTranslations } from 'next-intl'
import type { CSSProperties, ReactNode } from 'react'
import { BrandMark } from '@/components/layout/BrandMark'
import { CountUp } from '@/components/motion/CountUp'
import { ButtonLink } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { ArrowRightIcon, HeroesIcon, MatchesIcon, PlayersIcon, TrendsIcon } from '@/components/ui/icons'
import { cx } from '@/lib/cx'
import type { HomeSource, HomeSummary } from '../types'
import { HeroBackdrop } from './HeroBackdrop'

/** The brand statement, one line each (`home.hero.headline.<key>`); the last line carries the accent. */
const HEADLINE = ['play', 'learn', 'analyze', 'improve', 'together'] as const

/**
 * Logo reveal, then the brand statement (staggered), CTAs and a streamed stats strip: the storyboard's
 * opening sequence, built from CSS animations that reduced motion turns into final states. The stagger
 * stays short (everything visible by ~0.7s) because the statement and paragraph are the page's LCP.
 */
export function HomeHero({ stats }: { stats: ReactNode }) {
  const t = useTranslations('home.hero')
  return (
    <section aria-labelledby="home-hero-title" className="relative isolate overflow-hidden border-b border-border">
      <HeroBackdrop />

      <div className="page-container relative flex flex-col gap-10 pt-16 pb-14 sm:pt-20 lg:pt-28 lg:pb-20">
        <div className="flex max-w-3xl flex-col gap-6">
          {/* Logo reveal: a short power-on fade/scale, then the rest follows. */}
          <BrandMark variant="primary" priority boot className="max-w-md" />

          <p className="text-tagline animate-awaken" style={{ animationDelay: '60ms' }}>
            <span className="text-primary">●</span> {t('tagline')}
          </p>

          {/* Brand statement: stacked, forward-leaning caps; the last line carries the accent. */}
          <h1 id="home-hero-title" className="type-slant text-display-xl leading-[0.9] text-text">
            {HEADLINE.map((word, i) => (
              <span
                key={word}
                className={cx('block animate-awaken', i === HEADLINE.length - 1 && 'text-primary')}
                style={{ animationDelay: `${80 + i * 50}ms` } as CSSProperties}
              >
                {t(`headline.${word}`)}
              </span>
            ))}
          </h1>

          <p
            className="max-w-xl text-lg text-text-muted animate-awaken sm:text-xl"
            style={{ animationDelay: '220ms' }}
          >
            {t('intro')}
          </p>

          <div className="flex flex-wrap gap-3 animate-awaken" style={{ animationDelay: '300ms' }}>
            <ButtonLink href="/meta" trailingIcon={<ArrowRightIcon size={18} />}>
              {t('exploreMeta')}
            </ButtonLink>
            <ButtonLink href="/heroes" variant="secondary">
              {t('viewHeroes')}
            </ButtonLink>
          </div>
        </div>

        <div className="animate-awaken" style={{ animationDelay: '380ms' }}>
          {stats}
        </div>
      </div>
    </section>
  )
}

function SummaryStat({ label, icon, children, note }: { label: string; icon: ReactNode; children: ReactNode; note?: string }) {
  return (
    <div className="flex flex-col justify-between gap-2 bg-surface/90 px-4 py-4 backdrop-blur-sm sm:px-5">
      <dt className="flex items-center gap-2 text-eyebrow">
        <span aria-hidden="true" className="text-primary">
          {icon}
        </span>
        {label}
      </dt>
      <dd className="flex min-h-10 flex-col justify-end">
        <span className="font-display text-heading-xl font-bold text-text tabular">{children}</span>
        {note && <span className="text-caption text-text-muted">{note}</span>}
      </dd>
    </div>
  )
}

/**
 * Four headline numbers (live data). Heroes and matches come from the Meta model (scope stated);
 * the last two are the data source's own counters, labelled as such. The layout matches
 * HeroStatsSkeleton so streaming causes no shift.
 */
export function HeroStats({ summary, source, footer }: { summary: HomeSummary; source: HomeSource | null; footer?: ReactNode }) {
  const t = useTranslations('home.stats')
  return (
    <>
      <dl className="grid max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border lg:grid-cols-4">
        <SummaryStat label={t('heroes')} icon={<HeroesIcon size={18} />} note={t('heroesNote', { count: summary.heroesTracked })}>
          <CountUp value={summary.heroesTotal} format="integer" durationMs={800} />
        </SummaryStat>
        <SummaryStat label={t('matches')} icon={<MatchesIcon size={18} />} note={summary.dataScopeLabel}>
          <CountUp value={summary.matchesAnalyzed} format="compact" durationMs={800} />
        </SummaryStat>
        <SummaryStat label={t('newMatches')} icon={<TrendsIcon size={18} />} note={t('newMatchesNote')}>
          {source ? <CountUp value={source.matchesPerDay} format="compact" durationMs={800} /> : <span className="text-text-muted">—</span>}
        </SummaryStat>
        <SummaryStat label={t('profiles')} icon={<PlayersIcon size={18} />} note={t('profilesNote')}>
          {source?.playerProfiles ? <CountUp value={source.playerProfiles} format="compact" durationMs={800} /> : <span className="text-text-muted">—</span>}
        </SummaryStat>
      </dl>
      {footer && <div className="mt-3">{footer}</div>}
    </>
  )
}

const SKELETON_LABELS = ['heroes', 'matches', 'newMatches', 'profiles'] as const

export function HeroStatsSkeleton() {
  const t = useTranslations('home.stats')
  return (
    <div aria-hidden="true" className="grid max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border lg:grid-cols-4">
      {SKELETON_LABELS.map((label) => (
        <div key={label} className="flex flex-col justify-between gap-2 bg-surface/90 px-4 py-4 sm:px-5">
          <span className="text-eyebrow">{t(label)}</span>
          <Skeleton className="h-14" />
        </div>
      ))}
    </div>
  )
}
