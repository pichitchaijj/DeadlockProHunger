import Link from 'next/link'
import type { ReactNode } from 'react'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { ItemIcon } from '@/components/game-assets/ItemIcon'
import { CountUp } from '@/components/motion/CountUp'
import { Reveal } from '@/components/motion/Reveal'
import { Badge } from '@/components/ui/Badge'
import { cx } from '@/lib/cx'
import { formatCompact, formatDuration, formatInteger } from '@/lib/format'
import { SIDE_LABEL, type MatchView, type PlayerView, type Side, type TeamTotals } from '../model'
import { ScrollRegion } from '@/components/ui/ScrollRegion'

/** Team colors: restrained and always paired with the team name. */
export const TEAM_TEXT: Record<Side, string> = { 0: 'text-primary', 1: 'text-text-muted' }
export const TEAM_BG: Record<Side, string> = { 0: 'bg-primary', 1: 'bg-text-muted' }
export const TEAM_STROKE: Record<Side, string> = { 0: 'stroke-primary', 1: 'stroke-text-muted' }

const DATE = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' })

export function Section({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-32 flex-col gap-4">
      <div>
        <h2 id={`${id}-title`} className="font-display text-display-m font-bold text-text uppercase">{title}</h2>
        {description && <p className="mt-1 max-w-3xl text-sm text-text-muted">{description}</p>}
      </div>
      {children}
    </section>
  )
}

// ── 1. Summary ───────────────────────────────────────────────────────

export function MatchSummary({ view, patch, rank }: { view: MatchView; patch: string | null; rank: [string | null, string | null] }) {
  const result = view.outcome === 'win' && view.winner !== null ? `${SIDE_LABEL[view.winner]} won` : view.outcome === 'draw' ? 'Draw' : 'No result recorded'
  return (
    <section aria-labelledby="match-title" className="flex animate-awaken flex-col gap-5">
      <p className="text-eyebrow">
        <Link href="/matches" className="hover:text-text pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center">Matches</Link> <span aria-hidden="true">/</span> {view.id}
      </p>
      <h1 id="match-title" className="sr-only">Match {view.id}: {result}</h1>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md border border-border bg-surface p-(--spacing-card) shadow-card sm:gap-6">
        {([0, 1] as const).map((side) => (
          <div key={side} className={cx('flex flex-col gap-1', side === 0 ? 'items-start text-left' : 'order-3 items-end text-right')}>
            <span className={cx('font-display text-title font-bold uppercase', TEAM_TEXT[side])}>{SIDE_LABEL[side]}</span>
            <span className="font-display text-display-xl leading-none font-extrabold text-text tabular">
              <CountUp value={view.teams[side].kills} format="integer" />
            </span>
            <span className="text-caption text-text-muted">kills{rank[side] ? ` · avg. ${rank[side]}` : ''}</span>
            {view.winner === side && <Badge tone="positive">Winner</Badge>}
          </div>
        ))}
        <span className="order-2 font-display text-display-m font-bold text-text-muted">VS</span>
      </div>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
        <Meta label="Result">{result}</Meta>
        <Meta label="Duration">{formatDuration(view.durationS)}</Meta>
        <Meta label="Mode">{view.mode}</Meta>
        <Meta label="Patch">{patch ?? 'Unknown'}</Meta>
        <Meta label="Date" className="col-span-2">{DATE.format(view.startedAt)}</Meta>
      </dl>
      {(view.flags.highSkill || view.flags.lowPriority || view.flags.newPlayer || view.flags.notScored) && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Match conditions">
          {view.flags.highSkill && <li><Badge>High-skill party range</Badge></li>}
          {view.flags.lowPriority && <li><Badge tone="warning">Low-priority pool</Badge></li>}
          {view.flags.newPlayer && <li><Badge>New-player pool</Badge></li>}
          {view.flags.notScored && <li><Badge tone="warning">Not scored</Badge></li>}
        </ul>
      )}
    </section>
  )
}

function Meta({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-0.5 bg-surface px-4 py-3', className)}>
      <dt className="text-eyebrow">{label}</dt>
      <dd className="font-ui text-sm font-semibold text-text">{children}</dd>
    </div>
  )
}

// ── Match story ──────────────────────────────────────────────────────

export function MatchStory({ view }: { view: MatchView }) {
  return (
    <Section id="story" title="Match story" description="Measured facts per phase. Phase edges sit on the game’s stat samples (9:00 and 20:00); souls leads are read at those samples.">
      <ol className="grid gap-4 lg:grid-cols-3">
        {view.story.map((phase, i) => (
          <Reveal as="li" key={phase.key} index={i} className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4 shadow-card">
            <header className="flex items-baseline justify-between gap-2">
              <h3 className="font-display text-title font-bold text-text uppercase">{phase.label}</h3>
              <span className="text-caption text-text-muted tabular">
                {formatDuration(phase.from)}–{formatDuration(phase.to)}
              </span>
            </header>
            <ul className="flex flex-col gap-2 text-sm text-text">
              {phase.facts.map((fact) => (
                <li key={fact} className="flex gap-2">
                  <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rotate-45 bg-steel" />
                  {fact}
                </li>
              ))}
            </ul>
          </Reveal>
        ))}
      </ol>
      {(view.leadChanges.length > 0 || view.biggestSwing) && (
        <p className="text-sm text-text-muted">
          {view.leadChanges.length === 0
            ? 'The souls lead never changed hands between samples.'
            : `The souls lead changed hands ${view.leadChanges.length} ${view.leadChanges.length === 1 ? 'time' : 'times'} (${view.leadChanges.map((c) => `${SIDE_LABEL[c.to]} at ${formatDuration(c.t)}`).join(', ')}).`}{' '}
          {view.biggestSwing &&
            `Largest swing: ${SIDE_LABEL[view.biggestSwing.side]} gained ${formatCompact(view.biggestSwing.amount)} souls of lead between ${formatDuration(view.biggestSwing.from)} and ${formatDuration(view.biggestSwing.to)}.`}
        </p>
      )}
    </Section>
  )
}

// ── 2. Team comparison ───────────────────────────────────────────────

const COMPARE: Array<[keyof Omit<TeamTotals, 'side'>, string]> = [
  ['kills', 'Kills'],
  ['deaths', 'Deaths'],
  ['assists', 'Assists'],
  ['netWorth', 'Souls'],
  ['lastHits', 'Last hits'],
  ['denies', 'Denies'],
  ['damage', 'Hero damage'],
  ['healing', 'Healing'],
  ['objectives', 'Objectives destroyed'],
  ['midBoss', 'Mid-Boss claimed'],
]

export function TeamComparison({ view }: { view: MatchView }) {
  const [a, b] = view.teams
  return (
    <Section id="teams" title="Team comparison" description="Totals at the end of the match.">
      <div className="rounded-md border border-border bg-surface p-(--spacing-card)">
        <div className="mb-3 grid grid-cols-[1fr_8rem_1fr] text-eyebrow max-sm:grid-cols-[1fr_6rem_1fr]">
          <span className={TEAM_TEXT[0]}>Team 1</span>
          <span className="text-center">Metric</span>
          <span className={cx('text-right', TEAM_TEXT[1])}>Team 2</span>
        </div>
        <ul className="flex flex-col gap-2.5">
          {COMPARE.map(([key, label], i) => {
            const total = a[key] + b[key]
            const share = total > 0 ? a[key] / total : 0.5
            return (
              <li key={key} className="grid grid-cols-[1fr_8rem_1fr] items-center gap-2 max-sm:grid-cols-[1fr_6rem_1fr]">
                <span className="flex items-center justify-end gap-2">
                  <span className="font-ui text-sm text-text tabular">{key === 'netWorth' || key === 'damage' || key === 'healing' ? formatCompact(a[key]) : formatInteger(a[key])}</span>
                  <span aria-hidden="true" className="h-2 w-24 overflow-hidden rounded-pill bg-surface-sunken max-sm:w-12">
                    <span className={cx('ml-auto block h-full origin-right animate-grow rounded-pill', TEAM_BG[0])} style={{ width: `${share * 100}%`, animationDelay: `${i * 40}ms` }} />
                  </span>
                </span>
                <span className="text-center text-caption text-text-muted">{label}</span>
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-2 w-24 overflow-hidden rounded-pill bg-surface-sunken max-sm:w-12">
                    <span className={cx('block h-full origin-left animate-grow rounded-pill', TEAM_BG[1])} style={{ width: `${(1 - share) * 100}%`, animationDelay: `${i * 40}ms` }} />
                  </span>
                  <span className="font-ui text-sm text-text tabular">{key === 'netWorth' || key === 'damage' || key === 'healing' ? formatCompact(b[key]) : formatInteger(b[key])}</span>
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </Section>
  )
}

// ── 3. Players ───────────────────────────────────────────────────────

export function PlayersSection({ view }: { view: MatchView }) {
  return (
    <Section id="players" title="Players" description="Final values. Names are public Steam names where available.">
      <div className="grid gap-4 xl:grid-cols-2">
        {([0, 1] as const).map((side) => (
          <div key={side}>
          {/* Phones: one card per player (identity, K/D/A, souls first). The table starts at sm. */}
          <ul aria-label={`${SIDE_LABEL[side]} players`} className="flex flex-col divide-y divide-border rounded-md border border-border sm:hidden">
            <li className={cx('px-3 py-2 text-eyebrow', TEAM_TEXT[side])}>{SIDE_LABEL[side]}{view.winner === side ? ' · won' : view.winner !== null ? ' · lost' : ''}</li>
            {view.players.filter((p) => p.side === side).map((p) => (
              <li key={p.slot} className="flex flex-col gap-1 px-3 py-2.5">
                <span className="flex items-center gap-3">
                  <span className="min-w-0 flex-1"><PlayerCell p={p} /></span>
                  <span className="text-right font-ui text-sm text-text tabular">{p.kills}/{p.deaths}/{p.assists}<span className="block text-caption text-text-muted">{formatCompact(p.netWorth)} souls</span></span>
                </span>
                <span className="text-caption text-text-muted tabular">LH/DN {p.lastHits}/{p.denies} · Damage {formatCompact(p.damage)} · Level {p.level}</span>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-md border border-border sm:block">
            <table className="w-full font-ui text-sm">
              <caption className={cx('px-3 py-2 text-left text-eyebrow', TEAM_TEXT[side])}>
                {SIDE_LABEL[side]}{view.winner === side ? ' · won' : view.winner !== null ? ' · lost' : ''}
              </caption>
              <thead className="bg-surface text-eyebrow">
                <tr className="border-y border-border">
                  <th scope="col" className="px-3 py-2 text-left">Player</th>
                  <th scope="col" className="px-2 py-2 text-right">K/D/A</th>
                  <th scope="col" className="px-2 py-2 text-right">Souls</th>
                  <th scope="col" className="px-2 py-2 text-right">LH/DN</th>
                  <th scope="col" className="px-2 py-2 text-right">Damage</th>
                  <th scope="col" className="px-3 py-2 text-right">Lvl</th>
                </tr>
              </thead>
              <tbody>
                {view.players.filter((p) => p.side === side).map((p) => (
                  <tr key={p.slot} className="border-b border-border/70 last:border-b-0 hover:bg-surface-raised/50">
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      <PlayerCell p={p} />
                    </th>
                    <td className="px-2 py-2 text-right text-text tabular">{p.kills}/{p.deaths}/{p.assists}</td>
                    <td className="px-2 py-2 text-right text-text tabular">{formatCompact(p.netWorth)}</td>
                    <td className="px-2 py-2 text-right text-text-muted tabular">{p.lastHits}/{p.denies}</td>
                    <td className="px-2 py-2 text-right text-text-muted tabular">{formatCompact(p.damage)}</td>
                    <td className="px-3 py-2 text-right text-text-muted tabular">{p.level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

export function PlayerCell({ p }: { p: PlayerView }) {
  return (
    <span className="flex items-center gap-2">
      <HeroPortrait name={p.hero.name} src={p.hero.iconUrl ?? undefined} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-text">{p.name ?? `Player ${p.accountId}`}</span>
        <span className="block truncate text-caption text-text-muted">{p.hero.name}</span>
      </span>
    </span>
  )
}

// ── 4. Hero lineup ───────────────────────────────────────────────────

export function HeroLineup({ view }: { view: MatchView }) {
  return (
    <Section id="lineup" title="Hero lineup" description="Heroes by team and assigned lane.">
      <div className="grid gap-4 lg:grid-cols-2">
        {([0, 1] as const).map((side) => (
          <ul key={side} aria-label={`${SIDE_LABEL[side]} heroes`} className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {view.players.filter((p) => p.side === side).sort((x, y) => (x.lane ?? 9) - (y.lane ?? 9)).map((p, i) => (
              <Reveal as="li" key={p.slot} index={i} className="flex flex-col items-center gap-1 rounded-sm border border-border bg-surface p-2 text-center">
                <HeroPortrait name={p.hero.name} src={p.hero.iconUrl ?? undefined} size="md" />
                {p.hero.slug ? (
                  <Link href={`/heroes/${p.hero.slug}`} className="text-caption font-semibold text-text hover:text-highlight pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:items-center">{p.hero.name}</Link>
                ) : (
                  <span className="text-caption font-semibold text-text">{p.hero.name}</span>
                )}
                <span className={cx('text-caption', TEAM_TEXT[side])}>{p.lane ? `Lane ${p.lane}` : 'No lane'}</span>
                {p.pregameHero && <span className="text-caption text-text-muted">Swapped from {p.pregameHero.name}</span>}
              </Reveal>
            ))}
          </ul>
        ))}
      </div>
      {view.banned.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
          Banned: {view.banned.map((h) => <HeroPortrait key={h.id} name={h.name} src={h.iconUrl ?? undefined} size="sm" />)}
        </p>
      )}
    </Section>
  )
}

// ── 6. Builds ────────────────────────────────────────────────────────

export function BuildsSection({ view }: { view: MatchView }) {
  return (
    <Section id="builds" title="Builds" description="Every shop item each player bought, in order. Faded = sold before the match ended.">
      <div className="grid gap-3 xl:grid-cols-2">
        {view.players.map((p) => (
          <div key={p.slot} className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <PlayerCell p={p} />
              {p.buildId && p.hero.slug && (
                <Link href={`/builds/${p.hero.slug}/${p.buildId}`} className="shrink-0 text-caption font-semibold text-primary hover:text-highlight">
                  Build selected at start →
                </Link>
              )}
            </div>
            <ul className="flex flex-wrap gap-1" aria-label={`${p.hero.name} purchases`}>
              {p.purchases.map((b, i) => (
                <li key={`${b.item.id}-${i}`} className={cx('animate-scale-in', b.soldAt !== null && 'opacity-40')} style={{ animationDelay: `${Math.min(i, 24) * 30}ms` }} title={`${b.item.name} at ${formatDuration(b.t)}${b.soldAt !== null ? `, sold at ${formatDuration(b.soldAt)}` : ''}`}>
                  <ItemIcon name={b.item.name ?? 'Item'} src={b.item.icon} slot={b.item.slot} tier={b.item.tier} size={28} />
                  {b.soldAt !== null && <span className="sr-only">(sold)</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ── 7. Performance ───────────────────────────────────────────────────

const PERF: Array<[keyof Pick<PlayerView, 'damage' | 'netWorth' | 'healing' | 'objectiveDamage' | 'damageTaken'>, string]> = [
  ['damage', 'Hero damage'],
  ['netWorth', 'Souls'],
  ['objectiveDamage', 'Objective damage'],
  ['healing', 'Healing'],
  ['damageTaken', 'Damage taken'],
]

export function PerformanceSection({ view }: { view: MatchView }) {
  return (
    <Section id="performance" title="Performance" description="Each player’s share of the match maximum for that metric.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PERF.map(([key, label]) => {
          const ranked = [...view.players].sort((x, y) => y[key] - x[key])
          const max = ranked[0]?.[key] || 1
          return (
            <div key={key} className="rounded-md border border-border bg-surface p-4">
              <h3 className="mb-3 text-eyebrow">{label}</h3>
              <ol className="flex flex-col gap-1.5">
                {ranked.map((p, i) => (
                  <li key={p.slot} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-2 text-caption">
                    <span className="truncate text-text">{p.hero.name}</span>
                    <span aria-hidden="true" className="h-1.5 rounded-pill bg-surface-sunken">
                      <span className={cx('block h-full origin-left animate-grow rounded-pill', TEAM_BG[p.side])} style={{ width: `${(p[key] / max) * 100}%`, animationDelay: `${i * 25}ms` }} />
                    </span>
                    <span className="text-right text-text-muted tabular">{formatCompact(p[key])}</span>
                  </li>
                ))}
              </ol>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// ── 10. Advanced data ────────────────────────────────────────────────

export function AdvancedData({ view }: { view: MatchView }) {
  return (
    <Section id="advanced" title="Advanced data" description="The measured values behind this page, as tables.">
      <details className="rounded-md border border-border bg-surface px-(--spacing-card) py-4">
        <summary className="cursor-pointer py-3 font-ui text-sm font-semibold text-primary hover:text-highlight">Souls per player at each sample</summary>
        <ScrollRegion label="Souls per player at each sample" className="mt-3">
          <table className="w-full font-ui text-caption">
            <caption className="sr-only">Souls per player at each sample time</caption>
            <thead className="text-eyebrow">
              <tr>
                <th scope="col" className="px-2 py-1.5 text-left">Player</th>
                {view.times.slice(1).map((t) => (
                  <th key={t} scope="col" className="px-2 py-1.5 text-right tabular">{formatDuration(t)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.players.map((p) => (
                <tr key={p.slot} className="border-t border-border">
                  <th scope="row" className={cx('px-2 py-1.5 text-left font-normal', TEAM_TEXT[p.side])}>{p.hero.name}</th>
                  {view.times.slice(1).map((t) => (
                    <td key={t} className="px-2 py-1.5 text-right text-text tabular">{formatInteger(p.ticks.find((k) => k.t === t)?.netWorth ?? 0)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </details>
      <p className="text-caption text-text-muted">
        Source: <a className="text-text underline decoration-steel hover:decoration-primary" href={`https://api.deadlock-api.com/v1/matches/${view.id}/metadata?disable_steam=true`} rel="noopener noreferrer">deadlock-api.com match metadata (JSON)</a>. Stats are sampled every 3 minutes until 15:00, then every 5 minutes, plus the final moment.
      </p>
    </Section>
  )
}
