import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { cx } from '@/lib/cx'
import { formatPercent } from '@/lib/format'
import { capitalize } from '@/features/meta/model'
import { ROLE_ORDER, type DraftHero } from '../model'
import { draftHref, TEAM_SIZE, withHero, withoutHero, type DraftQuery } from '../query'

/*
 * Draft board, worded from the Draft catalog (draft.board). Hero names and slugs, roles and win rates are data.
 */

/** Two six-slot teams. Every change is a link, so the draft lives in the URL and works without JS. */
export function TeamSlots({ query, allies, enemies, base }: { query: DraftQuery; allies: DraftHero[]; enemies: DraftHero[]; base: Map<number, number> }) {
  const t = useTranslations('draft.board')
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(['allies', 'enemies'] as const).map((side) => {
        const team = side === 'allies' ? allies : enemies
        const active = query.side === side
        return (
          <section key={side} aria-labelledby={`team-${side}`} className={cx('flex flex-col gap-3 rounded-md border bg-surface p-3', active ? 'border-primary/60' : 'border-border')}>
            <div className="flex items-center justify-between gap-2">
              <h2 id={`team-${side}`} className={cx('font-display text-title font-bold uppercase', side === 'allies' ? 'text-primary' : 'text-orange')}>
                {t(`sides.${side}`)} <span className="font-ui text-sm font-normal text-text-muted">{team.length}/{TEAM_SIZE}</span>
              </h2>
              {active ? (
                <span className="text-caption font-semibold text-primary">{t('addingHere')}</span>
              ) : (
                <Link href={draftHref(query, { side })} className="inline-flex min-h-11 items-center text-caption text-text-muted hover:text-text">
                  {t('addHere')}
                </Link>
              )}
            </div>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {Array.from({ length: TEAM_SIZE }, (_, i) => {
                const hero = team[i]
                if (!hero) return <li key={i} aria-hidden="true" className="aspect-square rounded-sm border border-dashed border-border" />
                return (
                  <li key={hero.id} className="flex flex-col items-center gap-1">
                    <Link href={draftHref(withoutHero(query, hero.slug))} aria-label={t('remove', { hero: hero.name, side: t(`sidesLower.${side}`) })} className="group relative">
                      <HeroPortrait name={hero.name} src={hero.iconUrl ?? undefined} size="md" decorative />
                      <span aria-hidden="true" className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-pill border border-border-strong bg-surface-raised text-[0.7rem] text-text-muted group-hover:text-text">×</span>
                    </Link>
                    <span className="w-full truncate text-center text-caption text-text">{hero.name}</span>
                    <span className="text-caption text-text-muted tabular">{base.has(hero.id) ? formatPercent(base.get(hero.id)!) : '—'}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

/** Hero picker grouped by role. Picked heroes stay visible but inert. */
export function HeroPicker({ query, heroes }: { query: DraftQuery; heroes: DraftHero[] }) {
  const t = useTranslations('draft.board')
  const sideName = t(`sidesLower.${query.side}`)
  const full = query[query.side].length >= TEAM_SIZE
  const picked = new Set([...query.allies, ...query.enemies])
  const groups = [...ROLE_ORDER, null].map((role) => ({ role, heroes: heroes.filter((h) => (role ? h.role === role : !ROLE_ORDER.includes(h.role as (typeof ROLE_ORDER)[number]))) })).filter((g) => g.heroes.length)
  return (
    <section aria-labelledby="picker" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="picker" className="text-eyebrow">
          {t.rich('addTo', { team: sideName, side: (chunks) => <span className={query.side === 'allies' ? 'text-primary' : 'text-orange'}>{chunks}</span> })}
          {full && <span className="text-text-muted"> · {t('teamFull')}</span>}
        </h2>
        {(query.allies.length > 0 || query.enemies.length > 0) && (
          <Link href={draftHref({ ...query, allies: [], enemies: [] })} className="inline-flex min-h-11 items-center text-caption text-text-muted hover:text-text">{t('clear')}</Link>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        {groups.map((g) => (
          <div key={g.role ?? 'other'} className="flex flex-col gap-2">
            <h3 className="text-caption font-semibold text-text-muted">{g.role ? capitalize(g.role) : t('otherRole')}</h3>
            <ul className="flex flex-wrap gap-1.5">
              {g.heroes.map((h) => {
                const isPicked = picked.has(h.slug)
                const tile = (
                  <>
                    <HeroPortrait name={h.name} src={h.iconUrl ?? undefined} size="sm" decorative />
                    <span className="sr-only">{h.name}</span>
                  </>
                )
                return (
                  <li key={h.id}>
                    {isPicked || full ? (
                      <span title={isPicked ? t('picked', { hero: h.name }) : h.name} className={cx('block rounded-sm', isPicked ? 'opacity-30' : 'opacity-60')}>{tile}</span>
                    ) : (
                      <Link href={draftHref(withHero(query, h.slug, query.side))} title={t('add', { hero: h.name })} aria-label={t('addToSide', { hero: h.name, side: sideName })} className="flex items-center justify-center rounded-sm transition-transform duration-150 hover:-translate-y-0.5 pointer-coarse:min-h-11 pointer-coarse:min-w-11">
                        {tile}
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
