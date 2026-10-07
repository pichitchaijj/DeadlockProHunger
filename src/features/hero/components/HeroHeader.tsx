import Link from 'next/link'
import type { ReactNode } from 'react'
import { ConfidenceBadge } from '@/components/data/ConfidenceBadge'
import { InsightCard } from '@/components/data/InsightCard'
import { ScopeLine } from '@/components/data/ScopeLine'
import { TierBadge } from '@/components/data/TierBadge'
import { TrendBadge } from '@/components/data/TrendBadge'
import { HeroImage } from '@/components/game-assets/HeroImage'
import { CountUp } from '@/components/motion/CountUp'
import { Reveal } from '@/components/motion/Reveal'
import { Filter } from '@/components/ui/Filter'
import { ArrowRightIcon } from '@/components/ui/icons'
import type { Insight } from '@/lib/analytics/insights'
import { RANK_BANDS } from '@/lib/analytics/rankBands'
import { cx } from '@/lib/cx'
import { capitalize } from '@/features/meta/model'
import { ComplexityDots } from '@/features/heroes/components/HeroDirectoryCard'
import type { HeroContext } from '../loaders'
import { HERO_TABS, heroHref, type HeroQuery } from '../query'

const WINDOWS = [
  ['patch', 'Current patch'],
  ['7d', '7 days'],
  ['30d', '30 days'],
] as const

/** Identity + headline stats + scope. The intro fades in as one unit (no cinematic effects). */
export function HeroHeader({ ctx, query }: { ctx: HeroContext; query: HeroQuery }) {
  const { hero, stats } = ctx
  return (
    <section aria-labelledby="hero-name" className="grid animate-awaken gap-6 lg:grid-cols-[13rem_1fr] lg:gap-8">
      <div className="relative mx-auto aspect-[280/380] w-40 overflow-hidden rounded-md border border-border shadow-raised lg:w-full">
        <HeroImage name={hero.name} src={hero.cardSrc} width={280} height={380} variant="card" />
        <span aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-bg/70 via-transparent to-transparent" />
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <div>
          <p className="text-eyebrow">
            <Link href="/heroes" className="hover:text-text pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center">Heroes</Link> <span aria-hidden="true">/</span> {hero.name}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 id="hero-name" className="font-display text-display-l font-extrabold text-text uppercase">
              {hero.name}
            </h1>
            {stats && <TierBadge tier={stats.tier} size="lg" />}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-text-muted">
            {hero.role && <span>{capitalize(hero.role)}</span>}
            {hero.complexity !== null && <ComplexityDots value={hero.complexity} />}
          </p>
        </div>

        {stats ? (
          <>
            <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border lg:max-w-2xl">
              <Stat label="Win rate">
                <CountUp value={stats.winRate} format="percent" />
              </Stat>
              <Stat label="Pick rate">
                <CountUp value={stats.pickRate} format="percent" />
              </Stat>
              <Stat label="Matches">
                <CountUp value={stats.matches} format="compact" />
              </Stat>
            </dl>
            <div className="flex flex-wrap items-center gap-2">
              {stats.trend ? (
                <TrendBadge direction={stats.trend.direction} delta={stats.trend.delta} comparison="last 7 days vs the 7 before" pulse />
              ) : (
                <span className="text-caption text-text-muted">Trend: not enough data for both weeks</span>
              )}
              <ConfidenceBadge sampleSize={stats.matches} interval={stats.interval} />
            </div>
          </>
        ) : (
          <p className="text-sm text-text-muted">No matches for this hero in the selected scope.</p>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Filter
            label="Patch / time"
            value={query.window}
            options={WINDOWS.map(([value, label]) => ({ value, label, href: heroHref(hero.slug, query, { window: value }) }))}
          />
          <Filter
            label="Rank (match average)"
            value={query.rank}
            options={RANK_BANDS.map((b) => ({ value: b.id, label: ctx.scope.rankLabels[b.id], href: heroHref(hero.slug, query, { rank: b.id }) }))}
          />
        </div>
        <ScopeLine scope={ctx.statScope} />
      </div>
    </section>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 bg-surface px-4 py-3">
      <dt className="text-eyebrow">{label}</dt>
      <dd className="font-display text-display-m font-bold text-text tabular">{children}</dd>
    </div>
  )
}

/**
 * "What the data says": Insight Engine results. Each card states one measured result and opens
 * a "Why?" with its numbers and rule. With none passing their rules, the section says so.
 */
export function InsightGrid({ heroName, tier, insights }: { heroName: string; tier: string | null; insights: Insight[] }) {
  const strong = tier === 'S' || tier === 'A'
  return (
    <section aria-labelledby="why-title" className="flex flex-col gap-4">
      <div>
        <h2 id="why-title" className="font-display text-display-m font-bold text-text uppercase">
          {strong ? `Why is ${heroName} strong?` : `What the data says about ${heroName}`}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-text-muted">
          Measured results from public match data. Each shows only when it passes its rule; open “Why?” for the numbers behind it.
          {strong ? ' They show where the wins come from, not why the hero is designed that way.' : ''}
        </p>
      </div>
      {insights.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {insights.map((insight, i) => (
            <Reveal as="li" key={insight.id} index={i}>
              <InsightCard insight={insight} />
            </Reveal>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-border bg-surface p-4 text-sm text-text-muted">
          No result clears its sample and confidence rules in this scope yet. Try a longer window or a broader rank band.
        </p>
      )}
    </section>
  )
}

/** Section navigation. Each tab is a URL, so only the open tab's data is loaded. */
export function HeroTabs({ slug, query }: { slug: string; query: HeroQuery }) {
  return (
    <nav aria-label="Hero sections" className="sticky top-16 z-30 -mx-(--spacing-gutter) border-b border-border bg-bg/90 px-(--spacing-gutter) backdrop-blur-md">
      <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
        {HERO_TABS.map(([tab, label]) => {
          const active = query.tab === tab
          return (
            <li key={tab} className="shrink-0">
              <Link
                href={heroHref(slug, query, { tab })}
                scroll={false}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'relative flex h-12 items-center px-4 font-display text-[0.95rem] font-semibold tracking-[0.08em] uppercase transition-colors duration-(--dur-fast)',
                  active ? 'text-text' : 'text-text-muted hover:text-text',
                )}
              >
                {label}
                <span aria-hidden="true" className={cx('absolute inset-x-3 bottom-0 h-0.5 bg-primary transition-opacity', active ? 'opacity-100' : 'opacity-0')} />
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export function SeeMore({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} scroll={false} className="inline-flex items-center gap-1.5 font-ui text-sm font-semibold text-primary hover:text-highlight pointer-coarse:min-h-11">
      {children} <ArrowRightIcon size={16} />
    </Link>
  )
}
