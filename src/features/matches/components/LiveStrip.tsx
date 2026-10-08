import { useLocale, useTranslations } from 'next-intl'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { Reveal } from '@/components/motion/Reveal'
import { ScrollRegion } from '@/components/ui/ScrollRegion'
import { formatInteger } from '@/lib/format'
import type { liveSummary } from '../model'

type Live = ReturnType<typeof liveSummary>

/**
 * Live indicator from the game's watch tab. Calm by design: one soft status ring,
 * plain numbers, no flashing. Only shown when the source responds. Matches page only (matches.live).
 */
export function LiveStrip({ live }: { live: Live }) {
  const t = useTranslations('matches')
  const locale = useLocale()
  return (
    <section aria-labelledby="live-title" className="flex flex-col gap-4 rounded-md border border-border bg-surface/60 p-(--spacing-card)">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="live-title" className="flex items-center gap-3 font-ui text-title font-semibold text-text">
          <span aria-hidden="true" className="relative inline-flex size-2.5 rounded-pill bg-primary animate-live-pulse" />
          {t('live.title')}
        </h2>
        <p className="text-sm text-text-muted">
          {t.rich('live.summary', {
            total: formatInteger(live.total, locale),
            ranked: formatInteger(live.ranked, locale),
            num: (chunks) => <span className="font-semibold text-text tabular">{chunks}</span>,
          })}
        </p>
      </div>
      {/* Phones: a swipeable row (one card tall) so search and filters stay near the top. It scrolls in a
          focusable region so keyboard users can scroll it too (docs/ACCESSIBILITY.md § Keyboard). */}
      {live.featured.length > 0 && (
        <ScrollRegion label={t('live.region')} className="-mx-(--spacing-card) snap-x snap-mandatory px-(--spacing-card) pb-1 sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
          <ul aria-label={t('live.list')} className="flex gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-4">
            {live.featured.map((m, i) => (
              <Reveal as="li" key={m.id} index={i} className="flex w-[85%] shrink-0 snap-start flex-col gap-2 rounded-sm border border-border bg-surface-sunken p-3 sm:w-auto">
                <p className="flex items-center justify-between gap-2 text-caption text-text-muted">
                  <span>
                    {m.ranked ? t('common.ranked') : t('common.unranked')} · {m.minutes !== null ? t('live.minutesIn', { minutes: m.minutes }) : t('live.inProgress')}
                  </span>
                  <span className="tabular">{t('live.watching', { count: formatInteger(m.spectators, locale) })}</span>
                </p>
                {m.heroes.map((team, side) => (
                  <ul key={side} className="flex gap-1" aria-label={t('live.teamHeroes', { n: side + 1 })}>
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
                      {t('live.soulsShare', { a: Math.round(m.team1Share * 100), b: 100 - Math.round(m.team1Share * 100) })}
                    </span>
                  </div>
                )}
              </Reveal>
            ))}
          </ul>
        </ScrollRegion>
      )}
      <p className="text-caption text-text-muted">{t('live.note')}</p>
    </section>
  )
}
