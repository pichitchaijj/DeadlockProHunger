import { useLocale, useTranslations } from 'next-intl'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { cx } from '@/lib/cx'
import { formatInteger, formatPercent } from '@/lib/format'
import { pp, type DraftHero, type Relation } from '../model'

const ROW = 56
const W = 100

/** Relative to the user's team: good for you (cyan) or good for the enemy (orange). */
export function favorsYou(r: Relation, allyIds: Set<number>): boolean {
  if (r.kind === 'matchup') return r.clear === 'positive' // from = ally
  return allyIds.has(r.from) ? r.clear === 'positive' : r.clear === 'negative'
}

/**
 * Only clear relationships are drawn, so the map stays quiet:
 * left arcs = your pairs, right arcs = enemy pairs, straight lines = matchups.
 * Lines fade in once; the list below carries the same information as text.
 */
export function RelationMap({ allies, enemies, relations, checked, withData }: { allies: DraftHero[]; enemies: DraftHero[]; relations: Relation[]; checked: number; withData: number }) {
  const t = useTranslations('draft.map')
  const locale = useLocale()
  const allyIds = new Set(allies.map((h) => h.id))
  const rows = Math.max(allies.length, enemies.length, 1)
  const H = rows * ROW
  const yOf = (id: number) => {
    const ai = allies.findIndex((h) => h.id === id)
    const i = ai >= 0 ? ai : enemies.findIndex((h) => h.id === id)
    return i * ROW + ROW / 2
  }
  const name = (id: number) => [...allies, ...enemies].find((h) => h.id === id)?.name ?? ''
  const path = (r: Relation) => {
    const y1 = yOf(r.from)
    const y2 = yOf(r.to)
    if (r.kind === 'matchup') return `M0,${y1} L${W},${y2}`
    const left = allyIds.has(r.from)
    const x = left ? 0 : W
    const bulge = Math.min(40, 10 + Math.abs(y2 - y1) / 6)
    return `M${x},${y1} Q${left ? bulge : W - bulge},${(y1 + y2) / 2} ${x},${y2}`
  }
  const sorted = [...relations].sort((a, b) => Math.abs(b.lift) - Math.abs(a.lift))

  const column = (team: DraftHero[], side: 'left' | 'right') => (
    <ul className="flex flex-col">
      {team.map((h) => (
        <li key={h.id} className={cx('flex items-center gap-2', side === 'right' && 'flex-row-reverse text-right')} style={{ height: ROW }}>
          <HeroPortrait name={h.name} src={h.iconUrl ?? undefined} size="sm" />
          <span className="max-w-[6.5rem] truncate text-caption text-text max-sm:hidden">{h.name}</span>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[auto_1fr_auto] gap-2" aria-hidden="true">
        {column(allies, 'left')}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: H }}>
          {sorted.map((r, i) => (
            <path
              key={`${r.kind}-${r.from}-${r.to}`}
              d={path(r)}
              fill="none"
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              className={cx('animate-fade-in', favorsYou(r, allyIds) ? 'stroke-primary' : 'stroke-orange')}
              // Favoring the enemy is also dashed, so the two kinds differ without color.
              strokeDasharray={favorsYou(r, allyIds) ? undefined : '6 4'}
              strokeWidth={1.5 + Math.min(3, Math.abs(r.lift) * 50)}
              strokeOpacity={r.sample === 'high' ? 0.9 : 0.55}
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </svg>
        {column(enemies, 'right')}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-muted">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-primary" /> {t('favorsYou')}</span>
        <span className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-orange" /> {t('favorsEnemyLegend')}</span>
        <span>{t('legend')}</span>
      </div>

      {relations.length === 0 ? (
        <p className="text-sm text-text-muted">{t('none', { checked: formatInteger(checked, locale), withData: formatInteger(withData, locale) })}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {sorted.map((r) => {
              const good = favorsYou(r, allyIds)
              return (
                <li key={`${r.kind}-${r.from}-${r.to}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className={cx('font-semibold', good ? 'text-primary' : 'text-orange')}>
                    {t(r.kind === 'matchup' ? 'matchupPair' : 'synergyPair', { a: name(r.from), b: name(r.to) })}
                  </span>
                  <span className="text-text">
                    {r.kind === 'matchup'
                      ? t('matchupResult', { a: name(r.from), rate: formatPercent(r.winRate), expected: formatPercent(r.expected), gap: pp(r.lift) })
                      : t('synergyResult', { rate: formatPercent(r.winRate), expected: formatPercent(r.expected), gap: pp(r.lift) })}
                  </span>
                  <span className="text-caption text-text-muted">{t('relationMeta', { favor: good ? t('favorsYou') : t('favorsEnemy'), n: formatInteger(r.matches, locale), sample: r.sample === 'high' ? 'high' : 'moderate' })}</span>
                </li>
              )
            })}
          </ul>
          <p className="text-caption text-text-muted">{t('summary', { count: relations.length, checked: formatInteger(checked, locale) })}</p>
        </>
      )}
    </div>
  )
}
