'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { ConfidenceBadge } from '@/components/data/ConfidenceBadge'
import { Sparkline } from '@/components/data/Sparkline'
import { TierBadge } from '@/components/data/TierBadge'
import { TrendBadge } from '@/components/data/TrendBadge'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { ButtonLink } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Dialog'
import { ArrowRightIcon } from '@/components/ui/icons'
import { cx } from '@/lib/cx'
import { formatPercent } from '@/lib/format'
import type { MetaHero } from '../model'

/** Serializable subset of MetaHero needed by the panel. */
export type WhyHero = Pick<
  MetaHero,
  'slug' | 'name' | 'iconUrl' | 'tier' | 'sample' | 'winRate' | 'matches' | 'interval' | 'pickRate' | 'trend' | 'history' | 'why'
>

const WhyContext = createContext<((slug: string) => void) | null>(null)

/**
 * "Why?" for selected heroes: one drawer for the whole page, opened by WhyButton.
 * Content is the fact list built in features/meta/model.ts — observed numbers only.
 */
export function WhyProvider({ heroes, scopeText, children }: { heroes: WhyHero[]; scopeText: string; children: ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null)
  const hero = heroes.find((h) => h.slug === selected) ?? null

  return (
    <WhyContext.Provider value={setSelected}>
      {children}
      <Drawer
        side="right"
        open={hero !== null}
        onClose={() => setSelected(null)}
        title={hero ? `${hero.name}: the numbers` : 'Why?'}
        description={scopeText}
      >
        {hero && <WhyContent hero={hero} />}
      </Drawer>
    </WhyContext.Provider>
  )
}

export function WhyButton({ slug, name, className }: { slug: string; name: string; className?: string }) {
  const open = useContext(WhyContext)
  return (
    <button
      type="button"
      onClick={() => open?.(slug)}
      aria-haspopup="dialog"
      aria-label={`Why? Show the numbers behind ${name}`}
      className={cx(
        'inline-flex h-8 items-center rounded-sm border border-border-control px-2.5 font-ui text-xs font-semibold text-primary',
        'transition-colors duration-(--dur-fast) hover:border-primary hover:text-highlight pointer-coarse:h-11',
        className,
      )}
    >
      Why?
    </button>
  )
}

function WhyContent({ hero }: { hero: WhyHero }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <HeroPortrait name={hero.name} src={hero.iconUrl ?? undefined} size="lg" />
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <TierBadge tier={hero.tier} />
            {hero.trend && <TrendBadge direction={hero.trend.direction} delta={hero.trend.delta} comparison="last 7 days vs the 7 before" />}
          </div>
          <ConfidenceBadge sampleSize={hero.matches} interval={hero.interval} />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border">
        <div className="bg-surface-sunken px-4 py-3">
          <dt className="text-eyebrow">Win rate</dt>
          <dd className="font-display text-display-m font-bold text-text tabular">{formatPercent(hero.winRate)}</dd>
        </div>
        <div className="bg-surface-sunken px-4 py-3">
          <dt className="text-eyebrow">Pick rate</dt>
          <dd className="font-display text-display-m font-bold text-text tabular">{formatPercent(hero.pickRate)}</dd>
        </div>
      </dl>

      {hero.history.length > 1 && (
        <figure className="flex flex-col gap-2">
          <figcaption className="text-eyebrow">Daily win rate</figcaption>
          <Sparkline
            values={hero.history}
            baseline={0.5}
            width={320}
            height={64}
            className="w-full"
            summary={`Daily win rate from ${formatPercent(hero.history[0])} to ${formatPercent(hero.history[hero.history.length - 1])}; dashed line is 50%.`}
          />
        </figure>
      )}

      <dl className="flex flex-col gap-4">
        {hero.why.map((fact) => (
          <div key={fact.label} className="border-l-2 border-steel pl-3">
            <dt className="text-eyebrow">{fact.label}</dt>
            <dd className="mt-1 text-sm text-text">{fact.text}</dd>
          </div>
        ))}
      </dl>

      <p className="rounded-sm border border-border bg-surface-sunken px-3 py-2 text-caption text-text-muted">
        These are observed numbers from match data, not explanations of cause. Match data can’t tell us
        why a hero performs this way.
      </p>

      <ButtonLink href={`/heroes/${hero.slug}`} variant="secondary" trailingIcon={<ArrowRightIcon size={16} />}>
        Open hero page
      </ButtonLink>
    </div>
  )
}
