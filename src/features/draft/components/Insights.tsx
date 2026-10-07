import Link from 'next/link'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { Reveal } from '@/components/motion/Reveal'
import { Badge } from '@/components/ui/Badge'
import { cx } from '@/lib/cx'
import { formatInteger, formatPercent } from '@/lib/format'
import { capitalize } from '@/features/meta/model'
import { BALANCE_LABELS, ROLE_ORDER, type BalanceAxis, type DraftHero, type Recommendation, type Relation, type WeakPoint } from '../model'
import { draftHref, withHero, type DraftQuery } from '../query'

const pp = (v: number) => `${v >= 0 ? '+' : '−'}${(Math.abs(v) * 100).toFixed(1)}pp`

export const CONFIDENCE_RULE = {
  high: 'At least 2 clear positive relationships and no clear negative one.',
  moderate: 'At least 1 clear positive relationship, more positives than negatives.',
} as const

function WhyLine({ r, name }: { r: Relation; name: (id: number) => string }) {
  const other = name(r.to)
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 text-sm">
      <span className={cx('font-semibold', r.clear === 'positive' ? 'text-primary' : r.clear === 'negative' ? 'text-orange' : 'text-text-muted')}>
        {r.kind === 'synergy' ? `With ${other}` : `Against ${other}`}
      </span>
      <span className="text-text">
        {formatPercent(r.winRate)} vs {formatPercent(r.expected)} expected ({pp(r.lift)})
      </span>
      <span className="text-caption text-text-muted">
        n = {formatInteger(r.matches)} · {r.clear ? 'clear' : r.sample === 'low' ? 'low sample' : 'within noise or under 1pp'}
      </span>
    </li>
  )
}

export function Recommendations({ query, recs, heroes, hasPicks, alliesFull }: { query: DraftQuery; recs: Recommendation[]; heroes: DraftHero[]; hasPicks: boolean; alliesFull: boolean }) {
  const name = (id: number) => heroes.find((h) => h.id === id)?.name ?? ''
  if (!hasPicks) return <p className="text-sm text-text-muted">Pick at least one hero on either side. Suggestions come only from how heroes perform with or against the current picks.</p>
  if (alliesFull) return <p className="text-sm text-text-muted">Your team is full.</p>
  if (recs.length === 0) {
    return <p className="text-sm text-text-muted">No hero has clear positive evidence with these picks. That means the data doesn’t separate the options, not that any choice is wrong.</p>
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
              <Badge tone={rec.confidence === 'high' ? 'primary' : 'neutral'} title={CONFIDENCE_RULE[rec.confidence]}>
                {rec.confidence === 'high' ? 'High confidence' : 'Moderate confidence'}
              </Badge>
              <Link href={draftHref(withHero(query, rec.hero.slug, 'allies'))} className="ml-auto inline-flex min-h-11 items-center rounded-sm px-2 text-sm font-semibold text-primary hover:text-highlight">
                Add to your team
              </Link>
            </div>
            <div>
              <p className="text-eyebrow">Why?</p>
              <ul className="mt-1 flex flex-col gap-1">
                {clear.map((r) => <WhyLine key={`${r.kind}-${r.to}`} r={r} name={name} />)}
              </ul>
              {rec.newRole && <p className="mt-1 text-caption text-text-muted">Would be your first {rec.newRole}. Role coverage is shown as a fact; it isn’t scored.</p>}
              {(rest.length > 0 || rec.missing > 0) && (
                <details className="mt-1">
                  <summary className="cursor-pointer py-3.5 text-caption text-text-muted hover:text-text">
                    {rest.length} other pairing{rest.length === 1 ? '' : 's'} not clear{rec.missing ? ` · ${rec.missing} without enough data` : ''}
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
  if (!hasAllies) return <p className="text-sm text-text-muted">Add heroes to your team to check for measured weak points.</p>
  if (points.length === 0) return <p className="text-sm text-text-muted">No measured weak points: no enemy clearly beats your picks, no pair of your picks clearly underperforms together, and no balance measure is in the bottom quarter.</p>
  return (
    <ul className="flex flex-col gap-2">
      {points.map((p) => (
        <li key={p.title} className="rounded-sm border border-orange/30 bg-orange/5 px-3 py-2">
          <p className="text-sm font-semibold text-text">{p.title}</p>
          <p className="text-caption text-text-muted">{p.detail}</p>
        </li>
      ))}
    </ul>
  )
}

export function RoleCoverage({ allies, enemies }: { allies: DraftHero[]; enemies: DraftHero[] }) {
  const count = (team: DraftHero[], role: string) => team.filter((h) => h.role === role).length
  return (
    <table className="w-full font-ui text-sm">
      <caption className="sr-only">Heroes per role on each team</caption>
      <thead>
        <tr className="text-eyebrow">
          <th scope="col" className="py-1 text-left">Role</th>
          <th scope="col" className="py-1 text-right text-primary">You</th>
          <th scope="col" className="py-1 text-right text-orange">Enemy</th>
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
  if (!allies && !enemies) return <p className="text-sm text-text-muted">Pick heroes to see their measured profile.</p>
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {(Object.keys(BALANCE_LABELS) as BalanceAxis[]).map((axis) => (
          <li key={axis} className="flex flex-col gap-1">
            <span className="text-caption text-text-muted">{BALANCE_LABELS[axis]}</span>
            {([['You', allies, 'bg-primary'], ['Enemy', enemies, 'bg-orange']] as const).map(([label, team, color]) => (
              <span key={label} className="grid grid-cols-[3.5rem_1fr_2.5rem] items-center gap-2">
                <span className="text-caption text-text-muted">{label}</span>
                <span className="relative h-2 rounded-pill bg-surface-sunken" aria-hidden="true">
                  <span className="absolute inset-y-[-3px] left-1/2 w-px bg-text-muted/40" />
                  {team && <span className={cx('absolute inset-y-0 left-0 origin-left animate-grow rounded-pill', color)} style={{ width: `${Math.max(2, team[axis] * 100)}%` }} />}
                </span>
                <span className="text-right text-caption text-text tabular">{team ? Math.round(team[axis] * 100) : '—'}</span>
                <span className="sr-only">{label}: {team ? `${Math.round(team[axis] * 100)}th percentile` : 'no picks'}</span>
              </span>
            ))}
          </li>
        ))}
      </ul>
      <p className="text-caption text-text-muted">
        Average percentile of each team’s heroes among all heroes (50 = typical), from per-match averages in this scope. Longer matches raise every total. Utility such as healing or crowd control isn’t in the data, so it isn’t measured.
      </p>
    </div>
  )
}
