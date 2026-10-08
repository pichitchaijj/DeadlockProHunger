import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { Reveal } from '@/components/motion/Reveal'
import { Badge } from '@/components/ui/Badge'
import { cx } from '@/lib/cx'
import { formatInteger, formatPercent } from '@/lib/format'
import { capitalize } from '@/features/meta/model'
import { BALANCE_AXES, pp, ROLE_ORDER, weakPointText, type BalanceAxis, type DraftHero, type HeroRef, type Recommendation, type Relation, type WeakPoint } from '../model'
import { draftHref, withHero, type DraftQuery } from '../query'

/*
 * Draft insight panels, worded from the Draft catalog (draft.recs / draft.weak / draft.roles / draft.balance).
 * Hero names, roles and every number are data.
 */

function WhyLine({ r, name }: { r: Relation; name: (id: number) => string }) {
  const t = useTranslations('draft.recs')
  const locale = useLocale()
  const other = name(r.to)
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 text-sm">
      <span className={cx('font-semibold', r.clear === 'positive' ? 'text-primary' : r.clear === 'negative' ? 'text-orange' : 'text-text-muted')}>
        {r.kind === 'synergy' ? t('with', { hero: other }) : t('against', { hero: other })}
      </span>
      <span className="text-text">{t('vsExpected', { rate: formatPercent(r.winRate), expected: formatPercent(r.expected), gap: pp(r.lift) })}</span>
      <span className="text-caption text-text-muted">
        n = {formatInteger(r.matches, locale)} · {t(`status.${r.clear ? 'clear' : r.sample === 'low' ? 'low' : 'noise'}`)}
      </span>
    </li>
  )
}

export function Recommendations({ query, recs, heroes, hasPicks, alliesFull }: { query: DraftQuery; recs: Recommendation[]; heroes: DraftHero[]; hasPicks: boolean; alliesFull: boolean }) {
  const t = useTranslations('draft.recs')
  const name = (id: number) => heroes.find((h) => h.id === id)?.name ?? ''
  if (!hasPicks) return <p className="text-sm text-text-muted">{t('needPicks')}</p>
  if (alliesFull) return <p className="text-sm text-text-muted">{t('full')}</p>
  if (recs.length === 0) {
    return <p className="text-sm text-text-muted">{t('none')}</p>
  }
  return (
    <ol className="flex flex-col gap-3">
      {recs.map((rec, i) => {
        const clear = rec.relations.filter((r) => r.clear)
        const rest = rec.relations.filter((r) => !r.clear)
        return (
          <Reveal as="li" key={rec.hero.id} index={i} className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
            <div className="flex flex-wrap items-center gap-3">
              <HeroPortrait name={rec.hero.name} src={rec.hero.iconUrl ?? undefined} size="sm" decorative />
              <span className="font-ui text-title font-semibold text-text">{rec.hero.name}</span>
              <Badge tone={rec.confidence === 'high' ? 'primary' : 'neutral'} title={t(`rule.${rec.confidence}`)}>
                {t(`confidence.${rec.confidence}`)}
              </Badge>
              <Link href={draftHref(withHero(query, rec.hero.slug, 'allies'))} className="ml-auto inline-flex min-h-11 items-center rounded-sm px-2 text-sm font-semibold text-primary hover:text-highlight">
                {t('addToTeam')}
              </Link>
            </div>
            <div>
              <p className="text-eyebrow">{t('why')}</p>
              <ul className="mt-1 flex flex-col gap-1">
                {clear.map((r) => <WhyLine key={`${r.kind}-${r.to}`} r={r} name={name} />)}
              </ul>
              {rec.newRole && <p className="mt-1 text-caption text-text-muted">{t('newRole', { role: rec.newRole })}</p>}
              {(rest.length > 0 || rec.missing > 0) && (
                <details className="mt-1">
                  <summary className="cursor-pointer py-3.5 text-caption text-text-muted hover:text-text">
                    {t('otherPairings', { count: rest.length })}{rec.missing ? ` · ${t('withoutData', { count: rec.missing })}` : ''}
                  </summary>
                  <ul className="mt-1 flex flex-col gap-1">{rest.map((r) => <WhyLine key={`${r.kind}-${r.to}`} r={r} name={name} />)}</ul>
                </details>
              )}
            </div>
          </Reveal>
        )
      })}
    </ol>
  )
}

export function WeakPoints({ points, hasAllies }: { points: WeakPoint[]; hasAllies: boolean }) {
  const t = useTranslations('draft.weak')
  const locale = useLocale()
  if (!hasAllies) return <p className="text-sm text-text-muted">{t('needAllies')}</p>
  if (points.length === 0) return <p className="text-sm text-text-muted">{t('none')}</p>
  const name = (hero: HeroRef) => hero.name ?? t('heroFallback', { id: hero.id })
  const worded = points.map((p) => weakPointText(p, (key, values) => t(key as 'threat', values), name, (v) => formatInteger(v, locale)))
  return (
    <ul className="flex flex-col gap-2">
      {worded.map((p) => (
        <li key={p.title} className="rounded-sm border border-orange/30 bg-orange/5 px-3 py-2">
          <p className="text-sm font-semibold text-text">{p.title}</p>
          <p className="text-caption text-text-muted">{p.detail}</p>
        </li>
      ))}
    </ul>
  )
}

export function RoleCoverage({ allies, enemies }: { allies: DraftHero[]; enemies: DraftHero[] }) {
  const t = useTranslations('draft.roles')
  const count = (team: DraftHero[], role: string) => team.filter((h) => h.role === role).length
  return (
    <table className="w-full font-ui text-sm">
      <caption className="sr-only">{t('caption')}</caption>
      <thead>
        <tr className="text-eyebrow">
          <th scope="col" className="py-1 text-left">{t('role')}</th>
          <th scope="col" className="py-1 text-right text-primary">{t('you')}</th>
          <th scope="col" className="py-1 text-right text-orange">{t('enemy')}</th>
        </tr>
      </thead>
      <tbody>
        {ROLE_ORDER.map((role) => (
          <tr key={role} className="border-t border-border/60">
            <th scope="row" className="py-1.5 text-left font-normal text-text">{capitalize(role)}</th>
            {[count(allies, role), count(enemies, role)].map((n, i) => (
              <td key={i} className={cx('py-1.5 text-right tabular', n === 0 ? 'text-text-muted' : 'text-text')}>{n === 0 ? '—' : n}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Average percentile of each team's heroes on per-match measures. 50 = typical hero. */
export function Balance({ allies, enemies }: { allies: Record<BalanceAxis, number> | null; enemies: Record<BalanceAxis, number> | null }) {
  const t = useTranslations('draft.balance')
  const roles = useTranslations('draft.roles')
  if (!allies && !enemies) return <p className="text-sm text-text-muted">{t('needPicks')}</p>
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {BALANCE_AXES.map((axis) => (
          <li key={axis} className="flex flex-col gap-1">
            <span className="text-caption text-text-muted">{t(`axes.${axis}`)}</span>
            {([[roles('you'), allies, 'bg-primary'], [roles('enemy'), enemies, 'bg-orange']] as const).map(([label, team, color]) => (
              <span key={label} className="grid grid-cols-[3.5rem_1fr_2.5rem] items-center gap-2">
                <span className="text-caption text-text-muted">{label}</span>
                <span className="relative h-2 rounded-pill bg-surface-sunken" aria-hidden="true">
                  <span className="absolute inset-y-[-3px] left-1/2 w-px bg-text-muted/40" />
                  {team && <span className={cx('absolute inset-y-0 left-0 origin-left animate-grow rounded-pill', color)} style={{ width: `${Math.max(2, team[axis] * 100)}%` }} />}
                </span>
                <span className="text-right text-caption text-text tabular">{team ? Math.round(team[axis] * 100) : '—'}</span>
                <span className="sr-only">{label}: {team ? t('percentile', { value: Math.round(team[axis] * 100) }) : t('noPicks')}</span>
              </span>
            ))}
          </li>
        ))}
      </ul>
      <p className="text-caption text-text-muted">{t('note')}</p>
    </div>
  )
}
