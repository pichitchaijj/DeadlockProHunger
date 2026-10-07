import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { Reveal } from '@/components/motion/Reveal'
import { ScrollRegion } from '@/components/ui/ScrollRegion'
import { formatInteger } from '@/lib/format'
import type { liveSummary } from '../model'

type Live = ReturnType<typeof liveSummary>

/**
 * Live indicator from the game's watch tab. Calm by design: one soft status ring,
 * plain numbers, no flashing. Only shown when the source responds.
 */
export function LiveStrip({ live }: { live: Live }) {
  return (
    <section aria-labelledby="live-title" className="flex flex-col gap-4 rounded-md border border-border bg-surface/60 p-(--spacing-card)">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="live-title" className="flex items-center gap-3 font-ui text-title font-semibold text-text">
          <span aria-hidden="true" className="relative inline-flex size-2.5 rounded-pill bg-primary animate-live-pulse" />
          Live now
        </h2>
        <p className="text-sm text-text-muted">
          <span className="font-semibold text-text tabular">{formatInteger(live.total)}</span> normal-mode matches in the in-game watch tab ({formatInteger(live.ranked)} ranked)
        </p>
      </div>
      {/* Phones: a swipeable row (one card tall) so search and filters stay near the top. It scrolls in a
          focusable region so keyboard users can scroll it too (docs/ACCESSIBILITY.md § Keyboard). */}
      {live.featured.length > 0 && (
        <ScrollRegion label="Live matches, swipe or use arrow keys" className="-mx-(--spacing-card) snap-x snap-mandatory px-(--spacing-card) pb-1 sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
          <ul aria-label="Live matches" className="flex gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-4">
            {live.featured.map((m, i) => (
              <Reveal as="li" key={m.id} index={i} className="flex w-[85%] shrink-0 snap-start flex-col gap-2 rounded-sm border border-border bg-surface-sunken p-3 sm:w-auto">
                <p className="flex items-center justify-between gap-2 text-caption text-text-muted">
                  <span>
                    {m.ranked ? 'Ranked' : 'Unranked'} · {m.minutes !== null ? `${m.minutes} min in` : 'In progress'}
                  </span>
                  <span className="tabular">{formatInteger(m.spectators)} watching</span>
                </p>
                {m.heroes.map((team, t) => (
                  <ul key={t} className="flex gap-1" aria-label={`Team ${t + 1} heroes`}>
                    {team.map((h, k) => (
                      <li key={`${h.id}-${k}`}>
                        <HeroPortrait name={h.name} src={h.iconUrl ?? undefined} size="sm" />
                      </li>
                    ))}
                  </ul>
                ))}
                {m.team1Share !== null && (
                  <div className="flex flex-col gap-1">
                    <span aria-hidden="true" className="flex h-1.5 overflow-hidden rounded-pill bg-steel">
                      <span className="bg-primary" style={{ width: `${m.team1Share * 100}%` }} />
                    </span>
                    <span className="text-caption text-text-muted">
                      Souls: Team 1 {Math.round(m.team1Share * 100)}% · Team 2 {100 - Math.round(m.team1Share * 100)}%
                    </span>
                  </div>
                )}
              </Reveal>
            ))}
          </ul>
        </ScrollRegion>
      )}
      <p className="text-caption text-text-muted">The watch tab lists the top 200 live matches, not every match being played. Refreshes about once a minute.</p>
    </section>
  )
}
