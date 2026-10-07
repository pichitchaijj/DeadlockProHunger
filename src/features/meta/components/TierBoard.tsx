import Link from 'next/link'
import { TierBadge } from '@/components/data/TierBadge'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { Reveal } from '@/components/motion/Reveal'
import { TIER_ORDER, TIER_RULES } from '@/lib/analytics/tiers'
import { formatPercent } from '@/lib/format'
import type { MetaModel } from '../model'

/**
 * Tier list: one full-width row per tier (S → C), revealed in sequence.
 * Rows stay balanced however unevenly heroes are distributed across tiers.
 * Heroes inside a row are ordered by interval lower bound.
 */
export function TierBoard({ tiers }: { tiers: MetaModel['tiers'] }) {
  return (
    <ol className="flex flex-col overflow-hidden rounded-md border border-border bg-border [&>*+*]:mt-px">
      {TIER_ORDER.map((tier, i) => (
        <Reveal as="li" key={tier} index={i} className="grid bg-surface sm:grid-cols-[11rem_1fr]">
          <div className="flex items-center gap-3 border-b border-border bg-surface-sunken px-4 py-3 sm:border-r sm:border-b-0">
            <TierBadge tier={tier} size="lg" />
            <div>
              <p className="font-ui text-sm font-semibold text-text">
                {tiers[tier].length} {tiers[tier].length === 1 ? 'hero' : 'heroes'}
              </p>
              <p className="text-caption text-text-muted">{TIER_RULES[tier]}</p>
            </div>
          </div>
          {tiers[tier].length === 0 ? (
            <p className="self-center px-4 py-4 text-sm text-text-muted">No heroes in this tier for this scope.</p>
          ) : (
            <ul aria-label={`Tier ${tier} heroes`} className="flex flex-wrap content-start gap-2 p-3">
              {tiers[tier].map((hero) => (
                <li key={hero.id}>
                  <Link
                    href={`/heroes/${hero.slug}`}
                    className="flex items-center gap-2 rounded-sm border border-border bg-surface-sunken py-1 pr-2.5 pl-1 transition-colors duration-(--dur-fast) hover:border-border-control hover:bg-surface-raised"
                  >
                    <HeroPortrait name={hero.name} src={hero.iconUrl ?? undefined} size="sm" />
                    <span className="font-ui text-xs font-semibold text-text">{hero.name}</span>
                    <span className="font-ui text-xs text-text-muted tabular">
                      <span className="sr-only">win rate </span>
                      {formatPercent(hero.winRate)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Reveal>
      ))}
    </ol>
  )
}
