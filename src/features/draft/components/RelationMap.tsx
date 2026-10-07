import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { cx } from '@/lib/cx'
import { formatInteger, formatPercent } from '@/lib/format'
import type { DraftHero, Relation } from '../model'

const ROW = 56
const W = 100

/** Relative to the user's team: good for you (cyan) or good for the enemy (orange). */
export function favorsYou(r: Relation, allyIds: Set<number>): boolean {
  if (r.kind === 'matchup') return r.clear === 'positive' // from = ally
  return allyIds.has(r.from) ? r.clear === 'positive' : r.clear === 'negative'
}

const pp = (v: number) => `${v >= 0 ? '+' : '−'}${(Math.abs(v) * 100).toFixed(1)}pp`

/**
 * Only clear relationships are drawn, so the map stays quiet:
 * left arcs = your pairs, right arcs = enemy pairs, straight lines = matchups.
 * Lines fade in once; the list below carries the same information as text.
 */
export function RelationMap({ allies, enemies, relations, checked, withData }: { allies: DraftHero[]; enemies: DraftHero[]; relations: Relation[]; checked: number; withData: number }) {
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
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-primary" /> Favors your team</span>
        <span className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-orange" /> Favors the enemy (dashed)</span>
        <span>Arcs: same-team pairs · straight: matchups · thicker = bigger gap · faded = moderate sample</span>
      </div>

      {relations.length === 0 ? (
        <p className="text-sm text-text-muted">
          No clear relationships among these picks. {formatInteger(checked)} pairings checked, {formatInteger(withData)} with enough data; every one is within what the heroes’ individual win rates predict.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {sorted.map((r) => {
              const good = favorsYou(r, allyIds)
              return (
                <li key={`${r.kind}-${r.from}-${r.to}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className={cx('font-semibold', good ? 'text-primary' : 'text-orange')}>
                    {r.kind === 'matchup' ? `${name(r.from)} vs ${name(r.to)}` : `${name(r.from)} + ${name(r.to)}`}
                  </span>
                  <span className="text-text">
                    {r.kind === 'matchup' ? `${name(r.from)} wins ${formatPercent(r.winRate)}` : `${formatPercent(r.winRate)} together`}, expected {formatPercent(r.expected)} ({pp(r.lift)})
                  </span>
                  <span className="text-caption text-text-muted">{good ? 'Favors your team' : 'Favors the enemy'} · n = {formatInteger(r.matches)} · {r.sample === 'high' ? 'high' : 'moderate'} sample</span>
                </li>
              )
            })}
          </ul>
          <p className="text-caption text-text-muted">{relations.length} of {formatInteger(checked)} pairings differ clearly from expectation; the rest are within noise or lack data and aren’t drawn.</p>
        </>
      )}
    </div>
  )
}
