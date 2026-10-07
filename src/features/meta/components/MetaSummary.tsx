import { Link } from '@/i18n/navigation'
import type { ReactNode } from 'react'
import { TierBadge } from '@/components/data/TierBadge'
import { TrendBadge } from '@/components/data/TrendBadge'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { CountUp } from '@/components/motion/CountUp'
import { Reveal } from '@/components/motion/Reveal'
import { cx } from '@/lib/cx'
import { formatPercent } from '@/lib/format'
import { toPercent, winRateDomain } from '@/lib/scale'
import { capitalize, type MetaHero, type MetaModel } from '../model'

/** Six answers in one glance: strongest, rising, falling, most played, highest win rate, best role. */
export function MetaSummary({ summary }: { summary: MetaModel['summary'] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Reveal index={0}>
        <Tile title="Strongest picks" note="Tier S/A: win-rate interval above 50%" featured>
          <HeroList heroes={summary.strongest} empty="No hero is clearly above 50% in this scope." render={(h) => <TierBadge tier={h.tier} size="sm" />} />
        </Tile>
      </Reveal>
      <Reveal index={1}>
        <Tile title="Rising" note="Last 7 days vs the 7 before, intervals don’t overlap">
          <HeroList
            heroes={summary.rising}
            empty="No hero changed beyond normal variation."
            render={(h) => <TrendBadge direction="rising" delta={h.trend!.delta} comparison="vs previous 7 days" pulse />}
          />
        </Tile>
      </Reveal>
      <Reveal index={2}>
        <Tile title="Falling" note="Last 7 days vs the 7 before, intervals don’t overlap">
          <HeroList
            heroes={summary.falling}
            empty="No hero changed beyond normal variation."
            render={(h) => <TrendBadge direction="falling" delta={h.trend!.delta} comparison="vs previous 7 days" pulse />}
          />
        </Tile>
      </Reveal>
      <Reveal index={3}>
        <Tile title="Most played" note="Share of matches the hero appears in">
          <SingleHero hero={summary.mostPlayed} value={summary.mostPlayed?.pickRate} />
        </Tile>
      </Reveal>
      <Reveal index={4}>
        <Tile title="Highest win rate" note="Among heroes with 1,000+ matches">
          <SingleHero hero={summary.highestWinRate} value={summary.highestWinRate?.winRate} />
        </Tile>
      </Reveal>
      <Reveal index={5}>
        <Tile
          title="Best-performing role"
          note={summary.roleLeaderIsClear ? 'Clear leader: interval above every other role' : 'Differences are within normal variation'}
        >
          <RoleBars roles={summary.roles} clear={summary.roleLeaderIsClear} />
        </Tile>
      </Reveal>
    </div>
  )
}

function Tile({ title, note, featured = false, children }: { title: string; note: string; featured?: boolean; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className={cx(
        'flex h-full flex-col gap-4 rounded-md border bg-surface p-(--spacing-card) shadow-card',
        featured ? 'border-primary/50 shadow-glow' : 'border-border',
      )}
    >
      <h3 className="text-eyebrow">{title}</h3>
      <div className="flex-1">{children}</div>
      <p className="text-caption text-text-muted">{note}</p>
    </section>
  )
}

function HeroList({ heroes, empty, render }: { heroes: MetaHero[]; empty: string; render: (hero: MetaHero) => ReactNode }) {
  if (heroes.length === 0) return <p className="text-sm text-text-muted">{empty}</p>
  return (
    <ol className="flex flex-col gap-2.5">
      {heroes.map((hero) => (
        <li key={hero.id}>
          <Link href={`/heroes/${hero.slug}`} className="group flex items-center gap-3 pointer-coarse:min-h-11">
            <HeroPortrait name={hero.name} src={hero.iconUrl ?? undefined} size="sm" />
            <span className="min-w-0 flex-1 truncate font-ui text-sm font-semibold text-text group-hover:text-highlight">{hero.name}</span>
            <span className="font-ui text-sm text-text-muted tabular">{formatPercent(hero.winRate)}</span>
            {render(hero)}
          </Link>
        </li>
      ))}
    </ol>
  )
}

function SingleHero({ hero, value }: { hero: MetaHero | null; value: number | undefined }) {
  if (!hero || value === undefined) return <p className="text-sm text-text-muted">Not enough data in this scope.</p>
  return (
    <Link href={`/heroes/${hero.slug}`} className="group flex items-center gap-4">
      <HeroPortrait name={hero.name} src={hero.iconUrl ?? undefined} size="md" />
      <span className="flex flex-col">
        <CountUp value={value} format="percent" className="font-display text-display-l font-bold text-text" />
        <span className="font-ui text-sm font-semibold text-text group-hover:text-highlight">{hero.name}</span>
      </span>
    </Link>
  )
}

/** Horizontal bars per role on a 50%-centered scale (lib/scale). Bars draw in on reveal. */
function RoleBars({ roles, clear }: { roles: MetaModel['summary']['roles']; clear: boolean }) {
  if (roles.length === 0) return <p className="text-sm text-text-muted">Role data unavailable.</p>
  const domain = winRateDomain(roles.map((r) => r.winRate))
  const toPct = (v: number) => toPercent(v, domain)
  return (
    <ul className="flex flex-col gap-3">
      {roles.map((role, i) => (
        <li key={role.role} className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-3">
          <span className={cx('font-ui text-sm', i === 0 && clear ? 'font-semibold text-text' : 'text-text-muted')}>{capitalize(role.role)}</span>
          <span aria-hidden="true" className="relative h-2 rounded-pill bg-surface-sunken">
            <span className="absolute inset-y-[-3px] left-1/2 w-px bg-text-muted/50" />
            <span
              className={cx('absolute inset-y-0 left-0 origin-left rounded-pill animate-grow', i === 0 && clear ? 'bg-primary' : 'bg-steel')}
              style={{ width: `${toPct(role.winRate)}%`, animationDelay: `${300 + i * 80}ms` }}
            />
          </span>
          <span className="text-right font-ui text-sm text-text tabular">{formatPercent(role.winRate)}</span>
        </li>
      ))}
    </ul>
  )
}
